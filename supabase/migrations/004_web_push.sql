-- 웹푸시: 구독 저장 테이블 + 미출근 알림 중복 방지 컬럼

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_select on public.push_subscriptions;
create policy push_select on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());
drop policy if exists push_insert on public.push_subscriptions;
create policy push_insert on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists push_update on public.push_subscriptions;
create policy push_update on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid());
drop policy if exists push_delete on public.push_subscriptions;
create policy push_delete on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- 하루 한 번만 "오늘 일 안 하나요?" 알림을 보내기 위한 기록
alter table public.profiles add column if not exists last_nudged_on date;
