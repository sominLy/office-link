-- 의견·문의 사진 첨부 — 스크린샷을 최대 3장 붙여 보낸다 (소민 요청, 2026-10-14).
--
-- 어떻게: 비공개 버킷 feedback-images에 {보낸 사람 id}/{uuid}.{ext}로 올리고, feedback.images에 경로를 둔다.
--   사진은 보낸 사람과 운영자(019의 app_admins)만 본다 — 스크린샷에는 다른 사람 이름·대화가 섞일 수 있다.
--   앱은 서명 URL(1시간)로 보여 준다. 공개 버킷이면 주소만 알면 누구나 보게 된다.
--   경로는 자기 폴더 안만 받는다(트리거). 남의 사진 경로를 자기 글에 붙여 운영자 화면에 띄우는 길을 막는다.
--
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (여러 번 실행해도 안전)
-- 순서: 025 다음. 앱은 이 파일 전후 모두 동작한다(열이 없으면 사진 없이 보낸다).

-- ========== ① 버킷 ==========
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-images', 'feedback-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 보기: 내 폴더 또는 운영자. 올리기·지우기: 내 폴더만. 덮어쓰기(update)는 없다.
drop policy if exists "feedback_img_read" on storage.objects;
create policy "feedback_img_read" on storage.objects for select to authenticated
  using (bucket_id = 'feedback-images'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_app_admin()));
drop policy if exists "feedback_img_insert" on storage.objects;
create policy "feedback_img_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "feedback_img_delete" on storage.objects;
create policy "feedback_img_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'feedback-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ========== ② 열 ==========
alter table public.feedback add column if not exists images text[] not null default '{}';
alter table public.feedback drop constraint if exists feedback_images_len;
alter table public.feedback add constraint feedback_images_len
  check (coalesce(array_length(images, 1), 0) <= 3);

-- 경로는 '{내 id}/' 로 시작해야 한다. SQL Editor·service role 행은 그대로.
create or replace function public.feedback_images_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare p text;
begin
  if auth.uid() is null then return new; end if;
  foreach p in array coalesce(new.images, '{}') loop
    if p !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]+$') then
      raise exception 'image path must be in own folder' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.feedback_images_guard() from public, anon, authenticated;
drop trigger if exists feedback_images_guard on public.feedback;
create trigger feedback_images_guard before insert on public.feedback
  for each row execute function public.feedback_images_guard();

-- 앱이 넣는 열에 images를 더한다 (025의 목록 + images). status·reply는 여전히 운영자 함수만.
revoke insert on public.feedback from anon, authenticated;
grant insert (user_id, kind, message, page, notify_on_done, images) on public.feedback to authenticated;

-- ========== ③ 운영자 목록에 images ==========
-- 반환 열이 달라지면 create or replace가 거부되므로 지우고 다시 만든다.
drop function if exists public.admin_feedback_list();
create function public.admin_feedback_list()
returns table (
  id uuid, user_id uuid, nickname text, email text, kind text, message text, page text,
  status text, reply text, replied_at timestamptz, created_at timestamptz, notify_on_done boolean,
  images text[]
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_app_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select f.id, f.user_id, p.nickname, u.email::text, f.kind, f.message, f.page,
           f.status, f.reply, f.replied_at, f.created_at, f.notify_on_done, f.images
    from public.feedback f
    left join public.profiles p on p.id = f.user_id
    left join auth.users u on u.id = f.user_id
    order by (f.status = 'open') desc, f.created_at desc
    limit 300;
end;
$$;
revoke all on function public.admin_feedback_list() from public, anon;
grant execute on function public.admin_feedback_list() to authenticated;

notify pgrst, 'reload schema';
