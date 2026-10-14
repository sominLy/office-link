-- 공개 전 점검 — 019·022·023·024·025·026·027이 운영 DB에 의도대로 들어갔는지 한 표로 본다.
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run.
-- 모든 줄이 ✅이어야 링크를 밖에 돌린다. ❌이면 '고칠 일' 칸대로 한 뒤 다시 Run.
-- 019·022·023·024·025·026을 적용한 DB에서 실행한다 (적용 전에는 없는 열·테이블 때문에 표 대신 오류가 난다).

select t.item as "항목",
       case when t.ok then '✅' else '❌' end as "상태",
       case when t.ok then '' else t.fix end as "고칠 일"
from (values
  ('운영자 등록',
    exists (select 1 from public.app_admins),
    '019 맨 아래 운영자 등록을 연결오피스 로그인 이메일로 실행'),
  ('공개 오피스',
    exists (select 1 from public.offices where is_public),
    '022 다시 실행'),
  ('공개 오피스 방장',
    exists (
      select 1 from public.office_members m
      join public.offices o on o.id = m.office_id
      where o.is_public and m.role = 'admin'
    ),
    '운영자 등록 뒤 022 다시 실행 (운영자 계정이 앱에서 닉네임 설정까지 마친 상태여야 한다)'),
  ('오피스 목록 잠금',
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'offices'
        and policyname = 'offices_select' and qual <> 'true'
    ),
    '022 다시 실행'),
  ('멤버 가입 잠금',
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'office_members'
        and policyname = 'members_insert' and with_check like '%is_public_office%'
    ),
    '022 다시 실행'),
  ('멤버 행 수정 범위',
    has_column_privilege('authenticated', 'public.office_members', 'nickname', 'UPDATE')
      and not has_column_privilege('authenticated', 'public.office_members', 'office_id', 'UPDATE')
      and not has_column_privilege('authenticated', 'public.office_members', 'role', 'UPDATE'),
    '023 다시 실행 (멤버 행의 office_id를 바꿔 다른 오피스에 들어갈 수 있는 상태다)'),
  ('초대 코드 입장 함수',
    to_regprocedure('public.join_office_by_code(text)') is not null,
    '022 다시 실행'),
  ('오피스 수정 범위',
    has_column_privilege('authenticated', 'public.offices', 'title_mode', 'UPDATE')
      and not has_column_privilege('authenticated', 'public.offices', 'is_public', 'UPDATE'),
    '022 다시 실행'),
  ('프로필 조회 잠금',
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'profiles'
        and policyname = 'profiles_select' and qual like '%shares_office_with%'
    ),
    '022 다시 실행'),
  ('공개 오피스 채팅 차단',
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'chat_messages'
        and policyname = 'chat_insert' and with_check like '%is_public_office%'
    ),
    '022 다시 실행'),
  ('프로필 사진 목록 잠금',
    exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'avatar_read' and roles = '{authenticated}'::name[]
    ),
    '022 다시 실행'),
  ('퍼널 이벤트 테이블',
    to_regclass('public.events') is not null,
    '021 실행'),
  -- 024: 링크는 화상 회의 서비스 주소만. 이 제약이 없으면 공개 오피스에서 아무 주소나 올릴 수 있다.
  ('스터디룸 링크 제한',
    exists (select 1 from pg_constraint where conname = 'study_rooms_url_allowed'),
    '024 실행'),
  ('스터디룸 수정 범위',
    has_column_privilege('authenticated', 'public.study_rooms', 'ended_at', 'UPDATE')
      and not has_column_privilege('authenticated', 'public.study_rooms', 'host_id', 'UPDATE')
      and not has_column_privilege('authenticated', 'public.study_rooms', 'office_id', 'UPDATE')
      and has_column_privilege('authenticated', 'public.study_rooms', 'starts_at', 'INSERT')
      and not has_column_privilege('authenticated', 'public.study_rooms', 'created_at', 'INSERT')
      and not has_column_privilege('authenticated', 'public.study_rooms', 'ended_at', 'INSERT'),
    '024 다시 실행 (방의 host_id·office_id를 바꾸거나 created_at을 앱이 정할 수 있는 상태다)'),
  ('스터디룸 이벤트 허용',
    exists (
      select 1 from pg_constraint
      where conname = 'events_name_allowed' and pg_get_constraintdef(oid) like '%study_room_created%'
    ),
    '024 다시 실행 (스터디룸 열기·참여가 퍼널에 적재되지 않는다)'),
  -- 025: 의견·문의. 앱은 user_id·kind·message·page만 넣고, 상태·답변은 운영자 함수만 바꾼다.
  ('의견·문의 테이블',
    to_regclass('public.feedback') is not null
      and to_regprocedure('public.admin_feedback_list()') is not null
      and to_regprocedure('public.admin_reply_feedback(uuid, text, text)') is not null,
    '025 실행'),
  ('의견·문의 횟수 기록',
    to_regclass('public.feedback_attempts') is not null,
    '025 다시 실행 (보낸 글을 지우고 다시 보내는 것으로 한 시간 10개 제한을 피할 수 있다)'),
  -- 026: 공개 운영 보강
  ('프로필 열 범위',
    has_column_privilege('authenticated', 'public.profiles', 'nickname', 'SELECT')
      and not has_column_privilege('authenticated', 'public.profiles', 'work_start', 'SELECT')
      and not has_column_privilege('authenticated', 'public.profiles', 'current_office_id', 'SELECT')
      and to_regprocedure('public.my_profile()') is not null,
    '026 실행 (낯선 사람이 남의 근무 시간·마지막 오피스를 읽을 수 있는 상태다)'),
  ('공개 오피스는 프로필을 열지 않음',
    pg_get_functiondef('public.shares_office_with(uuid)'::regprocedure) like '%is_public%',
    '026 다시 실행 (공개 오피스 멤버끼리 본명·사진이 보인다)'),
  ('공개 오피스 멤버 이름 채움',
    not exists (
      select 1 from public.office_members m join public.offices o on o.id = m.office_id
      where o.is_public and m.nickname is null
    ),
    '026 다시 실행 (공개 오피스에서 이름이 빈 멤버가 "알 수 없음"으로 보인다)'),
  ('쓰기 횟수 기록 표',
    to_regclass('public.write_attempts') is not null
      and to_regprocedure('public.rate_limit(text, text, integer, interval)') is not null,
    '026 실행'),
  ('세션 표 수정·넣기 범위',
    has_column_privilege('authenticated', 'public.work_sessions', 'ended_at', 'UPDATE')
      and not has_column_privilege('authenticated', 'public.work_sessions', 'office_id', 'UPDATE')
      and not has_column_privilege('authenticated', 'public.work_sessions', 'started_at', 'INSERT')
      and not has_column_privilege('authenticated', 'public.status_sessions', 'started_at', 'INSERT')
      and not has_column_privilege('authenticated', 'public.focus_sessions', 'duration_seconds', 'INSERT'),
    '026 다시 실행 (세션을 다른 오피스로 옮기거나 시각을 앱이 정할 수 있는 상태다)'),
  ('열린 상태 세션은 하나',
    exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'one_open_status'),
    '026 다시 실행'),
  ('할 일 루틴 id 검사',
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'tasks'
        and policyname = 'tasks_insert' and with_check like '%routines%'
    ),
    '026 다시 실행 (남의 루틴 id를 끼워 넣어 그 사람의 루틴 생성을 막을 수 있다)'),
  ('소식·채팅·세션·이벤트 트리거',
    exists (select 1 from pg_trigger where tgname = 'office_feed_before_insert' and not tgisinternal)
      and exists (select 1 from pg_trigger where tgname = 'chat_before_insert' and not tgisinternal)
      and exists (select 1 from pg_trigger where tgname = 'status_sessions_guard' and not tgisinternal)
      and exists (select 1 from pg_trigger where tgname = 'events_guard' and not tgisinternal),
    '026 다시 실행'),
  ('아바타 버킷 제한',
    exists (select 1 from storage.buckets where id = 'avatars' and file_size_limit is not null and allowed_mime_types is not null),
    '026 다시 실행 (아무 파일이나 크기 제한 없이 올릴 수 있다)'),
  ('푸시 구독 주소 제한',
    exists (select 1 from pg_constraint where conname = 'push_endpoint_https'),
    '026 다시 실행'),
  ('글귀 제보자 숨김',
    not has_column_privilege('authenticated', 'public.quotes', 'created_by', 'SELECT'),
    '026 다시 실행'),
  ('의견·문의 쓰기 범위',
    has_column_privilege('authenticated', 'public.feedback', 'message', 'INSERT')
      and not has_column_privilege('authenticated', 'public.feedback', 'status', 'INSERT')
      and not has_column_privilege('authenticated', 'public.feedback', 'reply', 'INSERT')
      and not has_table_privilege('authenticated', 'public.feedback', 'UPDATE'),
    '025 다시 실행 (앱에서 상태·답변을 직접 바꿀 수 있는 상태다)'),
  -- 027: 사진 첨부. 비공개 버킷이어야 하고(주소만으로 못 본다), 앱이 images 열을 넣을 수 있어야 한다.
  ('의견·문의 사진 버킷',
    exists (select 1 from storage.buckets where id = 'feedback-images' and not public and file_size_limit is not null)
      and exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'feedback_img_read')
      and has_column_privilege('authenticated', 'public.feedback', 'images', 'INSERT')
      and exists (select 1 from pg_trigger where tgname = 'feedback_images_guard' and not tgisinternal),
    '027 실행'),
  ('오피스 수정 정책',
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'offices'
        and policyname = 'offices_update' and qual like '%is_office_admin%'
    ),
    '022 다시 실행 (007을 다시 실행했다면 예전 정책으로 돌아간다)'),
  ('오피스 생성 정책',
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'offices'
        and policyname = 'offices_insert' and with_check like '%is_public%'
    ),
    '022 다시 실행'),
  ('초대 코드 서버 생성',
    exists (select 1 from pg_trigger where tgname = 'offices_invite_code' and not tgisinternal),
    '022 다시 실행'),
  ('함수 실행 권한',
    has_function_privilege('authenticated', 'public.join_office_by_code(text)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.is_public_office(uuid)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.shares_office_with(uuid)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.join_office_by_code(text)', 'EXECUTE'),
    '022 다시 실행'),
  ('상태 값 제한',
    exists (select 1 from pg_constraint where conname = 'status_sessions_status_allowed'),
    '022 다시 실행'),
  ('응원 글귀 승인제',
    (select column_default from information_schema.columns
     where table_schema = 'public' and table_name = 'quotes' and column_name = 'approved') = 'false',
    '022 다시 실행'),
  ('공개 오피스는 하나',
    (select count(*) = 1 and bool_and(created_by is null) from public.offices where is_public),
    'select id, name, created_by from public.offices where is_public 로 확인'),
  ('초대 코드 형식',
    not exists (select 1 from public.offices where invite_code <> upper(btrim(invite_code))),
    '소문자·공백이 섞인 코드는 입장 함수가 찾지 못한다. update public.offices set invite_code = upper(btrim(invite_code))'),
  -- 길이 제약은 기존 행을 검사하지 않지만 그 행을 수정할 때는 검사한다. 걸리는 행이 있으면
  -- 그 사람의 오피스 전환 저장과 미출근 알림 기록까지 실패한다.
  ('길이 제한에 걸리는 예전 행 없음',
    not exists (select 1 from public.profiles where char_length(btrim(nickname)) not between 1 and 30)
      and not exists (select 1 from public.offices where char_length(name) not between 1 and 40),
    '해당 닉네임·오피스 이름을 줄인다'),
  -- 운영 DB의 테이블은 001보다 먼저 대시보드에서 만들어졌다. 그때 만든 정책이 다른 이름으로 남아 있으면
  -- 022의 잠금과 OR로 합쳐져 잠금이 풀린다. 위 줄들은 정해진 이름만 보므로 따로 확인한다.
  ('RLS 꺼진 테이블 없음',
    not exists (
      select 1 from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity
    ),
    'select relname from pg_class where relnamespace = ''public''::regnamespace and relkind = ''r'' and not relrowsecurity 로 찾아 alter table … enable row level security'),
  ('저장소에 없는 정책 없음',
    not exists (
      select 1 from pg_policies p
      where (p.schemaname = 'public' or (p.schemaname = 'storage' and p.tablename = 'objects'))
        and p.policyname <> all (array[
          'achievements_insert','achievements_select','announcements_select','chat_delete','chat_insert','chat_select',
          'reads_insert','reads_select','reads_update','events_insert','focus_insert','focus_select','focus_update','focus_update_admin',
          'feed_delete','feed_insert','feed_select','members_delete','members_insert','members_select','members_update_self',
          'offices_delete','offices_insert','offices_select','offices_update','profiles_insert','profiles_select','profiles_update',
          'push_delete','push_insert','push_select','push_update','quotes_delete','quotes_insert','quotes_select',
          'routines_delete','routines_insert','routines_select','routines_update','status_insert','status_select','status_update','status_update_admin',
          'reactions_delete','reactions_insert','reactions_select','tasks_delete','tasks_insert','tasks_select','tasks_update',
          'reflections_delete','reflections_insert','reflections_select','reflections_update',
          'study_rooms_select','study_rooms_insert','study_rooms_update','study_rooms_delete',
          'study_members_select','study_members_insert','study_members_delete',
          'feedback_select','feedback_insert','feedback_delete',
          'work_insert','work_select','work_update','work_update_admin',
          'avatar_delete','avatar_insert','avatar_read','avatar_update',
          'feedback_img_read','feedback_img_insert','feedback_img_delete'])
    ),
    'select schemaname, tablename, policyname, cmd, qual from pg_policies 로 낯선 이름을 찾아 내용을 보고 drop policy'),
  -- 처리방침에 "채팅은 7일 뒤 삭제"라고 적었다. 그 일을 하는 크론 작업이 실제로 걸려 있는지 본다.
  ('채팅 7일 삭제 작업',
    exists (select 1 from cron.job where jobname = 'chat-cleanup'),
    '014_chat_full.sql 맨 아래의 cron.schedule 다시 실행')
) as t(item, ok, fix);
