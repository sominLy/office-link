-- 공개 배포 준비 — 낯선 사람이 가입해도 기존 오피스가 열리지 않게 잠그고, 공개 오피스를 연다.
--
-- 왜 필요한가: 001의 정책은 "가입한 사람 = 초대받은 지인"을 전제로 했다.
--   offices_select  using (true)            → 로그인한 누구나 모든 오피스의 초대 코드를 읽는다
--   members_insert  user_id = auth.uid()    → 초대 코드 없이 아무 오피스에나 자기를 넣을 수 있다 (role='admin'도 통과)
--   profiles_select using (true)            → 로그인한 누구나 모든 사람의 닉네임·사진을 읽는다
-- 가입을 공개로 받으면 이 셋이 곧 기존 오피스의 할 일·채팅 노출이다.
--
-- ① 공개 오피스 표시(is_public)        ② 오피스 조회·생성·수정 + 초대 코드를 서버가 뽑기
-- ③ 멤버 가입 범위 + 초대 코드 입장 함수  ④ 프로필 조회 범위 + 프로필 사진 주소
-- ⑤ 공개 오피스 채팅 차단               ⑥ 프로필 사진 목록 조회
-- ⑦ 화면에만 있던 입력 제한을 DB에도      ⑧ 헬퍼 함수 search_path
-- ⑨ '모두의 오피스' 만들기
--
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (여러 번 실행해도 안전)
-- 순서: 019 다음에 실행한다. ⑨가 019의 app_admins를 읽어 운영자를 방장으로 넣는다.
-- ⚠️ 이 파일을 적용하면 예전 앱 코드의 '초대 코드 입력'이 동작하지 않는다
--    (오피스를 직접 조회해 멤버로 넣던 경로가 ②③에서 막힌다).
--    앱은 join_office_by_code가 없을 때만 예전 경로로 내려가므로, 앱을 먼저 배포하고 이 파일을 적용한다.
-- ⚠️ 이 파일을 적용한 뒤에 001·002·007·012를 다시 실행하면 여기서 바꾼 정책이 예전 내용으로 돌아간다.
--    다시 실행했다면 이 파일도 다시 실행하고 supabase/queries/launch_check.sql로 확인한다.

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

-- 생성: 공개 오피스는 앱에서 만들 수 없다 (⑨에서만 만든다)
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

-- 초대 코드는 서버가 뽑는다. 앱이 고른 코드를 그대로 받으면, 후보 코드로 오피스를 잔뜩 만들어 보고
-- unique 충돌이 나는 코드(= 이미 쓰이는 코드)를 골라낼 수 있다. 앱이 보낸 값은 버린다.
create or replace function public.new_invite_code()
returns text
language sql volatile set search_path = public, pg_temp as $$
  -- gen_random_uuid()는 OS 난수를 쓴다. 버전·변형 비트가 섞이지 않은 앞 6바이트만 쓴다.
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + get_byte(r.b, i) % 31, 1), '')
  from (select uuid_send(gen_random_uuid()) as b) r, unnest(array[0,1,2,3,4,5]) as i;
$$;

create or replace function public.set_office_invite_code()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- SQL Editor·service role(로그인 사용자가 아님)이 넣는 행은 준 값을 그대로 둔다 (⑨)
  if auth.uid() is null then return new; end if;
  loop
    new.invite_code := public.new_invite_code();
    exit when not exists (select 1 from offices where invite_code = new.invite_code);
  end loop;
  return new;
end;
$$;

drop trigger if exists offices_invite_code on public.offices;
create trigger offices_invite_code before insert on public.offices
  for each row execute function public.set_office_invite_code();

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

-- 가입 순서가 직급(사장·부사장…)을 정한다. 앱이 보낸 과거 시각으로 순서를 앞당기지 못하게 서버 시각을 쓴다.
create or replace function public.set_member_joined_at()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null then new.joined_at := now(); end if;
  return new;
end;
$$;

drop trigger if exists office_members_joined_at on public.office_members;
create trigger office_members_joined_at before insert on public.office_members
  for each row execute function public.set_member_joined_at();

-- 초대 코드 입력 횟수. 코드가 6자리라 제한이 없으면 계속 넣어 볼 수 있다.
create table if not exists public.invite_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists idx_invite_attempts on public.invite_attempts (user_id, at);
alter table public.invite_attempts enable row level security; -- 정책 없음 = 앱에서 접근 불가

