-- 이모지 응원 + 반복 할 일(루틴)

-- ========== 이모지 응원 ==========
create table if not exists public.task_reactions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (task_id, user_id, emoji)
);

alter table public.task_reactions enable row level security;

-- 같은 오피스 멤버의 할 일에만 응원 가능
drop policy if exists reactions_select on public.task_reactions;
create policy reactions_select on public.task_reactions for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id and public.is_office_member(t.office_id)));
drop policy if exists reactions_insert on public.task_reactions;
create policy reactions_insert on public.task_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.tasks t where t.id = task_id and public.is_office_member(t.office_id))
  );
drop policy if exists reactions_delete on public.task_reactions;
create policy reactions_delete on public.task_reactions for delete to authenticated
  using (user_id = auth.uid());

-- ========== 반복 할 일(루틴) ==========
-- 매주 자동으로 이번 주 할 일에 추가되는 항목
create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  category text,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  created_at timestamptz not null default now()
);

alter table public.routines enable row level security;

drop policy if exists routines_select on public.routines;
create policy routines_select on public.routines for select to authenticated
  using (user_id = auth.uid());
drop policy if exists routines_insert on public.routines;
create policy routines_insert on public.routines for insert to authenticated
  with check (user_id = auth.uid() and public.is_office_member(office_id));
drop policy if exists routines_update on public.routines;
create policy routines_update on public.routines for update to authenticated
  using (user_id = auth.uid());
drop policy if exists routines_delete on public.routines;
create policy routines_delete on public.routines for delete to authenticated
  using (user_id = auth.uid());

-- 이번 주 할 일이 어느 루틴에서 생성됐는지 추적 (중복 생성 방지)
alter table public.tasks add column if not exists routine_id uuid references public.routines(id) on delete set null;
create unique index if not exists one_task_per_routine_week on public.tasks (routine_id, week_start) where routine_id is not null;
