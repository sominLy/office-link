-- 스터디룸 — 줌·구글밋 링크로 모여 실시간으로 같이 공부한다 (인적성 같이 풀기).
--
-- 왜 필요한가: 오피스는 "같이 출근해 있다"는 느낌까지만 준다. 같이 문제를 풀려면 화상 회의
--   링크를 채팅에 올리고 누가 들어왔는지 따로 물어봐야 했다. 공개 오피스는 채팅이 없어서
--   그것도 안 된다.
--
-- 어떻게: study_rooms(방)와 study_room_members(참여자) 두 테이블.
--   방은 오피스 멤버 누구나 연다. 링크는 알려진 화상 회의 서비스 주소만 받는다(CHECK).
--   화면의 검사는 API로 직접 넣으면 건너뛰므로, 공개 오피스에서 모르는 사람이 아무 주소나
--   올리는 것은 여기서 막는다. 방은 8시간이 지나면 끝난 것으로 보고 크론이 닫는다.
--
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (여러 번 실행해도 안전)
-- 순서: 022 다음에 실행한다 (008의 is_office_admin, 022의 is_public_office·pg_temp 고정 방식을 따른다).
-- 푸시: 방을 열면 멤버에게 알리는 'study' 액션이 push-notify 함수에 있다. 함수도 다시 배포한다.

