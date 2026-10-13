-- 공개 운영 전 보강 — 앱 전체 보안 감사(RLS·클라이언트·엣지 함수·남용·비밀값·개인정보 여섯 관점)에서
-- 확인된 구멍을 한 번에 막는다. 모두 "로그인한 낯선 사람(공개 오피스 멤버)이 API를 직접 부른다"를 전제로 한다.
--
-- ① 프로필 열 범위    낯선 사람에게는 닉네임·사진만. 근무 시간·회고 설정·마지막 오피스는 본인만(my_profile).
--                     공개 오피스는 '같은 오피스'로 치지 않아 본명·사진이 새지 않는다. 공개 오피스 멤버 행은 늘 이름을 가진다.
-- ② 쓰기 횟수 제한    앱이 못 보는 write_attempts에 시도를 적고 센다 (025의 feedback_attempts와 같은 방식, 표 하나로 통합).
-- ③ 세션 표 잠금      수정은 ended_at(집중은 길이도)만, 넣기는 오피스·주인(+상태·할 일)만. 시각은 서버가 정한다.
--                     열린 상태 세션은 한 사람당 하나. 수정으로 다른 오피스에 옮기지 못한다.
-- ④ 길이 제한         할 일·루틴·이모지·채팅·사진 주소. 화면의 maxLength는 API로 직접 넣으면 건너뛴다.
-- ⑤ 소식·채팅·스터디룸  시각은 서버가, 공개 오피스 글의 링크·연락처는 DB가 거른다. 방장이 소식을 지울 수 있다.
-- ⑥ 퍼널 이벤트       익명 insert에 방문자당·전체 횟수 제한과 400일 보관.
-- ⑦ 아바타 저장소     5MB·이미지만. ⑧ 푸시 구독  https만, 한 사람당 5개.
-- ⑨ 할 일 루틴 id    남의 루틴 id를 끼워 넣어 그 사람의 루틴 생성을 막는 길을 닫는다.
-- ⑩ 글귀·오피스 횟수  제보 10/시간, 오피스 생성 10/일. 글귀의 제보자는 보이지 않게.
--
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (여러 번 실행해도 안전)
-- 순서: 025 다음. 앱은 이 파일 전후 모두 동작한다 (my_profile이 없으면 예전처럼 표에서 읽는다).
-- ⚠️ 이 파일을 적용한 뒤 001·002·005·006·008·022를 다시 실행하면 여기서 바꾼 정책이 예전으로 돌아간다. 그러면 이 파일을 다시 실행한다.

-- ========== ② 쓰기 횟수 제한 ==========
create table if not exists public.write_attempts (
  kind text not null,
  key text not null,
  at timestamptz not null default now()
);
create index if not exists idx_write_attempts on public.write_attempts (kind, key, at);
alter table public.write_attempts enable row level security; -- 정책 없음 = 앱에서 접근 불가

-- 창(p_window) 안에 p_max번을 넘으면 P0003. 같은 키의 요청은 한 번에 하나씩 본다 (동시에 보내면 전부 통과한다).
create or replace function public.rate_limit(p_kind text, p_key text, p_max integer, p_window interval)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_kind || ':' || p_key, 0));
  if (select count(*) from write_attempts where kind = p_kind and key = p_key and at > now() - p_window) >= p_max then
    raise exception 'too many %', p_kind using errcode = 'P0003';
  end if;
  insert into write_attempts (kind, key) values (p_kind, p_key);
end;
$$;
revoke all on function public.rate_limit(text, text, integer, interval) from public, anon, authenticated;

-- ========== ① 프로필 열 범위 ==========
-- 낯선 사람(같은 오피스)에게 보이는 열은 셋. 근무 시작 시간·회고 요일·마지막으로 본 오피스·알림 기록은 본인만 본다.
revoke select on public.profiles from anon, authenticated;
grant select (id, nickname, avatar_url, created_at) on public.profiles to authenticated;

-- 내 프로필 전체. 행 정책은 열을 가리지 못하므로 정의자 함수로 준다.
create or replace function public.my_profile()
returns setof public.profiles
language sql stable security definer set search_path = public, pg_temp as $$
  select * from public.profiles where id = auth.uid() limit 1;
