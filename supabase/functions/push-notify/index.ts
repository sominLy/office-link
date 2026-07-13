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
