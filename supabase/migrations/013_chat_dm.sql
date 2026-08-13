-- 1:1 갠톡: recipient_id가 있으면 그 사람과의 개인 대화, null이면 단체방
alter table public.chat_messages add column if not exists recipient_id uuid references public.profiles(id) on delete cascade;
create index if not exists idx_chat_dm on public.chat_messages (office_id, recipient_id);

-- 단체 메시지는 오피스 멤버 모두, 갠톡은 보낸/받은 당사자만 볼 수 있게
drop policy if exists chat_select on public.chat_messages;
create policy chat_select on public.chat_messages for select to authenticated
  using (
    public.is_office_member(office_id)
    and (recipient_id is null or user_id = auth.uid() or recipient_id = auth.uid())
  );