-- 초대 코드를 아는 사람만 그 오피스에 들어간다. 오피스 목록을 열어주지 않고도 코드를 확인하려면
-- 정의자 권한 함수여야 한다.
--   코드가 틀리면 null (예외를 던지면 틀린 횟수 기록까지 롤백된다)
--   한 시간에 10번 틀리면 P0003, 이미 멤버면 23505(unique)
create or replace function public.join_office_by_code(p_code text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_office uuid;
  v_uid uuid := auth.uid();
begin
  if (select count(*) from invite_attempts where user_id = v_uid and at > now() - interval '1 hour') >= 10 then
    raise exception 'too many attempts' using errcode = 'P0003';
  end if;
  select id into v_office from offices where invite_code = upper(btrim(p_code));
  if v_office is null then
    insert into invite_attempts (user_id) values (v_uid);
    return null;
  end if;
  insert into office_members (office_id, user_id, role) values (v_office, v_uid, 'member');
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

-- 프로필 사진 주소는 내 사진 폴더만. 아무 주소나 넣을 수 있으면 같은 오피스 사람들이 홈을 열 때마다
-- 그 서버로 요청이 가서 접속 주소가 넘어간다.
-- 주소를 바꿀 때만 검사한다. 예전에 외부 주소를 넣은 사람의 다른 수정(오피스 전환 저장 등)은 막지 않는다.
create or replace function public.check_avatar_url()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.avatar_url is not null
     and (tg_op = 'INSERT' or new.avatar_url is distinct from old.avatar_url)
     and not starts_with(
       new.avatar_url,
       'https://ykyocsatvnqbuwvybirw.supabase.co/storage/v1/object/public/avatars/' || new.id::text || '/'
     ) then
    raise exception 'avatar_url must be in own avatars folder' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_avatar_url on public.profiles;
create trigger profiles_avatar_url before insert or update on public.profiles
  for each row execute function public.check_avatar_url();

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

-- ========== ⑥ 프로필 사진 목록 조회 ==========
-- 버킷이 public이라 사진 주소를 아는 사람은 정책과 무관하게 사진을 본다. 이 정책이 여는 것은
-- 목록 조회인데, 002의 정책은 로그인하지 않아도 전체 목록(사용자 id 폴더)을 돌려줬다.
-- 앱이 목록을 읽는 곳은 내 사진을 지울 때뿐이라 내 폴더로 좁힌다.
drop policy if exists "avatar_read" on storage.objects;
create policy "avatar_read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ========== ⑦ 입력 제한 ==========
-- 화면이 막고 있던 것들이다. API로 직접 넣으면 그대로 들어갔다.

-- 상태 값: 목록에 없는 값이 하나 들어가면 그 오피스의 홈 화면이 그려지지 않는다.
-- 기존 행은 검사하지 않지만(not valid) 수정할 때는 검사되므로, 목록 밖 값으로 열려 있는 행은 먼저 닫는다.
-- 그런 행이 남아 있으면 자정 자동 퇴근(018)의 update가 통째로 실패한다.
update public.status_sessions set ended_at = now()
where ended_at is null and status not in (
  '출근','집중 중','업무 중','휴식 중','자리 비움','스터디/회의 중',
  '점심 먹는 중','저녁 먹는 중','야식 먹는 중','연차','휴가 중','퇴근');
alter table public.status_sessions drop constraint if exists status_sessions_status_allowed;
alter table public.status_sessions add constraint status_sessions_status_allowed check (status in (
  '출근','집중 중','업무 중','휴식 중','자리 비움','스터디/회의 중',
  '점심 먹는 중','저녁 먹는 중','야식 먹는 중','연차','휴가 중','퇴근')) not valid;

-- 길이: 화면의 maxLength(닉네임 20, 오피스 이름 30, 소식 글 200)보다 조금 넉넉하게
alter table public.profiles drop constraint if exists profiles_nickname_len;
alter table public.profiles add constraint profiles_nickname_len
  check (char_length(btrim(nickname)) between 1 and 30) not valid;
alter table public.offices drop constraint if exists offices_name_len;
alter table public.offices add constraint offices_name_len
  check (char_length(name) between 1 and 40) not valid;
alter table public.office_feed drop constraint if exists office_feed_content_len;
alter table public.office_feed add constraint office_feed_content_len
  check (content is null or char_length(content) <= 300) not valid;

-- 응원 글귀: 제보하면 바로 모든 사람의 홈에 떴다. 운영자가 확인한 뒤에 띄운다.
--   승인: update public.quotes set approved = true where id = '…';
alter table public.quotes alter column approved set default false;
drop policy if exists quotes_insert on public.quotes;
create policy quotes_insert on public.quotes for insert to authenticated
  with check (created_by = auth.uid() and approved = false and char_length(text) <= 60);

-- 내 할 일을 속하지 않은 오피스로 옮기거나, 속하지 않은 오피스에 읽음 표시를 넣는 길을 막는다
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_office_member(office_id));
drop policy if exists reads_insert on public.chat_reads;
create policy reads_insert on public.chat_reads for insert to authenticated
  with check (user_id = auth.uid() and public.is_office_member(office_id));
drop policy if exists reads_update on public.chat_reads;
create policy reads_update on public.chat_reads for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_office_member(office_id));

-- ========== ⑧ 헬퍼 함수 search_path ==========
-- 001·008의 정의자 권한 함수도 새 함수들과 같게 pg_temp를 맨 뒤로 고정한다
alter function public.is_office_member(uuid) set search_path = public, pg_temp;
alter function public.is_office_admin(uuid) set search_path = public, pg_temp;

-- ========== 권한 ==========
revoke all on function public.is_public_office(uuid) from public, anon;
revoke all on function public.shares_office_with(uuid) from public, anon;
revoke all on function public.join_office_by_code(text) from public, anon;
revoke all on function public.new_invite_code() from public, anon, authenticated;
revoke all on function public.set_office_invite_code() from public, anon, authenticated;
revoke all on function public.set_member_joined_at() from public, anon, authenticated;
revoke all on function public.check_avatar_url() from public, anon, authenticated;
grant execute on function public.is_public_office(uuid) to authenticated;
grant execute on function public.shares_office_with(uuid) to authenticated;
grant execute on function public.join_office_by_code(text) to authenticated;

-- ========== ⑨ '모두의 오피스' ==========
-- 공개 오피스는 하나만 둔다. 이미 있으면 새로 만들지 않는다.
-- 운영자(019의 app_admins)를 방장으로 넣어야 깜빡한 멤버를 대신 퇴근시킬 수 있다(008).
do $$
declare
  v_office uuid;
begin
  select id into v_office from public.offices where is_public order by created_at limit 1;
  if v_office is null then
    insert into public.offices (name, invite_code, is_public)
    values ('모두의 오피스', public.new_invite_code(), true)
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

-- 새 함수와 열을 API가 바로 알아보게 한다 (안 하면 잠깐 동안 join_office_by_code를 못 찾는다)
notify pgrst, 'reload schema';
