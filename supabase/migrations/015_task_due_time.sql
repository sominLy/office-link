-- 할 일 마감 시간(due_time) + 마감일 조회 인덱스
-- due_date만 있던 마감 정보에 "몇 시까지"를 더한다. null이면 시간 지정 없음(기존과 동일).

alter table public.tasks add column if not exists due_time time;

-- 지난 마감(밀린 할 일) 조회용 — 출근할 때 확인 목록에서 사용
create index if not exists idx_tasks_due on public.tasks (user_id, office_id, due_date)
  where due_date is not null;
