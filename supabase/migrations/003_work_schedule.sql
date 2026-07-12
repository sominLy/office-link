-- 근무 시작 시간 설정 (미출근 알림용, KST 기준 시각)
alter table public.profiles add column if not exists work_start time;
