-- 프로필 사진 업로드(Storage) + 계정 삭제 기능

-- ========== 아바타 저장소 ==========
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 읽기는 공개(프로필 사진이므로), 쓰기/수정/삭제는 본인 폴더(user_id/)만
drop policy if exists "avatar_read" on storage.objects;
create policy "avatar_read" on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatar_insert" on storage.objects;
create policy "avatar_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar_update" on storage.objects;
create policy "avatar_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar_delete" on storage.objects;
create policy "avatar_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ========== 계정 삭제 ==========
-- 사용자가 오피스를 만들었어도 계정 삭제가 막히지 않도록 created_by는 null로 풀어준다
alter table public.offices drop constraint if exists offices_created_by_fkey;
alter table public.offices add constraint offices_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- 본인 계정을 삭제하는 함수 (auth.users 삭제 → 프로필/세션/할일은 FK cascade로 함께 삭제)
create or replace function public.delete_my_account()
returns void
language sql security definer set search_path = public as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_my_account() from anon, public;
grant execute on function public.delete_my_account() to authenticated;
