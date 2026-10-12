-- 공개 배포 준비 — 낯선 사람이 가입해도 기존 오피스가 열리지 않게 잠그고, 공개 오피스를 연다.
--
-- 왜 필요한가: 001의 정책은 "가입한 사람 = 초대받은 지인"을 전제로 했다.
--   offices_select  using (true)            → 로그인한 누구나 모든 오피스의 초대 코드를 읽는다
--   members_insert  user_id = auth.uid()    → 초대 코드 없이 아무 오피스에나 자기를 넣을 수 있다 (role='admin'도 통과)
--   profiles_select using (true)            → 로그인한 누구나 모든 사람의 닉네임·사진을 읽는다
-- 가입을 공개로 받으면 이 셋이 곧 기존 오피스의 할 일·채팅 노출이다.
--
-- ① 공개 오피스 표시(is_public)        ② 오피스 조회·생성·수정 범위
-- ③ 멤버 가입 범위 + 초대 코드 입장 함수  ④ 프로필 조회 범위
-- ⑤ 공개 오피스 채팅 차단               ⑥ '모두의 오피스' 만들기
--
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (여러 번 실행해도 안전)
-- 순서: 019 다음에 실행한다. ⑥이 019의 app_admins를 읽어 운영자를 방장으로 넣는다.
-- ⚠️ 이 파일을 적용하면 예전 앱 코드의 '초대 코드 입력'이 동작하지 않는다
--    (오피스를 직접 조회해 멤버로 넣던 경로가 ②③에서 막힌다).
--    앱은 join_office_by_code가 없을 때만 예전 경로로 내려가므로, 앱을 먼저 배포하고 이 파일을 적용한다.

-- ========== ① 공개 오피스 표시 ==========
alter table public.offices add column if not exists is_public boolean not null default false;

create or replace function public.is_public_office(p_office_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select is_public from offices where id = p_office_id), false);
$$;

-- ========== ② 오피스 조회·생성·수정 ==========
-- 조회: 공개 오피스, 내가 만든 오피스, 내가 속한 오피스만.
-- created_by 조건은 createOffice의 insert ... returning 때문에 필요하다 (멤버 행이 생기기 전이다).
drop policy if exists offices_select on public.offices;
create policy offices_select on public.offices for select to authenticated
  using (is_public or created_by = auth.uid() or public.is_office_member(id));

-- 생성: 공개 오피스는 앱에서 만들 수 없다 (⑥에서만 만든다)
drop policy if exists offices_insert on public.offices;
create policy offices_insert on public.offices for insert to authenticated
  with check (created_by = auth.uid() and not is_public);

-- 수정: 방장만. 007의 정책은 서브쿼리 안의 id가 office_members.id로 풀려
-- (m.office_id = m.id) 누구에게도 참이 되지 않았다. 호칭 변경이 저장되지 않던 원인이다.
drop policy if exists offices_update on public.offices;
create policy offices_update on public.offices for update to authenticated
  using (public.is_office_admin(id))
  with check (public.is_office_admin(id));

-- 방장이 바꿀 수 있는 것은 이름과 호칭뿐이다. is_public·invite_code·created_by는 앱에서 못 바꾼다.
revoke update on public.offices from anon, authenticated;
grant update (name, title_mode) on public.offices to authenticated;

-- ========== ③ 멤버 가입 ==========
-- 직접 insert는 두 경우만: 공개 오피스에 멤버로 / 내가 만든 오피스에.
-- 초대 코드 입장은 아래 함수로만 한다.
drop policy if exists members_insert on public.office_members;
create policy members_insert on public.office_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (role = 'member' and public.is_public_office(office_members.office_id))
      or exists (
        select 1 from public.offices o
        where o.id = office_members.office_id and o.created_by = auth.uid()
      )
    )
  );

-- 초대 코드를 아는 사람만 그 오피스에 들어간다. 오피스 목록을 열어주지 않고도 코드를 확인하려면
-- 정의자 권한 함수여야 한다. 코드가 틀리면 P0002, 이미 멤버면 23505(unique)가 올라간다.
create or replace function public.join_office_by_code(p_code text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_office uuid;
begin
  select id into v_office from offices where invite_code = upper(btrim(p_code));
  if v_office is null then
    raise exception 'invalid invite code' using errcode = 'P0002';
  end if;
  insert into office_members (office_id, user_id, role) values (v_office, auth.uid(), 'member');
  return v_office;
end;
$$;

-- ========== ④ 프로필 조회 ==========
-- 나, 그리고 나와 같은 오피스에 있는 사람만.
create or replace function public.shares_office_with(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from office_members mine
    join office_members theirs on theirs.office_id = mine.office_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_office_with(id));

-- ========== ⑤ 공개 오피스 채팅 차단 ==========
-- 모르는 사람끼리의 대화는 운영자가 살필 수 없어 열지 않는다. 화면에서 숨기는 것과 별개로
-- API로 직접 넣는 것도 막는다. DM도 같은 테이블이라 함께 막힌다.
drop policy if exists chat_insert on public.chat_messages;
create policy chat_insert on public.chat_messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_office_member(office_id)
    and not public.is_public_office(office_id)
  );

-- ========== 권한 ==========
revoke all on function public.is_public_office(uuid) from public, anon;
revoke all on function public.shares_office_with(uuid) from public, anon;
revoke all on function public.join_office_by_code(text) from public, anon;
grant execute on function public.is_public_office(uuid) to authenticated;
grant execute on function public.shares_office_with(uuid) to authenticated;
grant execute on function public.join_office_by_code(text) to authenticated;

-- ========== ⑥ '모두의 오피스' ==========
-- 공개 오피스는 하나만 둔다. 이미 있으면 새로 만들지 않는다.
-- 운영자(019의 app_admins)를 방장으로 넣어야 깜빡한 멤버를 대신 퇴근시킬 수 있다(008).
do $$
declare
  v_office uuid;
begin
  select id into v_office from public.offices where is_public order by created_at limit 1;
  if v_office is null then
    insert into public.offices (name, invite_code, is_public)
    values ('모두의 오피스', upper(substr(md5(gen_random_uuid()::text), 1, 6)), true)
    returning id into v_office;
  end if;

  if to_regclass('public.app_admins') is not null then
    insert into public.office_members (office_id, user_id, role)
    select v_office, a.user_id, 'admin'
    from public.app_admins a
    where exists (select 1 from public.profiles p where p.id = a.user_id)
    on conflict (office_id, user_id) do update set role = 'admin';
  end if;
end;
$$;
