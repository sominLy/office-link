// 웹푸시 발송 함수
// - action "clock_in": 출근한 사람을 제외한 오피스 멤버 전원에게 푸시
// - action "nudge": (pg_cron이 10분마다 호출) 근무 시작 시간이 지났는데 미출근인 사용자에게 하루 1회 푸시
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

async function sendTo(userIds: string[], title: string, body: string) {
  if (userIds.length === 0) return;
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', userIds);
  await Promise.all((subs || []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body }),
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const payload = await req.json().catch(() => ({}));

  if (payload.action === 'clock_in') {
    const { office_id, actor_id } = payload;
    if (!office_id || !actor_id) return new Response('bad request', { status: 400, headers: cors });
    const { data: actor } = await supabase.from('profiles').select('nickname').eq('id', actor_id).single();
    const { data: members } = await supabase
      .from('office_members').select('user_id')
      .eq('office_id', office_id).neq('user_id', actor_id);
    await sendTo(
      (members || []).map((m) => m.user_id),
      `${actor?.nickname || '멤버'}님이 출근했어요 👋`,
      '오피스에서 함께 달려봐요!',
    );
    return new Response('ok', { headers: cors });
  }

  if (payload.action === 'cheer') {
    const { target_id, actor_id, emoji, task_title } = payload;
    if (!target_id || !actor_id || target_id === actor_id) return new Response('ok', { headers: cors });
    const { data: actor } = await supabase.from('profiles').select('nickname').eq('id', actor_id).single();
    await sendTo(
      [target_id],
      `${actor?.nickname || '멤버'}님이 ${emoji || '👍'} 응원을 보냈어요!`,
      task_title ? `"${task_title}" 화이팅!` : '오늘도 화이팅!',
    );
    return new Response('ok', { headers: cors });
  }

  if (payload.action === 'feed') {
    // 게시글/인사 푸시: target이 있으면 그 사람에게만, 없으면 오피스 전체(작성자 제외)
    const { office_id, actor_id, target_id, kind, content, emoji } = payload;
    if (!office_id || !actor_id) return new Response('bad request', { status: 400, headers: cors });
    const { data: actor } = await supabase.from('profiles').select('nickname').eq('id', actor_id).single();
    const name = actor?.nickname || '멤버';

    let title = '';
    let body = '';
    if (kind === 'wave') {
      title = `${name}님이 반갑다고 인사해요 ${emoji || '👋'}`;
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
    await sendTo(recipients, title, body);
    return new Response('ok', { headers: cors });
  }

  if (payload.action === 'announce') {
    // 기능 업데이트 공지: 모든 오피스 소식 탭에 게시 + 전 멤버 푸시
    // GitHub Actions가 배포 시 호출한다 (비밀키 검증)
    if (!payload.secret || payload.secret !== Deno.env.get('ANNOUNCE_SECRET')) {
      return new Response('unauthorized', { status: 401, headers: cors });
    }
    const message = (payload.message || '').trim();
    if (!message) return new Response('empty', { status: 400, headers: cors });

    const { data: offices } = await supabase.from('offices').select('id');
    for (const o of offices || []) {
      const { data: admin } = await supabase
        .from('office_members').select('user_id')
        .eq('office_id', o.id).eq('role', 'admin').limit(1).maybeSingle();
      if (!admin) continue;
      await supabase.from('office_feed').insert({
        office_id: o.id,
        user_id: admin.user_id,
        type: 'post',
        content: message,
      });
      const { data: members } = await supabase
        .from('office_members').select('user_id').eq('office_id', o.id);
      await sendTo(
        (members || []).map((m) => m.user_id),
        '연결오피스가 업데이트됐어요 ✨',
        message.length > 80 ? message.slice(0, 80) + '…' : message,
      );
    }
    return new Response('ok', { headers: cors });
  }

  if (payload.action === 'midnight_clockout') {
    // 매일 자정(KST)에 실행: 열려 있는 근무 세션을 전부 자동 퇴근 처리
    const now = new Date().toISOString();
    const { data: openSessions } = await supabase
      .from('work_sessions')
      .select('id, user_id, office_id')
      .is('ended_at', null);
    if (!openSessions || openSessions.length === 0) return new Response('ok', { headers: cors });

    const userIds = [...new Set(openSessions.map((s) => s.user_id))];
    // 근무·집중·상태 세션 모두 종료
    await supabase.from('work_sessions').update({ ended_at: now }).is('ended_at', null);
    await supabase.from('focus_sessions').update({ ended_at: now }).is('ended_at', null);
    await supabase.from('status_sessions').update({ ended_at: now }).is('ended_at', null);
    // 소식 피드에 퇴근 기록
    await supabase.from('office_feed').insert(
      openSessions.map((s) => ({ office_id: s.office_id, user_id: s.user_id, type: 'clock_out' })),
    );
    // 당사자들에게 안내 푸시
    await sendTo(
      userIds,
      '자정이 지나 자동 퇴근됐어요 🌙',
      '아직 일하고 계신다면 출근 버튼을 다시 눌러주세요! 무리하진 말고요 💛',
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
      await sendTo([p.id], '오늘 일 안 하나요? 👀', `설정한 근무 시작 시간(${(p.work_start as string).slice(0, 5)})이 지났어요. 출근 버튼이 기다리고 있어요!`);
      await supabase.from('profiles').update({ last_nudged_on: kstToday }).eq('id', p.id);
    }
    return new Response('ok', { headers: cors });
  }

  return new Response('noop', { headers: cors });
});
