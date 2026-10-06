-- 자정 자동 퇴근을 DB 안에서 직접 처리
-- 지금까지는 크론이 인터넷으로 push-notify 함수를 불러서 퇴근시켰는데, 그 호출 경로(크론 작업·키·함수 설정)가
-- 하나라도 끊기면 아무도 퇴근 처리가 안 돼 '출근 26시간'처럼 남았다. 이제 DB 크론이 SQL로 직접 닫는다.
-- (push-notify의 midnight_clockout이 살아 있으면 그쪽이 먼저 0시에 닫고 푸시까지 보내고, 이 작업은 0시 1분에 남은 것만 정리)
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (여러 번 실행해도 안전)

create or replace function public.auto_clockout_stale_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 한국시간 오늘 0시
  today_start timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  closed_count integer;
begin
  -- 오늘 0시 전에 시작해서 아직 열린 근무 → 시작한 날의 자정(다음 날 0시)에 퇴근 처리 + 소식에 퇴근 기록
  with closed as (
    update public.work_sessions w
       set ended_at = (date_trunc('day', w.started_at at time zone 'Asia/Seoul') + interval '1 day') at time zone 'Asia/Seoul'
     where w.ended_at is null
       and w.started_at < today_start
    returning w.user_id, w.office_id, w.ended_at
  ), feed as (
    insert into public.office_feed (office_id, user_id, type, created_at)
    select office_id, user_id, 'clock_out', ended_at from closed
    returning 1
  )
  select count(*) into closed_count from closed;

  -- 켜둔 채 잊은 집중도 같은 시각에 닫는다 (길이는 기록하지 않음 — 집중 시간을 부풀리지 않게)
  update public.focus_sessions f
     set ended_at = (date_trunc('day', f.started_at at time zone 'Asia/Seoul') + interval '1 day') at time zone 'Asia/Seoul'
   where f.ended_at is null
     and f.started_at < today_start;

  -- 상태도 정리 (여러 날 이어지는 '휴가 중'만 그대로 둔다)
  update public.status_sessions s
     set ended_at = (date_trunc('day', s.started_at at time zone 'Asia/Seoul') + interval '1 day') at time zone 'Asia/Seoul'
   where s.ended_at is null
     and s.started_at < today_start
     and s.status <> '휴가 중';

  return closed_count;
end;
$$;

-- 앱(anon·로그인 사용자)이 RPC로 불러 전원을 퇴근시키지 못하게 — 크론(DB 소유자)만 실행
revoke all on function public.auto_clockout_stale_sessions() from public, anon, authenticated;

-- 매일 00:01 KST(= 15:01 UTC)에 실행. 같은 이름으로 다시 실행하면 일정만 갱신된다.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('midnight-clockout-db', '1 15 * * *', 'select public.auto_clockout_stale_sessions()');
  else
    raise notice 'pg_cron이 꺼져 있어 자동 실행 예약은 건너뜀 (Database → Extensions에서 pg_cron을 켠 뒤 다시 실행)';
  end if;
end $$;

-- 지금 이미 하루 넘게 열려 있는 근무(예: 출근 26시간)를 바로 정리
select public.auto_clockout_stale_sessions() as closed_now;
