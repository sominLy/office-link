-- 의견·문의 — 앱 안에서 운영자에게 의견·문의·버그를 보내고 답변을 받는다.
--
-- 왜 필요한가: 지금은 공략집의 "소식 탭에 남겨 주세요"가 전부다. 소식은 오피스 안에서만 보여서
--   운영자가 같은 방에 없으면 못 보고, 공개 오피스 사람은 운영자에게 닿을 길이 없다.
--
-- 어떻게: feedback 한 테이블. 본인 글과 그 답변은 본인이, 전체는 운영자(019의 app_admins)만 본다.
--   답변·완료 처리는 운영자 함수로만 한다 (019의 admin_add_marker와 같은 방식).
--   한 사람이 한 시간에 10개까지 보낸다.
--
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (여러 번 실행해도 안전)
-- 순서: 019 다음에 실행한다 (is_app_admin). ④의 이벤트 목록은 024의 것을 포함하므로 024 뒤가 자연스럽다.
-- 푸시: 보내면 운영자에게, 답변하면 보낸 사람에게 알리는 'feedback'·'feedback_reply' 액션이
--   push-notify 함수에 있다. 함수도 다시 배포한다.

-- ========== ① 테이블 ==========
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  -- profiles를 참조해야 PostgREST가 feedback→profiles 조인(embed)을 해석할 수 있다
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('idea', 'question', 'bug', 'other')),
  message text not null,
  page text,                 -- 보낸 화면 경로. 버그 제보에서 어디였는지 알 수 있게
  status text not null default 'open' check (status in ('open', 'done')),
  reply text,                -- 운영자 답변
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  constraint feedback_message_len check (char_length(btrim(message)) between 2 and 1000),
  constraint feedback_reply_len check (reply is null or char_length(reply) between 1 and 1000),
  constraint feedback_page_len check (page is null or char_length(page) <= 100)
);

create index if not exists idx_feedback_user on public.feedback (user_id, created_at desc);
create index if not exists idx_feedback_status on public.feedback (status, created_at desc);

-- ========== ② 보낼 때 ==========
-- 한 시간에 10개까지. 상태·답변·시각은 앱이 보낸 값을 버리고 서버가 정한다.
create or replace function public.feedback_before_insert()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- SQL Editor·service role(로그인 사용자가 아님)이 넣는 행은 그대로 둔다
  if auth.uid() is null then return new; end if;
  -- 같은 사람의 요청은 한 번에 하나씩 (022의 초대 코드 함수와 같은 이유)
  perform pg_advisory_xact_lock(hashtextextended('feedback:' || new.user_id::text, 0));
  if (select count(*) from feedback where user_id = new.user_id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too many feedback' using errcode = 'P0003';
  end if;
  new.created_at := now();
  new.status := 'open';
  new.reply := null;
  new.replied_at := null;
  new.message := btrim(new.message);
  return new;
end;
$$;

drop trigger if exists feedback_before_insert on public.feedback;
create trigger feedback_before_insert before insert on public.feedback
  for each row execute function public.feedback_before_insert();

-- ========== ③ 정책 ==========
alter table public.feedback enable row level security;

-- 본인 글(과 답변)은 본인이, 전체는 운영자가 본다
drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback for select to authenticated
  using (user_id = auth.uid() or public.is_app_admin());
drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert to authenticated
  with check (user_id = auth.uid());
-- 보낸 글은 본인이 지울 수 있다
drop policy if exists feedback_delete on public.feedback;
create policy feedback_delete on public.feedback for delete to authenticated
  using (user_id = auth.uid());

-- 앱이 넣는 열만 연다. status·reply·replied_at은 정의자 함수(아래)만 바꾼다.
revoke insert on public.feedback from anon, authenticated;
revoke update on public.feedback from anon, authenticated;
grant insert (user_id, kind, message, page) on public.feedback to authenticated;

-- ========== ④ 운영자 함수 ==========
-- 목록: 닉네임·이메일을 붙여 준다. profiles는 같은 오피스 사람만 보이므로(022) 정의자 권한으로 읽는다.
-- 이메일은 답장을 보낼 수 있게. 운영자는 Supabase 대시보드에서 이미 볼 수 있는 값이다.
create or replace function public.admin_feedback_list()
returns table (
  id uuid, user_id uuid, nickname text, email text, kind text, message text, page text,
  status text, reply text, replied_at timestamptz, created_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_app_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select f.id, f.user_id, p.nickname, u.email::text, f.kind, f.message, f.page,
           f.status, f.reply, f.replied_at, f.created_at
    from public.feedback f
    left join public.profiles p on p.id = f.user_id
    left join auth.users u on u.id = f.user_id
    order by (f.status = 'open') desc, f.created_at desc
    limit 300;
end;
$$;

-- 답변·상태. 답변을 비우면 null로 둔다. 답변을 쓰거나 완료로 바꾸면 replied_at을 찍는다.
create or replace function public.admin_reply_feedback(p_id uuid, p_reply text, p_status text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_reply text := nullif(left(btrim(coalesce(p_reply, '')), 1000), '');
begin
  if not public.is_app_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('open', 'done') then raise exception 'bad status' using errcode = '22023'; end if;
  update public.feedback
     set reply = v_reply,
         status = p_status,
         replied_at = case when v_reply is not null or p_status = 'done' then now() else null end
   where id = p_id;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function public.feedback_before_insert() from public, anon, authenticated;
revoke all on function public.admin_feedback_list() from public, anon;
revoke all on function public.admin_reply_feedback(uuid, text, text) from public, anon;
grant execute on function public.admin_feedback_list() to authenticated;
grant execute on function public.admin_reply_feedback(uuid, text, text) to authenticated;

-- ========== ⑤ 퍼널 이벤트 ==========
-- 021의 허용 목록에 feedback_sent를 더한다 (024의 스터디룸 이벤트 포함, src/lib/funnel.ts의 EventName과 같아야 한다)
do $$
begin
  if to_regclass('public.events') is not null then
    alter table public.events drop constraint if exists events_name_allowed;
    alter table public.events add constraint events_name_allowed check (name in (
      'app_open',
      'page_view',
      'landing_view',
      'signup_start',
      'signup_complete',
      'office_joined',
      'clock_in',
      'task_created',
      'focus_started',
      'reaction_sent',
      'study_room_created',
      'study_room_joined',
      'feedback_sent'
    ));
  end if;
end $$;

-- 새 테이블·함수를 API가 바로 알아보게 한다
notify pgrst, 'reload schema';
