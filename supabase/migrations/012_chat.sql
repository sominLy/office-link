-- 오피스별 단체 채팅
-- ⚠️ 022_public_office.sql을 적용한 뒤에는 이 파일을 다시 실행하지 않는다. 여기의 정책이 022에서 잠근 내용을
--    예전 것으로 되돌린다. 다시 실행했다면 022도 다시 실행하고 supabase/queries/launch_check.sql로 확인한다.
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_office_time on public.chat_messages (office_id, created_at);

alter table public.chat_messages enable row level security;

drop policy if exists chat_select on public.chat_messages;
create policy chat_select on public.chat_messages for select to authenticated
  using (public.is_office_member(office_id));
drop policy if exists chat_insert on public.chat_messages;
create policy chat_insert on public.chat_messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_office_member(office_id));
drop policy if exists chat_delete on public.chat_messages;
create policy chat_delete on public.chat_messages for delete to authenticated
  using (user_id = auth.uid());

-- 실시간
do $$
begin
  begin
    alter publication supabase_realtime add table public.chat_messages;
  exception when duplicate_object then null;
  end;
end $$;