-- ========== ① 방 ==========
create table if not exists public.study_rooms (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  -- profiles를 참조해야 PostgREST가 study_rooms→profiles 조인(embed)을 해석할 수 있다 (001의 office_members와 같다)
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  subject text,            -- 인적성 영역: 언어·수리·추리·시각·상식·인성 (없으면 null)
  meeting_url text not null,
  note text,               -- "GSAT 수리 10번부터" 같은 한 줄 안내
  starts_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint study_rooms_title_len check (char_length(btrim(title)) between 1 and 40),
  constraint study_rooms_subject_len check (subject is null or char_length(btrim(subject)) between 1 and 20),
  constraint study_rooms_note_len check (note is null or char_length(note) <= 120),
  constraint study_rooms_url_len check (char_length(meeting_url) <= 500),
  -- 화상 회의 서비스 주소만. https 고정, 호스트는 목록의 도메인이거나 그 하위 도메인(us02web.zoom.us).
  -- 호스트 바로 뒤에는 경로(/…)나 끝만 허용한다. 사용자 정보·포트가 끼어드는 꼴
  -- (https://zoom.us@evil.com, https://zoom.us:443@…)은 그래서 걸러진다.
  constraint study_rooms_url_allowed check (
    meeting_url ~* '^https://([a-z0-9-]+\.)*(zoom\.us|zoom\.com|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|discord\.gg|discord\.com|webex\.com|whereby\.com)(/[^[:space:]]*)?$'
  ),
  -- 시작 시각은 하루 전부터 일주일 뒤까지만 (앱은 오늘 안의 시각만 고른다)
  constraint study_rooms_starts_sane check (
    starts_at between created_at - interval '1 day' and created_at + interval '7 days'
  )
);

-- 홈은 "끝나지 않은 방"만 본다
create index if not exists idx_study_rooms_open on public.study_rooms (office_id, starts_at desc) where ended_at is null;

-- ========== ② 참여자 ==========
create table if not exists public.study_room_members (
  room_id uuid not null references public.study_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- 방의 오피스. realtime 필터와 조회 정책에 쓴다. 아래 트리거가 방에서 채우므로 앱이 보낸 값은 버린다.
  office_id uuid not null references public.offices(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists idx_study_room_members_office on public.study_room_members (office_id, user_id);

-- 나간 사람은 행을 지운다. 삭제 이벤트에는 정책이 안 걸려서 옛 행 전체를 싣지 않는다(기본키만).
-- 앱은 삭제 이벤트를 필터 없이 받아 아는 방의 것일 때만 다시 읽는다.
alter table public.study_room_members replica identity default;

create or replace function public.set_study_room_member_office()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  select office_id into new.office_id from study_rooms where id = new.room_id;
  if new.office_id is null then
    raise exception 'study room not found' using errcode = '23503';
  end if;
  new.joined_at := now();
  return new;
end;
$$;

drop trigger if exists study_room_members_office on public.study_room_members;
create trigger study_room_members_office before insert on public.study_room_members
  for each row execute function public.set_study_room_member_office();

-- ========== ③ 정책 ==========
alter table public.study_rooms enable row level security;
alter table public.study_room_members enable row level security;

-- 방: 같은 오피스 멤버가 본다. 여는 건 본인 명의로 자기 오피스에만.
drop policy if exists study_rooms_select on public.study_rooms;
create policy study_rooms_select on public.study_rooms for select to authenticated
  using (public.is_office_member(office_id));
drop policy if exists study_rooms_insert on public.study_rooms;
create policy study_rooms_insert on public.study_rooms for insert to authenticated
  with check (host_id = auth.uid() and public.is_office_member(office_id));
-- 닫기·고치기는 연 사람. 방장은 연 사람이 깜빡한 방을 대신 닫을 수 있다 (008의 대리 퇴근과 같다).
drop policy if exists study_rooms_update on public.study_rooms;
create policy study_rooms_update on public.study_rooms for update to authenticated
  using (host_id = auth.uid() or public.is_office_admin(office_id))
  with check (host_id = auth.uid() or public.is_office_admin(office_id));
drop policy if exists study_rooms_delete on public.study_rooms;
create policy study_rooms_delete on public.study_rooms for delete to authenticated
  using (host_id = auth.uid());

-- 앱이 고치는 열만 연다. office_id·host_id를 바꿔 방을 다른 오피스로 옮기거나 남의 이름으로 두는 길을 막는다.
revoke update on public.study_rooms from anon, authenticated;
grant update (title, subject, note, meeting_url, starts_at, ended_at) on public.study_rooms to authenticated;

-- 넣을 때도 앱이 보내는 열만 받는다. created_at·ended_at을 앱이 정하면 starts_sane 제약이 그 값을 기준으로
-- 검사돼 2099년에 시작하는 방을 넣을 수 있다. 그 방은 영원히 '예정'으로 남고 크론도 닫지 않는다.
revoke insert on public.study_rooms from anon, authenticated;
grant insert (office_id, host_id, title, subject, meeting_url, note, starts_at) on public.study_rooms to authenticated;

-- 시각은 서버가 정한다 (022의 set_member_joined_at과 같은 이유). 열 권한과 겹치지만 둘 중 하나가 빠져도 막히게.
create or replace function public.study_rooms_before_insert()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return new; end if; -- SQL Editor·service role 행은 그대로
  new.created_at := now();
  new.ended_at := null;
  if new.starts_at is null then new.starts_at := now(); end if;
  return new;
end;
$$;

drop trigger if exists study_rooms_before_insert on public.study_rooms;
create trigger study_rooms_before_insert before insert on public.study_rooms
  for each row execute function public.study_rooms_before_insert();

-- 참여자: 같은 오피스 멤버가 본다. 들어가는 건 본인만, 끝나지 않은 방에만. 나가는 것도 본인만.
drop policy if exists study_members_select on public.study_room_members;
create policy study_members_select on public.study_room_members for select to authenticated
  using (public.is_office_member(office_id));
drop policy if exists study_members_insert on public.study_room_members;
create policy study_members_insert on public.study_room_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_office_member(office_id)
    and exists (select 1 from public.study_rooms r where r.id = study_room_members.room_id and r.ended_at is null)
  );
drop policy if exists study_members_delete on public.study_room_members;
create policy study_members_delete on public.study_room_members for delete to authenticated
  using (user_id = auth.uid());
-- UPDATE 정책 없음. 다시 들어올 때는 insert … on conflict do nothing으로 처리하므로 필요 없다.

revoke all on function public.set_study_room_member_office() from public, anon, authenticated;
revoke all on function public.study_rooms_before_insert() from public, anon, authenticated;

-- ========== ④ Realtime ==========
do $$
begin
  begin
    alter publication supabase_realtime add table public.study_rooms;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.study_room_members;
  exception when duplicate_object then null;
  end;
end $$;

-- ========== ⑤ 오래 열린 방 닫기 ==========
-- 연 사람이 종료를 안 누르면 방이 영원히 "진행 중"으로 남는다. 앱은 8시간이 지난 방을 끝난 것으로
-- 그리고, 크론이 30분마다 실제로 닫는다 (pg_cron이 없으면 앱 쪽 판단만 남는다).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('study-rooms-autoclose', '*/30 * * * *',
      $job$update public.study_rooms
         set ended_at = starts_at + interval '8 hours'
       where ended_at is null and starts_at < now() - interval '8 hours'$job$);
  end if;
end $$;

-- ========== ⑥ 퍼널 이벤트 ==========
-- 021의 허용 목록에 스터디룸 이벤트를 더한다 (src/lib/funnel.ts의 EventName과 같아야 한다).
-- 뒤 번호(025)가 더 긴 목록으로 제약을 바꾼 뒤에는 그 이름의 행이 이미 있어서 이 짧은 목록으로 되돌릴 수 없다.
-- 스터디룸 이름이 이미 들어 있으면 건너뛴다 (재실행 안전).
do $$
begin
  if to_regclass('public.events') is not null
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.events'::regclass and conname = 'events_name_allowed'
         and pg_get_constraintdef(oid) like '%study_room_joined%'
     ) then
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
      'study_room_joined'
    ));
  end if;
end $$;

-- 새 테이블을 API가 바로 알아보게 한다
notify pgrst, 'reload schema';