$$;
revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- 공개 오피스는 '같은 오피스'가 아니다. 거기서는 모르는 사람끼리라 본명·사진을 보여 주지 않는다.
create or replace function public.shares_office_with(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from office_members mine
    join office_members theirs on theirs.office_id = mine.office_id
    join offices o on o.id = mine.office_id and not o.is_public
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

-- 공개 오피스 멤버 행은 늘 이름을 가진다. 프로필이 안 보이게 됐으니 이름이 비면 '알 수 없음'으로 보인다.
-- 프로필 이름으로 들어가기를 고른 사람은 그 이름을 복사한다 (본인이 고른 것이다). 겹치면 뒤에 네 글자를 붙인다.
create or replace function public.office_members_public_nickname()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.nickname is null and public.is_public_office(new.office_id) then
    select nickname into new.nickname from profiles where id = new.user_id;
    if new.nickname is null then new.nickname := '멤버'; end if;
    if exists (select 1 from office_members where office_id = new.office_id
                 and lower(btrim(nickname)) = lower(btrim(new.nickname))) then
      new.nickname := left(new.nickname, 15) || '-' || left(new.user_id::text, 4);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.office_members_public_nickname() from public, anon, authenticated;
drop trigger if exists office_members_public_nickname on public.office_members;
create trigger office_members_public_nickname before insert on public.office_members
  for each row execute function public.office_members_public_nickname();

-- 이미 들어와 있는 공개 오피스 멤버도 이름을 채운다 (겹치면 접미사)
update public.office_members m
   set nickname = case
     when exists (select 1 from public.office_members x
                   where x.office_id = m.office_id and x.user_id <> m.user_id
                     and lower(btrim(coalesce(x.nickname, ''))) = lower(btrim(p.nickname)))
       then left(p.nickname, 15) || '-' || left(m.user_id::text, 4)
     else p.nickname end
  from public.profiles p, public.offices o
 where m.user_id = p.id and o.id = m.office_id and o.is_public and m.nickname is null;

-- ========== ③ 세션 표 잠금 ==========
-- 자기 세션을 고치되 오피스·주인은 못 바꾼다 (예전엔 with check가 없어 다른 오피스로 옮길 수 있었다)
drop policy if exists work_update on public.work_sessions;
create policy work_update on public.work_sessions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_office_member(office_id));
drop policy if exists status_update on public.status_sessions;
create policy status_update on public.status_sessions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_office_member(office_id));
drop policy if exists focus_update on public.focus_sessions;
create policy focus_update on public.focus_sessions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_office_member(office_id));
drop policy if exists work_update_admin on public.work_sessions;
create policy work_update_admin on public.work_sessions for update to authenticated
  using (public.is_office_admin(office_id)) with check (public.is_office_admin(office_id));
drop policy if exists status_update_admin on public.status_sessions;
create policy status_update_admin on public.status_sessions for update to authenticated
  using (public.is_office_admin(office_id)) with check (public.is_office_admin(office_id));
drop policy if exists focus_update_admin on public.focus_sessions;
create policy focus_update_admin on public.focus_sessions for update to authenticated
  using (public.is_office_admin(office_id)) with check (public.is_office_admin(office_id));

-- 앱이 고치는 열은 끝난 시각(집중은 길이도)뿐. 넣을 때 시각은 서버가 정한다.
revoke update, insert on public.work_sessions from anon, authenticated;
revoke update, insert on public.status_sessions from anon, authenticated;
revoke update, insert on public.focus_sessions from anon, authenticated;
grant update (ended_at) on public.work_sessions to authenticated;
grant update (ended_at) on public.status_sessions to authenticated;
grant update (ended_at, duration_seconds) on public.focus_sessions to authenticated;
grant insert (office_id, user_id) on public.work_sessions to authenticated;
grant insert (office_id, user_id, status) on public.status_sessions to authenticated;
grant insert (office_id, user_id, task_id) on public.focus_sessions to authenticated;

-- 1분에 10개까지, 시각은 서버 시계. 상태 하나 바꾸는 데 insert 한 번이면 된다.
create or replace function public.session_insert_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return new; end if; -- 크론·SQL Editor 행은 그대로
  perform public.rate_limit(tg_table_name, new.user_id::text, 10, interval '1 minute');
  new.created_at := now();
  new.started_at := now();
  new.ended_at := null;
  if tg_table_name = 'focus_sessions' then new.duration_seconds := null; end if;
  return new;
end;
$$;
revoke all on function public.session_insert_guard() from public, anon, authenticated;
drop trigger if exists work_sessions_guard on public.work_sessions;
create trigger work_sessions_guard before insert on public.work_sessions
  for each row execute function public.session_insert_guard();
drop trigger if exists status_sessions_guard on public.status_sessions;
create trigger status_sessions_guard before insert on public.status_sessions
  for each row execute function public.session_insert_guard();
drop trigger if exists focus_sessions_guard on public.focus_sessions;
create trigger focus_sessions_guard before insert on public.focus_sessions
  for each row execute function public.session_insert_guard();

