-- 방장(admin)이 깜빡한 멤버를 대신 퇴근시킬 수 있게 하는 권한
-- (열린 세션의 ended_at을 닫는 update만 가능해진다)

create or replace function public.is_office_admin(p_office_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from office_members
    where office_id = p_office_id and user_id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists work_update_admin on public.work_sessions;
create policy work_update_admin on public.work_sessions for update to authenticated
  using (public.is_office_admin(office_id));

drop policy if exists status_update_admin on public.status_sessions;
create policy status_update_admin on public.status_sessions for update to authenticated
  using (public.is_office_admin(office_id));

drop policy if exists focus_update_admin on public.focus_sessions;
create policy focus_update_admin on public.focus_sessions for update to authenticated
  using (public.is_office_admin(office_id));
