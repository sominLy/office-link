// 웹푸시 발송 함수
// - action "clock_in": 출근한 사람을 제외한 오피스 멤버 전원에게 푸시
// - action "nudge": (pg_cron이 10분마다 호출) 근무 시작 시간이 지났는데 미출근인 사용자에게 하루 1회 푸시
//                   + 각자 정한 주간 회고 시간이 지나면 "회고 도착" 푸시 (주 1회)
// - action "announce" / "announce_poll": [공지] 커밋을 업데이트 공지로 게시 + 전원 푸시
// - action "study": 모임(024 study_rooms)을 연 사람을 제외한 오피스 멤버 전원에게 푸시
// - action "feedback" / "feedback_reply": 의견·문의(025)가 오면 운영자에게, 답변하면 보낸 사람에게 푸시
// 사용자 액션은 전부 '방금 생긴 근거 행'(근무 세션·소식 글·응원·방·문의)이 있어야 보낸다. 글을 올리지 않고
// 함수만 되풀이해 부르거나, 같은 행으로 되풀이해 부르는 것을 막는다. 크론 액션은 CRON_SECRET이 있으면 헤더로 확인한다.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@office-link.app',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 이 함수는 Verify JWT를 끈 채 배포한다(크론이 토큰 없이 부른다). 그래서 주소만 알면 누구나 부를 수 있고,
// 사용자 액션은 여기서 직접 확인하지 않으면 남의 이름으로 푸시를 보낼 수 있다.
// 앱은 supabase.functions.invoke로 부르므로 로그인한 사람의 토큰이 Authorization에 실려 온다.
async function callerId(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data.user?.id ?? null;
}

async function isMember(officeId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('office_members').select('user_id')
    .eq('office_id', officeId).eq('user_id', userId).maybeSingle();
  return !!data;
}

const USER_ACTIONS = new Set(['clock_in', 'cheer', 'feed', 'study']);
// 오피스와 무관한 사용자 액션. 본인 확인과 횟수 제한은 같지만 오피스 멤버 검사는 하지 않는다.
const ACCOUNT_ACTIONS = new Set(['feedback', 'feedback_reply']);
// 크론만 부르는 액션. CRON_SECRET이 설정돼 있으면 x-cron-secret 헤더가 맞아야 한다.
// 비밀값이 없는 동안은 예전처럼 열어 둔다 — 설정 전에 크론이 멈추면 자정 퇴근·회고 푸시가 끊긴다.
const CRON_ACTIONS = new Set(['nudge', 'announce_poll', 'midnight_clockout']);
// 근거 행이 이보다 오래됐으면 푸시를 보내지 않는다 (같은 행으로 되풀이해 부르는 것을 막는다)
const FRESH_MS = 2 * 60_000;
const isFresh = (iso: unknown) => typeof iso === 'string' && Date.now() - new Date(iso).getTime() < FRESH_MS;

