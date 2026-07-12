-- 연결오피스 스키마 + RLS 정책 + 무결성 제약
-- 실행 방법: Supabase 대시보드 → SQL Editor에 전체 붙여넣기 → Run
-- 이미 테이블이 있다면 그대로 실행해도 안전하도록 if not exists / drop policy if exists 사용

-- ========== 테이블 ==========

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.offices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.offices add column if not exists created_by uuid references auth.users(id);

create table if not exists public.office_members (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  unique (office_id, user_id)
);

create table if not exists public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.status_sessions (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  category text,
  status text not null default 'todo' check (status in ('todo','in_progress','done')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  due_date date,
  week_start date not null,
  sort_order integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

-- ========== 무결성 제약 (감사 B3: 중복 열린 세션 방지) ==========

-- 사용자당 오피스별로 "열린" 근무/집중 세션은 1개만 허용
create unique index if not exists one_open_work
  on public.work_sessions (user_id, office_id) where ended_at is null;
create unique index if not exists one_open_focus
  on public.focus_sessions (user_id, office_id) where ended_at is null;

-- 조회 성능
create index if not exists idx_status_open on public.status_sessions (office_id, user_id) where ended_at is null;
create index if not exists idx_tasks_week on public.tasks (user_id, office_id, week_start);
create index if not exists idx_focus_user_time on public.focus_sessions (user_id, office_id, started_at);
create index if not exists idx_work_user_time on public.work_sessions (user_id, office_id, started_at);

-- ========== RLS 헬퍼 ==========

-- office_members 정책이 자기 자신을 참조하면 무한 재귀가 나므로 security definer 함수 사용
create or replace function public.is_office_member(p_office_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from office_members
    where office_id = p_office_id and user_id = auth.uid()
  );
$$;

-- ========== RLS 정책 ==========

alter table public.profiles enable row level security;
alter table public.offices enable row level security;
alter table public.office_members enable row level security;
alter table public.work_sessions enable row level security;
alter table public.status_sessions enable row level security;
alter table public.tasks enable row level security;
alter table public.focus_sessions enable row level security;

-- profiles: 로그인 사용자는 프로필 열람 가능(멤버 카드 표시용), 수정은 본인만
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid());

-- offices: 초대 코드를 아는 사람이 조회할 수 있어야 가입 가능 → select는 열되,
-- 코드가 유출되지 않게 목록 전체 덤프는 앱에서 하지 않음. 생성은 본인 명의만, 삭제는 생성자만.
drop policy if exists offices_select on public.offices;
create policy offices_select on public.offices for select to authenticated using (true);
drop policy if exists offices_insert on public.offices;
create policy offices_insert on public.offices for insert to authenticated with check (created_by = auth.uid());
drop policy if exists offices_delete on public.offices;
create policy offices_delete on public.offices for delete to authenticated using (created_by = auth.uid());

-- office_members: 같은 오피스 멤버끼리만 조회, 가입은 본인 명의만, 탈퇴는 본인만
drop policy if exists members_select on public.office_members;
create policy members_select on public.office_members for select to authenticated
  using (user_id = auth.uid() or public.is_office_member(office_id));
drop policy if exists members_insert on public.office_members;
create policy members_insert on public.office_members for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists members_delete on public.office_members;
create policy members_delete on public.office_members for delete to authenticated
  using (user_id = auth.uid());

-- 세션/할일 공통 패턴: 읽기는 같은 오피스 멤버, 쓰기는 본인 것만
-- work_sessions
drop policy if exists work_select on public.work_sessions;
create policy work_select on public.work_sessions for select to authenticated
  using (public.is_office_member(office_id));
drop policy if exists work_insert on public.work_sessions;
create policy work_insert on public.work_sessions for insert to authenticated
  with check (user_id = auth.uid() and public.is_office_member(office_id));
drop policy if exists work_update on public.work_sessions;
create policy work_update on public.work_sessions for update to authenticated
  using (user_id = auth.uid());

-- status_sessions
drop policy if exists status_select on public.status_sessions;
create policy status_select on public.status_sessions for select to authenticated
  using (public.is_office_member(office_id));
drop policy if exists status_insert on public.status_sessions;
create policy status_insert on public.status_sessions for insert to authenticated
  with check (user_id = auth.uid() and public.is_office_member(office_id));
drop policy if exists status_update on public.status_sessions;
create policy status_update on public.status_sessions for update to authenticated
  using (user_id = auth.uid());

-- tasks
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_office_member(office_id));
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (user_id = auth.uid() and public.is_office_member(office_id));
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (user_id = auth.uid());
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (user_id = auth.uid());

-- focus_sessions
drop policy if exists focus_select on public.focus_sessions;
create policy focus_select on public.focus_sessions for select to authenticated
  using (public.is_office_member(office_id));
drop policy if exists focus_insert on public.focus_sessions;
create policy focus_insert on public.focus_sessions for insert to authenticated
  with check (user_id = auth.uid() and public.is_office_member(office_id));
drop policy if exists focus_update on public.focus_sessions;
create policy focus_update on public.focus_sessions for update to authenticated
  using (user_id = auth.uid());

-- ========== Realtime ==========
-- status_sessions, work_sessions 변경을 실시간 구독하려면 publication에 추가
do $$
begin
  begin
    alter publication supabase_realtime add table public.status_sessions;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.work_sessions;
  exception when duplicate_object then null;
  end;
end $$;