-- 열린 상태 세션은 한 사람·오피스당 하나 (근무·집중은 001부터 그랬다). 이미 쌓인 중복은 최신만 남기고 닫는다.
with ranked as (
  select id, row_number() over (partition by user_id, office_id order by started_at desc) as rn
  from public.status_sessions where ended_at is null
)
update public.status_sessions s set ended_at = now()
  from ranked r where s.id = r.id and r.rn > 1;
create unique index if not exists one_open_status
  on public.status_sessions (user_id, office_id) where ended_at is null;

-- ========== ④ 길이 제한 ==========
alter table public.tasks drop constraint if exists tasks_title_len;
alter table public.tasks add constraint tasks_title_len check (char_length(title) between 1 and 120) not valid;
alter table public.tasks drop constraint if exists tasks_description_len;
alter table public.tasks add constraint tasks_description_len check (description is null or char_length(description) <= 2000) not valid;
alter table public.tasks drop constraint if exists tasks_category_len;
alter table public.tasks add constraint tasks_category_len check (category is null or char_length(category) <= 30) not valid;
alter table public.routines drop constraint if exists routines_title_len;
alter table public.routines add constraint routines_title_len check (char_length(title) between 1 and 120) not valid;
alter table public.routines drop constraint if exists routines_category_len;
alter table public.routines add constraint routines_category_len check (category is null or char_length(category) <= 30) not valid;
alter table public.task_reactions drop constraint if exists task_reactions_emoji_len;
alter table public.task_reactions add constraint task_reactions_emoji_len check (char_length(emoji) between 1 and 8) not valid;
alter table public.office_feed drop constraint if exists office_feed_emoji_len;
alter table public.office_feed add constraint office_feed_emoji_len check (emoji is null or char_length(emoji) <= 8) not valid;
alter table public.chat_messages drop constraint if exists chat_messages_content_len;
alter table public.chat_messages add constraint chat_messages_content_len check (char_length(content) between 1 and 1000) not valid;
alter table public.profiles drop constraint if exists profiles_avatar_url_len;
alter table public.profiles add constraint profiles_avatar_url_len check (avatar_url is null or char_length(avatar_url) <= 500) not valid;

-- ========== ⑤ 소식·채팅·스터디룸 ==========
-- 소식: 10분에 30개. 시각은 이틀 안에서만 받는다 (자정 자동 퇴근은 자정 시각으로 기록해야 한다).
-- 공개 오피스 글의 링크·연락처는 화면과 같은 규칙으로 DB도 거른다.
create or replace function public.office_feed_before_insert()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return new; end if;
  perform public.rate_limit('feed', new.user_id::text, 30, interval '10 minutes');
  if new.created_at is null or new.created_at > now() or new.created_at < now() - interval '2 days' then
    new.created_at := now();
  end if;
  if public.is_public_office(new.office_id)
     and coalesce(new.content, '') ~* '(https?://|www\.|\d{2,3}-\d{3,4}-\d{4}|@[[:alnum:]_.]+\.[[:alnum:]])' then
    raise exception 'links not allowed in public office' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.office_feed_before_insert() from public, anon, authenticated;
drop trigger if exists office_feed_before_insert on public.office_feed;
create trigger office_feed_before_insert before insert on public.office_feed
  for each row execute function public.office_feed_before_insert();

-- 방장은 오피스의 소식을 지울 수 있다 (낯선 사람의 글을 치울 길이 없었다)
drop policy if exists feed_delete on public.office_feed;
create policy feed_delete on public.office_feed for delete to authenticated
  using (user_id = auth.uid() or public.is_office_admin(office_id));

-- 채팅: 1분에 60개, 시각은 서버 시계 (10분 삭제 창과 7일 보관이 시각에 기댄다)
create or replace function public.chat_before_insert()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return new; end if;
  perform public.rate_limit('chat', new.user_id::text, 60, interval '1 minute');
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.chat_before_insert() from public, anon, authenticated;
drop trigger if exists chat_before_insert on public.chat_messages;
create trigger chat_before_insert before insert on public.chat_messages
  for each row execute function public.chat_before_insert();

-- 스터디룸: 한 시간에 10개. 공개 오피스의 제목·안내에 링크·연락처가 들어가지 않게.
create or replace function public.study_rooms_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return new; end if;
  perform public.rate_limit('study_room', new.host_id::text, 10, interval '1 hour');
  if public.is_public_office(new.office_id)
     and (new.title || ' ' || coalesce(new.note, '')) ~* '(https?://|www\.|\d{2,3}-\d{3,4}-\d{4}|@[[:alnum:]_.]+\.[[:alnum:]])' then
    raise exception 'links not allowed in public office' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.study_rooms_guard() from public, anon, authenticated;
