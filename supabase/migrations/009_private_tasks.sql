-- 할 일 비공개: 비공개 할 일은 본인만 볼 수 있다 (같은 오피스 멤버에게도 숨김)

alter table public.tasks add column if not exists is_private boolean not null default false;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (
    user_id = auth.uid()
    or (public.is_office_member(office_id) and not is_private)
  );
