-- 오피스 소식 피드: 출근/퇴근 자동 기록 + 게시글(응원/칭찬) + 인사(👋)

create table if not exists public.office_feed (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('post','clock_in','clock_out','wave')),
  target_user_id uuid references public.profiles(id) on delete cascade, -- 특정 멤버에게 남길 때
  content text, -- 게시글 내용
  emoji text,   -- 인사 이모지
  created_at timestamptz not null default now()
);

create index if not exists idx_feed_office_time on public.office_feed (office_id, created_at desc);

alter table public.office_feed enable row level security;

drop policy if exists feed_select on public.office_feed;
create policy feed_select on public.office_feed for select to authenticated
  using (public.is_office_member(office_id));
drop policy if exists feed_insert on public.office_feed;
create policy feed_insert on public.office_feed for insert to authenticated
  with check (user_id = auth.uid() and public.is_office_member(office_id));
drop policy if exists feed_delete on public.office_feed;
create policy feed_delete on public.office_feed for delete to authenticated
  using (user_id = auth.uid());

-- 실시간 반영
do $$
begin
  begin
    alter publication supabase_realtime add table public.office_feed;
  exception when duplicate_object then null;
  end;
end $$;