// 길이가 달라도 같은 시간이 걸리게 비교한다
function sameSecret(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

// 이 오피스에서 쓰는 이름. 023의 오피스별 이름이 있으면 그것, 없으면 프로필 이름.
// 공개 오피스에서 가명으로 들어온 사람의 본명이 푸시 제목에 실리면 안 된다.
async function nameIn(officeId: string | null, userId: string): Promise<string> {
  if (officeId) {
    const { data: m } = await supabase.from('office_members').select('nickname')
      .eq('office_id', officeId).eq('user_id', userId).maybeSingle();
    if (m?.nickname) return m.nickname as string;
  }
  const { data: p } = await supabase.from('profiles').select('nickname').eq('id', userId).maybeSingle();
  return (p?.nickname as string) || '멤버';
}
// 응원 이모지는 그림 문자 하나·둘만 (아무 글자나 실어 보내지 못하게)
const pickEmoji = (v: unknown, fallback: string) =>
  typeof v === 'string' && /^\p{Extended_Pictographic}{1,2}$/u.test(v) ? v : fallback;
// 앱이 보낸 글자는 코드포인트 기준으로 자른다
const clip = (v: unknown, n: number) => [...(typeof v === 'string' ? v : '')].slice(0, n).join('');

async function sendTo(userIds: string[], title: string, body: string, tag = 'office-link', url = '/') {
  const uniqueIds = [...new Set(userIds)]; // 여러 오피스 중복 수신 방지
  if (uniqueIds.length === 0) return;
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', uniqueIds);
  // 같은 기기(endpoint)가 두 번 조회돼도 한 번만 발송
  const seen = new Set<string>();
  const unique = (subs || []).filter((s) => (seen.has(s.endpoint) ? false : (seen.add(s.endpoint), true)));
  await Promise.all(unique.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        // tag를 넘기면 같은 종류 알림이 쌓이지 않고 하나로 갱신된다 (스팸 필터 완화)
        // url: 알림을 누르면 열 화면
        JSON.stringify({ title, body, tag, url }),
        // 응답하지 않는 주소(가짜 구독)에 매달리면 다음 사람들의 푸시까지 늦어진다
        { timeout: 5000, TTL: 3600 },
      );
    } catch (e) {
      // 만료된 구독은 정리
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      }
    }
  }));
}

/**
 * 업데이트 공지 게시: announcements 테이블에 한 번만 저장(커밋 sha 기준) + 사람마다 1회 푸시.
 * GitHub Actions와 크론 폴링이 같은 커밋을 동시에 처리해도 sha unique 제약 덕분에 한 번만 나간다.
 * 017 마이그레이션 전(테이블 없음)이면 예전처럼 오피스마다 방장 이름의 게시글로 남긴다.
 */
async function publishAnnouncement(message: string, sha?: string): Promise<'posted' | 'duplicate' | 'legacy'> {
  const { error } = await supabase.from('announcements').insert({ message, sha: sha ?? null });
  if (error?.code === '23505') return 'duplicate';
  const legacy = !!error;

  const recipients = new Set<string>();
  if (legacy) {
    const { data: offices } = await supabase.from('offices').select('id');
    for (const o of offices || []) {
      const { data: admin } = await supabase
        .from('office_members').select('user_id')
        .eq('office_id', o.id).eq('role', 'admin').limit(1).maybeSingle();
      if (!admin) continue;
      await supabase.from('office_feed').insert({ office_id: o.id, user_id: admin.user_id, type: 'post', content: message });
    }
  }
  const { data: members } = await supabase.from('office_members').select('user_id');
  (members || []).forEach((m) => recipients.add(m.user_id));
  // 푸시는 사람 기준으로 딱 한 번만 (여러 오피스 소속이어도 1회)
  await sendTo(
    [...recipients],
    '연결오피스가 업데이트됐어요 ✨',
    message.length > 80 ? message.slice(0, 80) + '…' : message,
    'announce',
    '/feed',
  );
  return legacy ? 'legacy' : 'posted';
}