do $$
begin
  if to_regclass('public.study_rooms') is not null then
    drop trigger if exists study_rooms_guard on public.study_rooms;
    create trigger study_rooms_guard before insert on public.study_rooms
      for each row execute function public.study_rooms_guard();
    -- 나간 사람의 행 전체가 realtime으로 모든 구독자에게 나가지 않게 (삭제 이벤트에는 정책이 안 걸린다)
    alter table public.study_room_members replica identity default;
  end if;
end $$;

-- ========== ⑥ 퍼널 이벤트 ==========
-- 익명 insert가 열려 있다. 방문자당 1분 60개, 전체 1분 3000개. 시각은 서버 시계. 400일 지나면 지운다.
create or replace function public.events_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.rate_limit('events', new.visitor_id, 60, interval '1 minute');
  perform public.rate_limit('events-all', 'all', 3000, interval '1 minute');
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.events_guard() from public, anon, authenticated;
do $$
begin
  if to_regclass('public.events') is not null then
    drop trigger if exists events_guard on public.events;
    create trigger events_guard before insert on public.events
      for each row execute function public.events_guard();
  end if;
end $$;

-- ========== ⑦ 아바타 저장소 ==========
-- 5MB, 이미지 네 종류만. 버킷이 공개라 아무 파일이나 올리면 프로젝트 주소로 서빙된다.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets
       set file_size_limit = 5242880,
           allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
     where id = 'avatars';
  end if;
end $$;

-- ========== ⑧ 푸시 구독 ==========
-- https 주소만, 한 사람당 5개 (기기마다 하나). 아무 주소나 수천 개 넣으면 함수가 그 서버로 요청을 퍼붓는다.
alter table public.push_subscriptions drop constraint if exists push_endpoint_https;
alter table public.push_subscriptions add constraint push_endpoint_https
  check (endpoint ~ '^https://' and char_length(endpoint) <= 1000) not valid;
create or replace function public.push_subscriptions_before_insert()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return new; end if;
  delete from push_subscriptions
   where user_id = new.user_id
     and id not in (select id from push_subscriptions where user_id = new.user_id order by created_at desc limit 4);
  return new;
end;
$$;
revoke all on function public.push_subscriptions_before_insert() from public, anon, authenticated;
drop trigger if exists push_subscriptions_before_insert on public.push_subscriptions;
create trigger push_subscriptions_before_insert before insert on public.push_subscriptions
  for each row execute function public.push_subscriptions_before_insert();

-- ========== ⑨ 할 일 루틴 id ==========
-- routine_id에 남의 루틴 id를 넣으면 (routine_id, week_start) 유니크 자리를 차지해 그 사람의 이번 주 루틴 할 일이 안 생긴다.
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    user_id = auth.uid() and public.is_office_member(office_id)
    and (routine_id is null or exists (select 1 from public.routines r where r.id = tasks.routine_id and r.user_id = auth.uid()))
  );
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and public.is_office_member(office_id)
    and (routine_id is null or exists (select 1 from public.routines r where r.id = tasks.routine_id and r.user_id = auth.uid()))
  );

-- ========== ⑩ 글귀·오피스 ==========
create or replace function public.quotes_before_insert()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return new; end if;
  perform public.rate_limit('quote', new.created_by::text, 10, interval '1 hour');
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.quotes_before_insert() from public, anon, authenticated;
drop trigger if exists quotes_before_insert on public.quotes;
create trigger quotes_before_insert before insert on public.quotes
  for each row execute function public.quotes_before_insert();
-- 제보자는 보이지 않게 (글귀는 익명이다). 앱은 text만 읽는다.
revoke select on public.quotes from anon, authenticated;
grant select (id, text, approved, created_at) on public.quotes to authenticated;

create or replace function public.offices_before_insert()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return new; end if;
  perform public.rate_limit('office', auth.uid()::text, 10, interval '1 day');
  return new;
end;
$$;
revoke all on function public.offices_before_insert() from public, anon, authenticated;
drop trigger if exists offices_before_insert on public.offices;
create trigger offices_before_insert before insert on public.offices
  for each row execute function public.offices_before_insert();

-- ========== 보관 ==========
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('write-attempts-retention', '17 19 * * *',
      $job$delete from public.write_attempts where at < now() - interval '1 day'$job$);
    if to_regclass('public.events') is not null then
      perform cron.schedule('events-retention', '27 19 * * *',
        $job$delete from public.events where created_at < now() - interval '400 days'$job$);
    end if;
  end if;
end $$;

-- 새 함수·열 권한을 API가 바로 알아보게 한다
notify pgrst, 'reload schema';
