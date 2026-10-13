-- 오피스마다 다른 이름 쓰기.
--
-- 왜 필요한가: 닉네임이 profiles에 하나뿐이라 모든 오피스에서 같은 이름으로 보인다.
--   친구 방에서는 본명으로, 모르는 사람이 섞인 방에서는 랜덤 이름으로 있고 싶을 때
--   방법이 없다. 이름을 바꾸면 모든 방에서 같이 바뀐다.
--
-- 어떻게: office_members에 nickname을 둔다. null이면 profiles.nickname을 쓴다.
--   기존 멤버는 전부 null이라 지금 보이는 이름이 그대로 유지된다.
--
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (여러 번 실행해도 안전)
-- 순서: 022 다음에 실행한다. 022의 join_office_by_code가 서버에서 멤버 행을 넣으므로,
--   입장할 때 고른 이름은 그 뒤에 UPDATE로 붙인다 — 아래 members_update_self가 필요하다.

alter table public.office_members
  add column if not exists nickname text;

-- 빈 문자열은 받지 않는다. 화면에서 지우면 null로 저장해 profiles 이름으로 되돌아가게 한다.
alter table public.office_members
  drop constraint if exists office_members_nickname_len;
alter table public.office_members
  add constraint office_members_nickname_len
  check (nickname is null or char_length(btrim(nickname)) between 1 and 20);

-- 같은 오피스 안에서 같은 이름이 둘이면 누가 누군지 알 수 없다.
-- 대소문자·앞뒤 공백만 다른 경우도 같은 이름으로 본다.
drop index if exists office_members_nickname_uniq;
create unique index office_members_nickname_uniq
  on public.office_members (office_id, lower(btrim(nickname)))
  where nickname is not null;

-- 001에는 office_members UPDATE 정책이 없어서 본인 행도 고칠 수 없었다.
-- 자기 행만, 그리고 역할(role)은 바꾸지 못하게 둔다 — 스스로 방장이 되는 것을 막는다.
drop policy if exists members_update_self on public.office_members;
create policy members_update_self on public.office_members for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- role을 바꾸려는 시도는 거절한다. with check로는 '바뀌었는지'를 볼 수 없어 트리거로 막는다.
create or replace function public.office_members_guard_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and old.user_id = auth.uid() then
    raise exception '역할은 스스로 바꿀 수 없습니다';
  end if;
  return new;
end;
$$;

drop trigger if exists office_members_guard_role_trg on public.office_members;
create trigger office_members_guard_role_trg
  before update on public.office_members
  for each row execute function public.office_members_guard_role();