// 한국시간 날짜 계산 (YYYY-MM-DD 문자열, UTC 자정 기준 연산이라 시간대 영향 없음)
function addDaysStr(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
function weekStartStr(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 월=0
  return addDaysStr(date, -dow);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const payload = await req.json().catch(() => ({}));

  // 보낸 사람이 본인이고, 보낸 사람과 받는 사람이 모두 그 오피스 멤버일 때만 사용자 액션을 처리한다
  if (USER_ACTIONS.has(payload.action) || ACCOUNT_ACTIONS.has(payload.action)) {
    const uid = await callerId(req);
    if (!uid || uid !== payload.actor_id) return new Response('unauthorized', { status: 401, headers: cors });
    if (USER_ACTIONS.has(payload.action)) {
      if (!payload.office_id || !(await isMember(payload.office_id, uid))) {
        return new Response('forbidden', { status: 403, headers: cors });
      }
      if (payload.target_id && !(await isMember(payload.office_id, payload.target_id))) {
        return new Response('forbidden', { status: 403, headers: cors });
      }
    }
    // 한 사람이 10분에 20번까지. 먼저 적고 센다 — 동시에 200번 보내도 세는 시점에 이미 적혀 있다.
    // 기록이 안 되면 보내지 않는다 (022의 push_log가 없으면 멈춘다. 공개 전에 022는 적용돼 있다).
    const { error: logError } = await supabase.from('push_log').insert({ actor_id: uid });
    const { count, error: countError } = await supabase.from('push_log').select('*', { count: 'exact', head: true })
      .eq('actor_id', uid).gte('at', new Date(Date.now() - 600_000).toISOString());
    if (logError || countError) return new Response('rate limit unavailable', { status: 503, headers: cors });
    if ((count ?? 99) > 20) return new Response('too many', { status: 429, headers: cors });
  }

  if (CRON_ACTIONS.has(payload.action)) {
    const want = Deno.env.get('CRON_SECRET');
    if (want && !sameSecret(req.headers.get('x-cron-secret') ?? '', want)) {
      return new Response('unauthorized', { status: 401, headers: cors });
    }
  }

  if (payload.action === 'clock_in') {
    const { office_id, actor_id } = payload;
    if (!office_id || !actor_id) return new Response('bad request', { status: 400, headers: cors });
    // 근거: 방금(2분 안에) 연 근무 세션. 출근하지 않고 함수만 되풀이해 불러 전원을 깨우지 못하게.
    const { data: session } = await supabase.from('work_sessions').select('started_at')
      .eq('office_id', office_id).eq('user_id', actor_id).is('ended_at', null)
      .order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (!session || !isFresh(session.started_at)) return new Response('no recent clock-in', { status: 403, headers: cors });
    const name = await nameIn(office_id, actor_id);
    const { data: members } = await supabase
      .from('office_members').select('user_id')
      .eq('office_id', office_id).neq('user_id', actor_id);
    await sendTo(
      (members || []).map((m) => m.user_id),
      `${name}님이 출근했어요 👋`,
      '오피스에서 함께 달려봐요!',
      `clockin-${office_id}`,
    );
    return new Response('ok', { headers: cors });
  }

  if (payload.action === 'cheer') {
    const { office_id, target_id, actor_id, task_id } = payload;
    const emoji = pickEmoji(payload.emoji, '👍');
    if (!target_id || !actor_id || target_id === actor_id) return new Response('ok', { headers: cors });
    // 근거: 상대의 할 일에 방금 남긴 응원. 제목은 앱이 보낸 글이 아니라 DB의 할 일에서 읽는다.
    if (!task_id) return new Response('bad request', { status: 400, headers: cors });
    const { data: task } = await supabase.from('tasks').select('title, user_id, office_id, is_private')
      .eq('id', task_id).maybeSingle();
    if (!task || task.user_id !== target_id || task.office_id !== office_id || task.is_private) {
      return new Response('forbidden', { status: 403, headers: cors });
    }
    const { data: reaction } = await supabase.from('task_reactions').select('created_at')
      .eq('task_id', task_id).eq('user_id', actor_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!reaction || !isFresh(reaction.created_at)) return new Response('no recent reaction', { status: 403, headers: cors });
    const { data: off } = await supabase.from('offices').select('is_public').eq('id', office_id).maybeSingle();
    const task_title = off?.is_public ? '' : clip(task.title, 60);
    const name = await nameIn(office_id, actor_id);
    await sendTo(
      [target_id],
      `${name}님이 ${emoji} 응원을 보냈어요!`,
      task_title ? `"${task_title}" 화이팅!` : '오늘도 화이팅!',
      'cheer',
    );
    return new Response('ok', { headers: cors });
  }

  if (payload.action === 'feed') {
    // 게시글/인사 푸시: target이 있으면 그 사람에게만, 없으면 오피스 전체(작성자 제외)
    // 종류·대상·본문은 앱이 보낸 값이 아니라 방금 올린 소식 행(feed_id)에서 읽는다.
    // 글을 올리지 않고 함수만 되풀이해 불러 전원을 깨우는 것을 막는다.
    const { office_id, actor_id, feed_id } = payload;
    if (!office_id || !actor_id || !feed_id) return new Response('bad request', { status: 400, headers: cors });
    const { data: row } = await supabase.from('office_feed').select('type, target_user_id, content, emoji, created_at')
      .eq('id', feed_id).eq('office_id', office_id).eq('user_id', actor_id).maybeSingle();
    if (!row || !isFresh(row.created_at) || (row.type !== 'post' && row.type !== 'wave')) {
      return new Response('no recent feed row', { status: 403, headers: cors });
    }
    const kind = row.type;
    const target_id = row.target_user_id as string | null;
    if (target_id && !(await isMember(office_id, target_id))) return new Response('forbidden', { status: 403, headers: cors });
    const emoji = pickEmoji(row.emoji, '👋');
    // 공개 오피스 푸시에는 남이 쓴 문구를 싣지 않는다 (화면의 금지어·링크 검사는 함수를 직접 부르면 건너뛴다)
    const { data: off } = await supabase.from('offices').select('is_public').eq('id', office_id).maybeSingle();
    const content = off?.is_public ? '' : clip(row.content, 200);
    const name = await nameIn(office_id, actor_id);

    let title = '';
    let body = '';
    if (kind === 'wave') {
      title = `${name}님이 반갑다고 인사해요 ${emoji}`;
      body = '나도 인사를 돌려줘 볼까요?';
    } else if (target_id) {
      title = `${name}님이 나에게 응원을 남겼어요 💌`;
      body = content ? `"${content}"` : '';
    } else {
      title = `${name}님이 게시판에 글을 남겼어요 📌`;
      body = content ? `"${content}"` : '';
    }

    let recipients: string[] = [];
    if (target_id) {
      recipients = target_id === actor_id ? [] : [target_id];
    } else {
      const { data: members } = await supabase
        .from('office_members').select('user_id')
        .eq('office_id', office_id).neq('user_id', actor_id);
      recipients = (members || []).map((m) => m.user_id);
    }
    await sendTo(recipients, title, body, kind === 'wave' ? 'wave' : 'feed');
    return new Response('ok', { headers: cors });
  }

  if (payload.action === 'study') {
    // 모임 열림 푸시. 제목·시작 시각은 앱이 보낸 값이 아니라 DB의 방 행에서 읽는다.
    // 방이 없거나(024 미적용 포함) 다른 오피스·다른 사람의 방이면 보내지 않는다.
    const { office_id, actor_id, room_id } = payload;
    if (!office_id || !actor_id || !room_id) return new Response('bad request', { status: 400, headers: cors });
    const { data: room } = await supabase
      .from('study_rooms').select('title, office_id, host_id, starts_at, ended_at, created_at')
      .eq('id', room_id).maybeSingle();
    if (!room || room.office_id !== office_id || room.host_id !== actor_id || room.ended_at || !isFresh(room.created_at)) {
      return new Response('forbidden', { status: 403, headers: cors });
    }
    // 공개 오피스 푸시에는 남이 쓴 문구를 싣지 않는다 (feed와 같은 규칙)
    const { data: off } = await supabase.from('offices').select('is_public').eq('id', office_id).maybeSingle();
    const title = off?.is_public ? '' : clip(room.title, 40);
    const name = await nameIn(office_id, actor_id);
    // 예정 방이면 시작 시각을 KST로 적는다
    const startsMs = new Date(room.starts_at as string).getTime();
    const upcoming = startsMs - Date.now() > 60_000;
    const when = upcoming
      ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' }).format(new Date(startsMs)) + ' 시작 · '
      : '';
    const body = `${when}${title ? `"${title}" · ` : ''}홈에서 바로 들어갈 수 있어요`;
    const { data: members } = await supabase
      .from('office_members').select('user_id')
      .eq('office_id', office_id).neq('user_id', actor_id);
    await sendTo(
      (members || []).map((m) => m.user_id),
      `${name}님이 얼굴 보며 같이 하자고 해요 📹`,
      body,
      `study-${office_id}`,
    );
    return new Response('ok', { headers: cors });
  }

  if (payload.action === 'feedback') {
    // 의견·문의 도착 푸시 → 운영자(019의 app_admins) 전원. 본문은 앱이 보낸 값이 아니라 DB의 글에서 읽는다.
    const { actor_id, feedback_id } = payload;
    if (!feedback_id) return new Response('bad request', { status: 400, headers: cors });
    const { data: fb } = await supabase
      .from('feedback').select('user_id, kind, message, created_at')
      .eq('id', feedback_id).maybeSingle();
    if (!fb || fb.user_id !== actor_id || !isFresh(fb.created_at)) return new Response('forbidden', { status: 403, headers: cors });
    const { data: admins } = await supabase.from('app_admins').select('user_id');
    const recipients = (admins || []).map((a) => a.user_id).filter((id) => id !== actor_id);
    const title = ({
      idea: '새 의견이 도착했어요 💡',
      question: '새 문의가 도착했어요 ❓',
      bug: '버그 제보가 도착했어요 🐛',
    } as Record<string, string>)[fb.kind as string] ?? '새 메시지가 도착했어요 💬';
    await sendTo(recipients, title, clip(fb.message, 80), 'feedback', '/admin?tab=feedback');
    return new Response('ok', { headers: cors });
  }

  if (payload.action === 'feedback_reply') {
    // 답변 푸시 → 글을 보낸 사람. 부른 사람이 운영자일 때만.
    const { actor_id, feedback_id } = payload;
    if (!feedback_id) return new Response('bad request', { status: 400, headers: cors });
    const { data: admin } = await supabase
      .from('app_admins').select('user_id').eq('user_id', actor_id).maybeSingle();
    if (!admin) return new Response('forbidden', { status: 403, headers: cors });
    const { data: fb } = await supabase
      .from('feedback').select('user_id, reply, status, notify_on_done, replied_at')
      .eq('id', feedback_id).maybeSingle();
    if (!fb) return new Response('not found', { status: 404, headers: cors });
    if (fb.user_id === actor_id) return new Response('ok', { headers: cors });
    if (!isFresh(fb.replied_at)) return new Response('no recent reply', { status: 403, headers: cors });
    const reply = clip(fb.reply, 80);
    if (fb.status === 'applied') {
      // 바란 것이 앱에 들어갔다. 알려 달라고 한 사람에게만, 홈을 열게.
      if (fb.notify_on_done === false) return new Response('ok', { headers: cors });
      await sendTo(
        [fb.user_id],
        '문의하신 내용이 업데이트됐어요 🎉',
        reply ? `${reply} · 바로 확인해 보세요` : '바로 확인해 보시겠어요?',
        'feedback-reply',
        '/',
      );
      return new Response('ok', { headers: cors });
    }
    await sendTo(
      [fb.user_id],
      '보낸 의견에 답변이 왔어요 💌',
      reply || (fb.status === 'done' ? '확인했다고 표시했어요. 내 계정에서 볼 수 있어요' : '내 계정 → 의견·문의에서 볼 수 있어요'),
      'feedback-reply',
      '/profile',
    );
    return new Response('ok', { headers: cors });
  }

  if (payload.action === 'announce') {
    // 기능 업데이트 공지: GitHub Actions가 배포 시 호출한다 (비밀키 검증)
    const announceSecret = Deno.env.get('ANNOUNCE_SECRET') ?? '';
    if (!announceSecret || typeof payload.secret !== 'string' || !sameSecret(payload.secret, announceSecret)) {
      return new Response('unauthorized', { status: 401, headers: cors });
    }
    const message = (payload.message || '').trim();
    if (!message) return new Response('empty', { status: 400, headers: cors });
    const result = await publishAnnouncement(message, payload.sha || undefined);
    return new Response(result, { headers: cors });
  }

  if (payload.action === 'announce_poll') {
    // 10분마다 실행: GitHub의 새 커밋 중 [공지] 마커가 있으면 자동 게시
    const { data: state } = await supabase
      .from('app_state').select('value').eq('key', 'last_announced_sha').maybeSingle();
    const lastSha = state?.value;

    const ghRes = await fetch('https://api.github.com/repos/sominLy/office-link/commits?per_page=15', {
      headers: { 'User-Agent': 'office-link-announcer' },
    });
    if (!ghRes.ok) return new Response('github unavailable', { headers: cors });
    const commits = await ghRes.json() as { sha: string; commit: { message: string } }[];
    if (!Array.isArray(commits) || commits.length === 0) return new Response('ok', { headers: cors });

    // last_sha 이후의 새 커밋만 (오래된 것부터 처리)
    const newCommits: { sha: string; message: string }[] = [];
    for (const c of commits) {
      if (c.sha === lastSha) break;
      newCommits.unshift({ sha: c.sha, message: c.commit.message });
    }
    // 초기 실행(state 없음)이면 게시 없이 현재 위치만 기록
    if (!lastSha) {
      await supabase.from('app_state').upsert({ key: 'last_announced_sha', value: commits[0].sha });
      return new Response('initialized', { headers: cors });
    }

    for (const c of newCommits) {
      const line = c.message.split('\n').find((l) => l.includes('[공지]'));
      if (!line) continue;
      const message = line.replace(/.*\[공지\]\s*/, '').trim();
      if (!message) continue;
      await publishAnnouncement(message, c.sha);
    }
    await supabase.from('app_state').upsert({ key: 'last_announced_sha', value: commits[0].sha });
    return new Response(`processed ${newCommits.length}`, { headers: cors });
  }

  if (payload.action === 'midnight_clockout') {
    // 매일 자정(KST)에 실행: 열려 있는 근무 세션을 전부 자동 퇴근 처리
    // 크론만 부르는 액션이지만 주소가 열려 있다. 자정 직후 10분 동안만 동작하게 해서
    // 낮에 불러 전원을 퇴근시키는 일을 막는다. (자정에 남은 세션은 018의 DB 크론도 0시 1분에 닫는다)
    const kstClock = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date());
    if (kstClock > '00:10') return new Response('not midnight', { headers: cors });
    const now = new Date().toISOString();
    // 018의 DB 크론과 같은 범위: 오늘(KST) 0시 전에 시작한 것만 닫는다. 자정 직후에 출근한 사람과
    // 여러 날 이어지는 '휴가 중'은 그대로 둔다.
    const kstDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
    const todayStart = new Date(`${kstDay}T00:00:00+09:00`).toISOString();
    const { data: openSessions } = await supabase
      .from('work_sessions')
      .select('id, user_id, office_id')
      .is('ended_at', null)
      .lt('started_at', todayStart);
    if (!openSessions || openSessions.length === 0) return new Response('ok', { headers: cors });

    const userIds = [...new Set(openSessions.map((s) => s.user_id))];
    // 근무·집중·상태 세션 모두 종료
    await supabase.from('work_sessions').update({ ended_at: now }).is('ended_at', null).lt('started_at', todayStart);
    await supabase.from('focus_sessions').update({ ended_at: now }).is('ended_at', null).lt('started_at', todayStart);
    await supabase.from('status_sessions').update({ ended_at: now }).is('ended_at', null).lt('started_at', todayStart).neq('status', '휴가 중');
    // 소식 피드에 퇴근 기록
    await supabase.from('office_feed').insert(
      openSessions.map((s) => ({ office_id: s.office_id, user_id: s.user_id, type: 'clock_out' })),
    );
    // 당사자들에게 안내 푸시
    await sendTo(
      userIds,
      '자정이 지나 자동 퇴근됐어요 🌙',
      '아직 일하고 계신다면 출근 버튼을 다시 눌러주세요! 무리하진 말고요 💛',
      'midnight',
    );
    return new Response('ok', { headers: cors });
  }

  if (payload.action === 'nudge') {
    const now = new Date();
    const kstHM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
    const kstToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, work_start, last_nudged_on')
      .not('work_start', 'is', null);
    for (const p of profiles || []) {
      if (p.last_nudged_on === kstToday) continue;
      if ((p.work_start as string).slice(0, 5) > kstHM) continue;
      const { data: open } = await supabase
        .from('work_sessions').select('id')
        .eq('user_id', p.id)
        .gte('started_at', `${kstToday}T00:00:00+09:00`)
        .limit(1);
      if (open && open.length > 0) continue;
      await sendTo([p.id], '오늘 일 안 하나요? 👀', `설정한 근무 시작 시간(${(p.work_start as string).slice(0, 5)})이 지났어요. 출근 버튼이 기다리고 있어요!`, 'nudge');
      await supabase.from('profiles').update({ last_nudged_on: kstToday }).eq('id', p.id);
    }

    // 주간 회고 도착 알림 — 각자 정한 요일·시간(기본 월 07:00)이 지나면 그 주에 한 번.
    // 월요일에 받으면 지난주, 다른 요일이면 그 주를 돌아본다. (016 마이그레이션 전이면 조용히 건너뜀)
    // - last_retro_pushed는 '여기까지 보냈다' 표시: 같거나 이전 주는 다시 보내지 않는다 (요일을 바꿔도 중복 없음)
    // - 도착 시각에서 12시간 넘게 지났으면 보내지 않고 표시만 (마이그레이션 직후·서버 지연 때 새벽 푸시 방지)
    const thisWeek = weekStartStr(kstToday);
    const nowMs = now.getTime();
    for (let from = 0; ; from += 1000) {
      // 1000명씩 나눠서 (Supabase 한 번 조회 최대 1000행)
      const { data: retroProfiles, error: retroError } = await supabase
        .from('profiles')
        .select('id, retro_day, retro_time, last_retro_pushed')
        .order('id')
        .range(from, from + 999);
      if (retroError || !retroProfiles) break;
      for (const p of retroProfiles) {
        const day = (p.retro_day as number | null) ?? 0;
        const time = ((p.retro_time as string | null) || '07:00').slice(0, 5);
        const deliveryDate = addDaysStr(thisWeek, day);
        const deliveryMs = new Date(`${deliveryDate}T${time}:00+09:00`).getTime();
        if (nowMs < deliveryMs) continue;
        const covered = day === 0 ? addDaysStr(thisWeek, -7) : thisWeek;
        const last = p.last_retro_pushed as string | null;
        if (last && last >= covered) continue;
        await supabase.from('profiles').update({ last_retro_pushed: covered }).eq('id', p.id);
        if (nowMs - deliveryMs > 12 * 3600 * 1000) continue;
        // 그 주에 한 번이라도 출근한 사람에게만 (쉬어간 주엔 조용히)
        const { data: worked } = await supabase
          .from('work_sessions').select('id')
          .eq('user_id', p.id)
          .gte('started_at', `${covered}T00:00:00+09:00`)
          .lt('started_at', `${addDaysStr(covered, 7)}T00:00:00+09:00`)
          .limit(1);
        if (!worked || worked.length === 0) continue;
        await sendTo(
          [p.id],
          '📬 주간 회고가 도착했어요',
          '한 주 동안 얼마나 열심히 살았는지 보고, 스스로를 듬뿍 칭찬해 줘요 💛 이번 주 상장도 기다리고 있어요!',
          'retro',
          `/retro?week=${covered}`,
        );
      }
      if (retroProfiles.length < 1000) break;
    }
    return new Response('ok', { headers: cors });
  }

  return new Response('noop', { headers: cors });
});
