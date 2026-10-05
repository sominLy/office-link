-- 주간 회고 + 진열장
-- ① 회고를 받을 요일·시간 (기본: 월요일 오전 7시) — 그 시간이 지나면 앱 홈 배너 + 웹푸시로 회고가 도착
-- ② 스스로에게 남기는 칭찬 한마디(주 단위) — 본인만 볼 수 있음
-- ③ 회고에서 받은 칭찬 스티커 — 진열장에 쌓이고, 쌓인 만큼 트로피·상장이 열린다
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (여러 번 실행해도 안전)

alter table public.profiles add column if not exists retro_day smallint not null default 0; -- 0=월 … 6=일
alter table public.profiles add column if not exists retro_time time not null default '07:00';
alter table public.profiles add column if not exists last_retro_pushed date; -- 푸시를 보낸 회고 주(월요일) — 중복 발송 방지

alter table public.profiles drop constraint if exists profiles_retro_day_check;
alter table public.profiles add constraint profiles_retro_day_check check (retro_day between 0 and 6);

create table if not exists public.weekly_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  week_start date not null,         -- 회고한 주의 월요일
  mood text,                        -- 그 주를 한 단어로: 이모지
  praise text,                      -- 나에게 칭찬 한마디
  next_goal text,                   -- 다음 주의 나에게
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, office_id, week_start)
);

alter table public.weekly_reflections enable row level security;

drop policy if exists reflections_select on public.weekly_reflections;
create policy reflections_select on public.weekly_reflections for select to authenticated
  using (user_id = auth.uid());
drop policy if exists reflections_insert on public.weekly_reflections;
create policy reflections_insert on public.weekly_reflections for insert to authenticated
  with check (user_id = auth.uid() and public.is_office_member(office_id));
drop policy if exists reflections_update on public.weekly_reflections;
create policy reflections_update on public.weekly_reflections for update to authenticated
  using (user_id = auth.uid());
drop policy if exists reflections_delete on public.weekly_reflections;
create policy reflections_delete on public.weekly_reflections for delete to authenticated
  using (user_id = auth.uid());

-- 회고 화면이 지난주 완료 할 일을 completed_at으로 찾는다
create index if not exists idx_tasks_completed on public.tasks (user_id, office_id, completed_at)
  where completed_at is not null;

-- ========== 진열장: 회고에서 받은 칭찬 스티커가 쌓이는 곳 ==========
-- 주마다 받은 스티커를 저장 (트로피·상장은 이 기록과 누적 통계로 계산)
create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  week_start date not null,   -- 스티커를 받은 회고 주(월요일)
  code text not null,         -- 스티커 종류 (예: perfect_attendance)
  emoji text not null,
  title text not null,
  detail text,                -- "5일 빠짐없이 출근" 같은 그 주의 기록
  earned_at timestamptz not null default now(),
  unique (user_id, office_id, week_start, code)
);

alter table public.achievements enable row level security;

drop policy if exists achievements_select on public.achievements;
create policy achievements_select on public.achievements for select to authenticated
  using (user_id = auth.uid());
drop policy if exists achievements_insert on public.achievements;
create policy achievements_insert on public.achievements for insert to authenticated
  with check (user_id = auth.uid() and public.is_office_member(office_id));

-- ========== 회고의 '계획 달성률'용: 처음 계획한 주 ==========
-- 할 일을 미루거나 이번 주로 옮겨도 week_start는 바뀌지만, 지난주에 계획했던 사실은 남아야
-- 지난주 회고가 "다 해냈어요 💯"로 뒤바뀌지 않는다. 앱 코드는 이 값을 쓰지 않고, 만들 때 트리거가 채운다.
alter table public.tasks add column if not exists planned_week date;
update public.tasks set planned_week = week_start where planned_week is null; -- 기존 할 일은 지금 주로 최선 추정

create or replace function public.set_task_planned_week()
returns trigger language plpgsql as $$
begin
  if new.planned_week is null then
    new.planned_week := new.week_start;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_planned_week on public.tasks;
create trigger tasks_planned_week before insert on public.tasks
  for each row execute function public.set_task_planned_week();

create index if not exists idx_tasks_planned_week on public.tasks (user_id, office_id, planned_week);
