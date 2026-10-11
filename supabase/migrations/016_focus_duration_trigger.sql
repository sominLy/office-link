-- 집중 세션 duration을 DB 시계로 계산 (감사 H3)
-- 실행 방법: Supabase 대시보드 → SQL Editor에 전체 붙여넣기 → Run
--
-- 왜: 종료 시각을 클라이언트 `Date.now()`로 잡으면 기기 시계가 틀어진 만큼 기록이 오염된다.
--     노트북 절전 복귀나 NTP 재동기로 시계가 +3시간 보정되면, 10분 집중이 3시간 10분으로
--     저장된다. 그래서 트리거가 ended_at을 DB의 now()로 덮고 그 값으로 duration을 센다.
--     started_at도 DB 기본값(now())에서 나오도록 FocusTimer.startFocus가 더 이상 보내지 않는다.
--     둘 다 DB 시계에서 나와야 기기 시계와 무관해진다.
--
-- 범위: ended_at이 null → non-null로 바뀌는 순간에만 동작한다.
--       이미 종료된 행은 건드리지 않아 지나간 리포트 수치가 변하지 않는다.
--
-- 상한: FocusTimer.tsx의 MAX_FOCUS_SECONDS(12시간)와 같은 값이다. 브라우저가 강제 종료되어
--       방치된 세션을 12시간으로 끊는 동작이 이 트리거 때문에 무력화되면 안 된다.
--       한쪽을 바꾸면 다른 쪽도 바꿔야 한다.
--
-- 캐스팅 순서: ::integer를 least/greatest 밖에 둔다. 안에서 캐스팅하면 started_at이
--       68년 이상 어긋난 기기에서 epoch가 int4 범위를 넘어 UPDATE 자체가 실패하고,
--       그 경로가 퇴근(clockOut)이라 사용자가 퇴근을 못 하게 된다.

create or replace function public.set_focus_duration()
returns trigger
language plpgsql as $$
declare
  max_focus_seconds constant integer := 12 * 3600;
begin
  if new.ended_at is not null and old.ended_at is null then
    new.ended_at := now();
    new.duration_seconds := least(
      max_focus_seconds,
      greatest(0, floor(extract(epoch from (new.ended_at - new.started_at))))
    )::integer;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_focus_duration on public.focus_sessions;
create trigger trg_focus_duration
  before update on public.focus_sessions
  for each row execute function public.set_focus_duration();

-- 적용 후 확인:
--   select tgname from pg_trigger where tgname = 'trg_focus_duration';
