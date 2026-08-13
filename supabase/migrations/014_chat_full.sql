-- 채팅 고도화: 갠톡 + 10분 내 삭제 + 읽음 표시 + 일주일 자동 삭제

-- 1) 갠톡용 수신자 컬럼 (null = 단체방)
alter table public.chat_messages add column if not exists recipient_id uuid references public.profiles(id) on delete cascade;
create index if not exists idx_chat_dm on public.chat_messages (office_id, recipient_id);

drop policy if exists chat_select on public.chat_messages;
create policy chat_select on public.chat_messages for select to authenticated
  using (
    public.is_office_member(office_id)
    and (recipient_id is null or user_id = auth.uid() or recipient_id = auth.uid())
  );

-- 2) 본인 메시지를 보낸 지 10분 이내에만 삭제 가능
drop policy if exists chat_delete on public.chat_messages;
create policy chat_delete on public.chat_messages for delete to authenticated
  using (user_id = auth.uid() and created_at > now() - interval '10 minutes');

-- 3) 읽음 표시 — 사용자별 마지막으로 읽은 시각
create table if not exists public.chat_reads (
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (office_id, user_id)
);
alter table public.chat_reads enable row level security;
drop policy if exists reads_select on public.chat_reads;
create policy reads_select on public.chat_reads for select to authenticated using (public.is_office_member(office_id));
drop policy if exists reads_insert on public.chat_reads;
create policy reads_insert on public.chat_reads for insert to authenticated with check (user_id = auth.uid());
drop policy if exists reads_update on public.chat_reads;
create policy reads_update on public.chat_reads for update to authenticated using (user_id = auth.uid());

do $$
begin
  begin alter publication supabase_realtime add table public.chat_reads; exception when duplicate_object then null; end;
end $$;

-- 4) 일주일 지난 대화 자동 삭제 (매일 새벽 4시 KST = 19:00 UTC)
create extension if not exists pg_cron;
select cron.unschedule('chat-cleanup') where exists (select 1 from cron.job where jobname = 'chat-cleanup');
select cron.schedule('chat-cleanup', '0 19 * * *',
  $$delete from public.chat_messages where created_at < now() - interval '7 days'$$);
