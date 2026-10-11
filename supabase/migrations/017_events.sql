-- 퍼널 계측 이벤트 적재용. 유입(비로그인) 구간부터 기능 사용까지 한 테이블에 모은다.
-- 조회 정책은 두지 않는다 = service role(대시보드 SQL Editor)만 읽을 수 있다.
-- 사용자에게 다른 사람의 행동 로그를 돌려주지 않기 위한 것이다 (010_app_state와 같은 방식).
-- 실행 방법: Supabase 대시보드 → SQL Editor에 전체 붙여넣기 → Run

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  -- 비로그인 이벤트(랜딩 도착·가입 시작)는 user_id가 null이다
  user_id uuid references auth.users(id) on delete set null,
  -- 브라우저에 영구 보관하는 방문자 식별자. 세션(방문)은 분석 시 시간 간격으로 끊는다
  visitor_id text not null,
  name text not null,
  -- 유입 채널. ?from= 또는 utm_source를 첫 방문에 저장해 이후 모든 이벤트에 붙인다
  source text,
  props jsonb,
  created_at timestamptz not null default now(),
  -- 허용 목록. anon INSERT를 열어두므로 임의 이름으로 테이블이 오염되는 것을 막는다.
  -- ⚠️ 이벤트를 추가할 때 이 파일만 고쳐 다시 Run해도 제약은 바뀌지 않는다
  --    (create table if not exists라 테이블 생성이 건너뛰어진다).
  --    새 이벤트는 018 마이그레이션에서
  --    alter table public.events drop constraint events_name_allowed,
  --      add constraint events_name_allowed check (name in (...));
  --    로 교체하고, src/lib/analytics.ts의 EventName에도 같이 추가해야 한다.
  constraint events_name_allowed check (name in (
    'app_open',
    'page_view',
    'landing_view',
    'signup_start',
    'signup_complete',
    'office_joined',
    'clock_in',
    'task_created',
    'focus_started',
    'reaction_sent'
  )),
  constraint events_visitor_id_fmt check (visitor_id ~ '^[0-9a-fA-F-]{8,64}$'),
  constraint events_source_len check (source is null or char_length(source) <= 64),
  -- anon INSERT를 열어두므로 행 하나가 무한히 커지는 것은 막는다.
  -- pg_column_size는 STABLE이라 CHECK에서 거부된다. jsonb→text 캐스트는 immutable이라 쓸 수 있다.
  constraint events_props_size check (props is null or length(props::text) <= 1024)
);

create index if not exists events_name_created_idx on public.events (name, created_at);
create index if not exists events_user_created_idx on public.events (user_id, created_at);
create index if not exists events_visitor_idx on public.events (visitor_id, created_at);

alter table public.events enable row level security;

-- INSERT만 허용한다. 랜딩 도착·가입 시작은 로그인 전이므로 anon도 포함해야 한다.
-- 로그인한 사용자가 남의 user_id로 이벤트를 넣는 것은 막는다(anon은 null만 가능).
drop policy if exists events_insert on public.events;
create policy events_insert on public.events
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- SELECT/UPDATE/DELETE 정책 없음 = anon/authenticated 접근 불가
