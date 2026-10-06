-- 운영 대시보드 (/admin) — 방문자·이용 시간·기능 사용·리텐션·오피스·업데이트 전후 비교
-- ① app_admins: 여기 등록된 계정만 대시보드를 볼 수 있다 (앱에서 읽기·쓰기 불가)
-- ② app_usage_daily: 로그인 사용자의 하루 이용 기록 1줄 — 앱을 연 횟수, 화면을 본 시간, 실제로 조작한 시간, 화면별 조회
-- ③ app_anon_visits: 로그인 전 방문 — 기기별 하루 1줄 + 어디서 왔는지(utm_source나 링크를 건 사이트)
-- ④ user_acquisition: 가입한 사람이 처음 어디서 왔는지
-- ⑤ analytics_chat_daily: 채팅은 7일 뒤 지워지므로 개수만 날짜별로 남긴다 (내용은 저장하지 않음)
-- ⑥ analytics_markers: '인스타 홍보 시작' 같은 일을 차트에 표시하는 메모 (업데이트 공지는 자동으로 표시)
-- ⑦ admin_dashboard(): 모든 지표를 한 번에 계산 — 운영자가 아니면 오류
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (여러 번 실행해도 안전)
-- 실행한 뒤 맨 아래 '운영자 등록'을 본인 이메일로 한 번 실행하세요.

-- ========== ① 운영자 ==========
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security; -- 정책 없음 = 앱에서 접근 불가

create or replace function public.is_app_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

-- ========== ② 로그인 사용자의 하루 이용 기록 ==========
create table if not exists public.app_usage_daily (
  day date not null,                              -- 한국 날짜
  user_id uuid not null references auth.users(id) on delete cascade,
  visits integer not null default 0,              -- 앱을 연 횟수 (30분 넘게 비웠다가 돌아온 것도 1번)
  visible_sec integer not null default 0,         -- 화면이 보이던 시간
  active_sec integer not null default 0,          -- 그중 실제로 누르거나 스크롤한 시간 (마지막 조작 후 60초까지)
  pages jsonb not null default '{}'::jsonb,       -- 화면별 조회 수 {"/retro": 2}
  page_sec jsonb not null default '{}'::jsonb,    -- 화면별 조작 시간(초) {"/retro": 95}
  standalone boolean,                             -- 홈 화면에 설치한 앱으로 열었는지 (마지막 기록)
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (day, user_id)
);
alter table public.app_usage_daily enable row level security;

-- ========== ③ 로그인 전 방문 ==========
create table if not exists public.app_anon_visits (
  day date not null,
  device_id uuid not null,      -- 브라우저에 저장한 무작위 번호 (개인 정보 아님)
  source text,                  -- utm_source 또는 링크를 건 사이트 도메인, 없으면 null(직접 방문)
  created_at timestamptz not null default now(),
  primary key (day, device_id)
);
alter table public.app_anon_visits enable row level security;
create index if not exists idx_anon_visits_device on public.app_anon_visits (device_id, day);

-- ========== ④ 가입자의 첫 유입 경로 ==========
create table if not exists public.user_acquisition (
  user_id uuid primary key references auth.users(id) on delete cascade,
  device_id uuid,
  source text,
  created_at timestamptz not null default now()
);
alter table public.user_acquisition enable row level security;

-- ========== ⑤ 채팅 일별 개수 ==========
create table if not exists public.analytics_chat_daily (
  day date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  kind text not null check (kind in ('chat', 'dm')),
  n integer not null default 0,
  primary key (day, user_id, office_id, kind)
);
alter table public.analytics_chat_daily enable row level security;

-- 이미 있는 채팅(최근 7일치)을 먼저 채워 넣는다 — 다시 실행해도 이미 집계된 날은 건너뜀
insert into public.analytics_chat_daily (day, user_id, office_id, kind, n)
select (c.created_at at time zone 'Asia/Seoul')::date, c.user_id, c.office_id,
       case when c.recipient_id is null then 'chat' else 'dm' end, count(*)
from public.chat_messages c
where not exists (
  select 1 from public.analytics_chat_daily a where a.day = (c.created_at at time zone 'Asia/Seoul')::date
)
group by 1, 2, 3, 4
on conflict do nothing;

create or replace function public.count_chat_message()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.analytics_chat_daily (day, user_id, office_id, kind, n)
    values ((new.created_at at time zone 'Asia/Seoul')::date, new.user_id, new.office_id,
            case when new.recipient_id is null then 'chat' else 'dm' end, 1)
    on conflict (day, user_id, office_id, kind) do update set n = public.analytics_chat_daily.n + 1;
  exception when others then
    null; -- 집계가 실패해도 채팅 전송은 막지 않는다
  end;
  return new;
end;
$$;

drop trigger if exists chat_count_daily on public.chat_messages;
create trigger chat_count_daily after insert on public.chat_messages
  for each row execute function public.count_chat_message();

-- ========== ⑥ 메모 ==========
create table if not exists public.analytics_markers (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  label text not null check (char_length(label) between 1 and 60),
  created_at timestamptz not null default now()
);
alter table public.analytics_markers enable row level security;

-- 한국 날짜가 속한 주의 월요일
create or replace function public.kst_week_start(d date)
returns date
language sql immutable as $$
  select d - (extract(isodow from d)::int - 1);
$$;

-- ========== 기록 함수 (앱이 부름) ==========

-- 화면 주소를 정해진 이름으로만 저장 — 임의 문자열이 쌓이지 않게
create or replace function public.analytics_path(p text)
returns text
language sql immutable set search_path = public as $$
  select case
    when p in ('/', '/tasks', '/feed', '/report', '/profile', '/retro', '/trophies', '/guide',
               '/clock-out', '/office-setup', '/admin') then p
    else 'other'
  end;
$$;

-- p_pages: {"/retro": {"v": 조회 수, "s": 화면 본 초, "a": 조작한 초}, ...}
create or replace function public.track_usage(
  p_visit boolean default false,
  p_pages jsonb default '{}'::jsonb,
  p_standalone boolean default null,
  p_device uuid default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_pages jsonb := '{}'::jsonb;
  v_page_sec jsonb := '{}'::jsonb;
  v_vis integer := 0;
  v_act integer := 0;
  r record;
  v_path text;
  v_v integer; v_s integer; v_a integer;
  n integer := 0;
begin
  if v_uid is null then return; end if;
  if p_pages is null or jsonb_typeof(p_pages) <> 'object' then p_pages := '{}'::jsonb; end if;

  for r in select key, value from jsonb_each(p_pages) loop
    n := n + 1;
    exit when n > 20;
    continue when jsonb_typeof(r.value) <> 'object';
    v_path := public.analytics_path(r.key);
    v_v := case when (r.value->>'v') ~ '^\d{1,4}$' then least((r.value->>'v')::int, 50) else 0 end;
    v_s := case when (r.value->>'s') ~ '^\d{1,6}$' then least((r.value->>'s')::int, 1800) else 0 end;
    v_a := case when (r.value->>'a') ~ '^\d{1,6}$' then least((r.value->>'a')::int, v_s) else 0 end;
    if v_v > 0 then
      v_pages := v_pages || jsonb_build_object(v_path, coalesce((v_pages->>v_path)::int, 0) + v_v);
    end if;
    if v_a > 0 then
      v_page_sec := v_page_sec || jsonb_build_object(v_path, coalesce((v_page_sec->>v_path)::int, 0) + v_a);
    end if;
    v_vis := v_vis + v_s;
    v_act := v_act + v_a;
  end loop;
  -- 한 번에 보내는 시간은 30분까지 (앱은 5분마다 보낸다)
  v_vis := least(v_vis, 1800);
  v_act := least(v_act, v_vis);

  insert into public.app_usage_daily as u (day, user_id, visits, visible_sec, active_sec, pages, page_sec, standalone)
  values (v_day, v_uid, case when p_visit then 1 else 0 end, v_vis, v_act, v_pages, v_page_sec, p_standalone)
  on conflict (day, user_id) do update set
    visits = least(u.visits + excluded.visits, 500),
    visible_sec = least(u.visible_sec + excluded.visible_sec, 86400),
    active_sec = least(u.active_sec + excluded.active_sec, 86400),
    pages = u.pages || coalesce((
      select jsonb_object_agg(e.key, coalesce((u.pages->>e.key)::int, 0) + e.value::int)
      from jsonb_each_text(excluded.pages) e), '{}'::jsonb),
    page_sec = u.page_sec || coalesce((
      select jsonb_object_agg(e.key, least(coalesce((u.page_sec->>e.key)::int, 0) + e.value::int, 86400))
      from jsonb_each_text(excluded.page_sec) e), '{}'::jsonb),
    standalone = coalesce(excluded.standalone, u.standalone),
    last_at = now();

  -- 처음 기록되는 사람이면, 같은 기기의 로그인 전 방문에서 유입 경로를 가져온다
  if p_device is not null and not exists (select 1 from public.user_acquisition where user_id = v_uid) then
    insert into public.user_acquisition (user_id, device_id, source)
    values (v_uid, p_device, (
      select a.source from public.app_anon_visits a
      where a.device_id = p_device order by a.day limit 1))
    on conflict (user_id) do nothing;
  end if;
end;
$$;

-- 로그인 전 방문 (기기별 하루 1번)
create or replace function public.track_anon_visit(p_device uuid, p_source text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_source text := nullif(left(lower(regexp_replace(coalesce(p_source, ''), '[^a-zA-Z0-9._-]', '', 'g')), 40), '');
begin
  if p_device is null then return; end if;
  -- 하루 기록 상한: 누가 기기 번호를 지어내 보내도 DB가 커지지 않게
  if (select count(*) from public.app_anon_visits where day = v_day) >= 2000 then return; end if;
  insert into public.app_anon_visits (day, device_id, source)
  values (v_day, p_device, v_source)
  on conflict (day, device_id) do nothing;
end;
$$;

-- ========== 운영자 전용 함수 ==========

create or replace function public.admin_add_marker(p_day date, p_label text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_app_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.analytics_markers (day, label)
  values (coalesce(p_day, (now() at time zone 'Asia/Seoul')::date), left(btrim(coalesce(p_label, '')), 60))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_delete_marker(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.analytics_markers where id = p_id;
end;
$$;

-- 공개 시작일: 이 날 전에 가입한 사람 = '기존 사용자(친구들)', 이후 = '새 사용자'
create or replace function public.admin_set_launch_day(p_day date)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_day is null then
    delete from public.app_state where key = 'public_launch_day';
  else
    insert into public.app_state (key, value) values ('public_launch_day', p_day::text)
    on conflict (key) do update set value = excluded.value;
  end if;
end;
$$;

-- p_cohort: 'all' | 'seed'(공개 전 가입) | 'new'(공개 후 가입)
create or replace function public.admin_dashboard(p_from date, p_to date, p_cohort text default 'all')
returns jsonb
language plpgsql security definer set search_path = public set client_min_messages = warning as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_from date;
  v_to date;
  v_len integer;
  v_prev_from date;
  v_prev_to date;
  v_week date;
  v_launch date;
  v_cohort text := coalesce(p_cohort, 'all');
  v_series_from date;
  v_out jsonb;
begin
  if not public.is_app_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  v_to := least(coalesce(p_to, v_today), v_today);
  v_from := coalesce(p_from, v_to - 29);
  if v_from > v_to then v_from := v_to; end if;
  if v_to - v_from > 730 then v_from := v_to - 730; end if;
  v_len := v_to - v_from + 1;
  v_prev_to := v_from - 1;
  v_prev_from := v_from - v_len;
  v_week := public.kst_week_start(v_to); -- 기간 마지막 날이 속한 주의 월요일

  begin
    select value::date into v_launch from public.app_state where key = 'public_launch_day';
  exception when others then
    v_launch := null;
  end;
  if v_launch is null or v_cohort not in ('seed', 'new') then v_cohort := 'all'; end if;

  -- 대상 사용자
  drop table if exists _u;
  create temp table _u on commit drop as
  select u.id as user_id, (u.created_at at time zone 'Asia/Seoul')::date as signup_day
  from auth.users u
  where v_cohort = 'all'
     or (v_cohort = 'seed' and (u.created_at at time zone 'Asia/Seoul')::date < v_launch)
     or (v_cohort = 'new' and (u.created_at at time zone 'Asia/Seoul')::date >= v_launch);
  create index on _u (user_id);

  -- 모든 활동을 (날짜, 사람, 오피스, 기능) 단위로
  drop table if exists _a;
  create temp table _a on commit drop as
  select x.day, x.user_id, x.office_id, x.feature, sum(x.n)::integer as n
  from (
    select (started_at at time zone 'Asia/Seoul')::date as day, user_id, office_id, 'clock_in'::text as feature, 1 as n from public.work_sessions
    union all
    select (created_at at time zone 'Asia/Seoul')::date, user_id, office_id, 'task_create', 1 from public.tasks where routine_id is null
    union all
    select (completed_at at time zone 'Asia/Seoul')::date, user_id, office_id, 'task_done', 1 from public.tasks where completed_at is not null
    union all
    select (started_at at time zone 'Asia/Seoul')::date, user_id, office_id, 'focus', 1 from public.focus_sessions
    union all
    select (started_at at time zone 'Asia/Seoul')::date, user_id, office_id, 'status', 1 from public.status_sessions
    union all
    select (created_at at time zone 'Asia/Seoul')::date, user_id, office_id,
           case type when 'post' then 'feed_post' else 'wave' end, 1
    from public.office_feed where type in ('post', 'wave')
    union all
    select day, user_id, office_id, kind, n from public.analytics_chat_daily
    union all
    select (r.created_at at time zone 'Asia/Seoul')::date, r.user_id, t.office_id, 'reaction', 1
    from public.task_reactions r join public.tasks t on t.id = r.task_id
    union all
    select (updated_at at time zone 'Asia/Seoul')::date, user_id, office_id, 'retro_write', 1 from public.weekly_reflections
    union all
    select (earned_at at time zone 'Asia/Seoul')::date, user_id, office_id, 'sticker', 1 from public.achievements
    union all
    select (created_at at time zone 'Asia/Seoul')::date, user_id, office_id, 'routine', 1 from public.routines
    union all
    select (joined_at at time zone 'Asia/Seoul')::date, user_id, office_id, 'office_join', 1 from public.office_members
    union all
    select (created_at at time zone 'Asia/Seoul')::date, user_id, null::uuid, 'push_on', 1 from public.push_subscriptions
    union all
    select day, user_id, null::uuid, 'visit', visits from public.app_usage_daily where visits > 0
  ) x
  where x.day <= v_to and x.user_id in (select user_id from _u)
  group by 1, 2, 3, 4;
  create index on _a (day);
  create index on _a (user_id);

  v_series_from := greatest(least(coalesce((select min(day) from _a), v_from), v_from), v_to - 730);

  with
  days as (
    select d::date as day from generate_series(v_series_from, v_to, interval '1 day') d
  ),
  act as (
    select day,
           count(distinct user_id) as dau,
           count(distinct user_id) filter (where feature <> 'visit') as doers,
           coalesce(sum(n) filter (where feature = 'clock_in'), 0) as clock_ins,
           coalesce(sum(n) filter (where feature = 'task_create'), 0) as tasks_created,
           coalesce(sum(n) filter (where feature = 'task_done'), 0) as tasks_done,
           coalesce(sum(n) filter (where feature = 'focus'), 0) as focus_sessions,
           coalesce(sum(n) filter (where feature = 'chat'), 0) as chat,
           coalesce(sum(n) filter (where feature = 'dm'), 0) as dm,
           coalesce(sum(n) filter (where feature = 'feed_post'), 0) as feed_posts,
           coalesce(sum(n) filter (where feature = 'reaction'), 0) as reactions,
           coalesce(sum(n) filter (where feature = 'retro_write'), 0) as retro_writes
    from _a group by day
  ),
  x_usage as (
    select g.day,
           count(*) filter (where g.visits > 0) as visitors,
           round(sum(g.active_sec) / 60.0)::integer as active_min,
           round(sum(g.visible_sec) / 60.0)::integer as visible_min
    from public.app_usage_daily g join _u on _u.user_id = g.user_id
    group by g.day
  ),
  anon as (
    select day, count(*) as anon_visitors from public.app_anon_visits group by day
  ),
  signups as (
    select signup_day as day, count(*) as signups from _u group by signup_day
  ),
  x_focus as (
    select (f.started_at at time zone 'Asia/Seoul')::date as day,
           round(sum(f.duration_seconds) / 60.0)::integer as focus_min
    from public.focus_sessions f join _u on _u.user_id = f.user_id
    where f.duration_seconds between 1 and 6 * 3600
    group by 1
  ),
  x_work as (
    select (w.started_at at time zone 'Asia/Seoul')::date as day,
           round(sum(least(extract(epoch from (w.ended_at - w.started_at)), 16 * 3600)) / 60.0)::integer as work_min
    from public.work_sessions w join _u on _u.user_id = w.user_id
    where w.ended_at is not null and w.ended_at > w.started_at
    group by 1
  ),
  daily as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'day', days.day,
      'dau', coalesce(act.dau, 0),
      'doers', coalesce(act.doers, 0),
      'visitors', coalesce(x_usage.visitors, 0),
      'anon_visitors', coalesce(anon.anon_visitors, 0),
      'signups', coalesce(signups.signups, 0),
      'clock_ins', coalesce(act.clock_ins, 0),
      'work_min', coalesce(x_work.work_min, 0),
      'tasks_created', coalesce(act.tasks_created, 0),
      'tasks_done', coalesce(act.tasks_done, 0),
      'focus_sessions', coalesce(act.focus_sessions, 0),
      'focus_min', coalesce(x_focus.focus_min, 0),
      'chat', coalesce(act.chat, 0),
      'dm', coalesce(act.dm, 0),
      'feed_posts', coalesce(act.feed_posts, 0),
      'reactions', coalesce(act.reactions, 0),
      'retro_writes', coalesce(act.retro_writes, 0),
      'active_min', coalesce(x_usage.active_min, 0),
      'visible_min', coalesce(x_usage.visible_min, 0)
    ) order by days.day), '[]'::jsonb) as v
    from days
    left join act on act.day = days.day
    left join x_usage on x_usage.day = days.day
    left join anon on anon.day = days.day
    left join signups on signups.day = days.day
    left join x_focus on x_focus.day = days.day
    left join x_work on x_work.day = days.day
  ),
  -- 이번 주 함께 출근한 오피스: 2명 이상이 각자 3일 이상 출근
  week_clock as (
    select public.kst_week_start(day) as week, office_id, user_id, count(distinct day) as days
    from _a where feature = 'clock_in' and office_id is not null
    group by 1, 2, 3
  ),
  together as (
    select week, office_id from week_clock where days >= 3
    group by week, office_id having count(*) >= 2
  ),
  weeks as (
    select (v_week - 7 * k) as week from generate_series(0, 11) k
  ),
  weekly as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'week', w.week,
      'wau', (select count(distinct user_id) from _a where day between w.week and w.week + 6),
      'active_offices', (select count(distinct office_id) from _a
                         where day between w.week and w.week + 6 and office_id is not null and feature <> 'office_join'),
      'together_offices', (select count(*) from together t where t.week = w.week),
      'signups', (select count(*) from _u where signup_day between w.week and w.week + 6)
    ) order by w.week), '[]'::jsonb) as v
    from weeks w
  ),
  kpi as (
    select jsonb_build_object(
      'users_total', (select count(*) from _u where signup_day <= v_to),
      'signups', (select count(*) from _u where signup_day between v_from and v_to),
      'signups_prev', (select count(*) from _u where signup_day between v_prev_from and v_prev_to),
      'active', (select count(distinct user_id) from _a where day between v_from and v_to),
      'active_prev', (select count(distinct user_id) from _a where day between v_prev_from and v_prev_to),
      'dau_avg', (select round(coalesce(sum(c), 0)::numeric / v_len, 1) from
                   (select count(distinct user_id) c from _a where day between v_from and v_to group by day) s),
      'dau_avg_prev', (select round(coalesce(sum(c), 0)::numeric / v_len, 1) from
                   (select count(distinct user_id) c from _a where day between v_prev_from and v_prev_to group by day) s),
      'wau', (select count(distinct user_id) from _a where day between v_to - 6 and v_to),
      'mau', (select count(distinct user_id) from _a where day between v_to - 29 and v_to),
      'visitors', (select count(distinct g.user_id) from public.app_usage_daily g join _u using (user_id)
                   where g.day between v_from and v_to and g.visits > 0),
      'visitors_prev', (select count(distinct g.user_id) from public.app_usage_daily g join _u using (user_id)
                   where g.day between v_prev_from and v_prev_to and g.visits > 0),
      'anon_visitors', (select count(distinct device_id) from public.app_anon_visits where day between v_from and v_to),
      'anon_visitors_prev', (select count(distinct device_id) from public.app_anon_visits where day between v_prev_from and v_prev_to),
      'active_min_per_visit_day', (select round(avg(g.active_sec) / 60.0, 1) from public.app_usage_daily g join _u using (user_id)
                   where g.day between v_from and v_to and (g.visits > 0 or g.active_sec > 0)),
      'clock_ins', (select coalesce(sum(n), 0) from _a where feature = 'clock_in' and day between v_from and v_to),
      'clock_ins_prev', (select coalesce(sum(n), 0) from _a where feature = 'clock_in' and day between v_prev_from and v_prev_to),
      'tasks_done', (select coalesce(sum(n), 0) from _a where feature = 'task_done' and day between v_from and v_to),
      'tasks_done_prev', (select coalesce(sum(n), 0) from _a where feature = 'task_done' and day between v_prev_from and v_prev_to),
      'tasks_created', (select coalesce(sum(n), 0) from _a where feature = 'task_create' and day between v_from and v_to),
      'offices_total', (select count(*) from public.offices where (created_at at time zone 'Asia/Seoul')::date <= v_to),
      'offices_active_7d', (select count(distinct office_id) from _a
                   where day between v_to - 6 and v_to and office_id is not null and feature <> 'office_join'),
      'together_week', (select count(*) from together where week = v_week),
      'together_prev_week', (select count(*) from together where week = v_week - 7),
      'push_users', (select count(distinct p.user_id) from public.push_subscriptions p join _u using (user_id))
    ) as v
  ),
  features as (
    select coalesce(jsonb_agg(jsonb_build_object('key', feature, 'users', users, 'events', events)
                              order by users desc, events desc), '[]'::jsonb) as v
    from (
      select feature, count(distinct user_id) as users, sum(n) as events
      from _a where day between v_from and v_to group by feature
    ) f
  ),
  x_pages as (
    select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', views, 'users', users, 'active_min', active_min)
                              order by views desc, active_min desc), '[]'::jsonb) as v
    from (
      select k.key as path,
             sum(coalesce((g.pages->>k.key)::int, 0)) as views,
             count(distinct g.user_id) as users,
             round(sum(coalesce((g.page_sec->>k.key)::int, 0)) / 60.0)::integer as active_min
      from public.app_usage_daily g
      join _u using (user_id)
      cross join lateral jsonb_object_keys(g.pages || g.page_sec) as k(key)
      where g.day between v_from and v_to
      group by k.key
    ) s
  ),
  hours as (
    select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'clock_ins', coalesce(c, 0)) order by h), '[]'::jsonb) as v
    from generate_series(0, 23) h
    left join (
      select extract(hour from (w.started_at at time zone 'Asia/Seoul'))::int as hr, count(*) as c
      from public.work_sessions w join _u using (user_id)
      where (w.started_at at time zone 'Asia/Seoul')::date between v_from and v_to
      group by 1
    ) s on s.hr = h
  ),
  -- 기간 안에 가입한 사람이 어디까지 갔는지 (단계는 앞 단계를 통과한 사람만 셈)
  fu as (
    select _u.user_id, _u.signup_day,
      exists (select 1 from public.profiles p where p.id = _u.user_id) as s_profile,
      exists (select 1 from public.office_members m where m.user_id = _u.user_id) as s_office,
      exists (select 1 from _a where _a.user_id = _u.user_id and _a.feature = 'clock_in') as s_clock,
      (select count(distinct day) from _a where _a.user_id = _u.user_id and _a.feature = 'clock_in'
         and day between _u.signup_day and _u.signup_day + 6) >= 2 as s_activated,
      exists (select 1 from _a where _a.user_id = _u.user_id
         and day between _u.signup_day + 7 and _u.signup_day + 13) as s_week2
    from _u where _u.signup_day between v_from and v_to
  ),
  funnel as (
    select jsonb_build_array(
      jsonb_build_object('key', 'signup', 'users', count(*)),
      jsonb_build_object('key', 'profile', 'users', count(*) filter (where s_profile)),
      jsonb_build_object('key', 'office', 'users', count(*) filter (where s_profile and s_office)),
      jsonb_build_object('key', 'clock_in', 'users', count(*) filter (where s_profile and s_office and s_clock)),
      jsonb_build_object('key', 'activated', 'users', count(*) filter (where s_profile and s_office and s_clock and s_activated)),
      jsonb_build_object('key', 'week2', 'users', count(*) filter (where s_profile and s_office and s_clock and s_activated and s_week2),
                         'eligible', count(*) filter (where signup_day <= v_today - 14))
    ) as v
    from fu
  ),
  -- 가입 주차별로 몇 주 뒤까지 남아 있는지
  cohorts as (
    select public.kst_week_start(signup_day) as week, user_id from _u
    where signup_day between v_week - 7 * 9 and v_to
  ),
  user_weeks as (
    select distinct user_id, public.kst_week_start(day) as week from _a
  ),
  cohort_sizes as (
    select week, count(*) as size from cohorts group by week
  ),
  retention as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'week', cs.week,
      'size', cs.size,
      'rates', (
        select jsonb_agg(
          case when cs.week + 7 * k > v_week then null
               else round((select count(*) from cohorts c2
                           join user_weeks uw on uw.user_id = c2.user_id and uw.week = cs.week + 7 * k
                           where c2.week = cs.week)::numeric / cs.size, 3)
          end order by k)
        from generate_series(0, 7) k)
    ) order by cs.week desc), '[]'::jsonb) as v
    from cohort_sizes cs
  ),
  x_offices as (
    select coalesce(jsonb_agg(o.j order by (o.j->>'active_7d')::int desc, o.j->>'last_active' desc nulls last), '[]'::jsonb) as v
    from (
      select jsonb_build_object(
        'id', f.id,
        'name', f.name,
        'created', (f.created_at at time zone 'Asia/Seoul')::date,
        'members', (select count(*) from public.office_members m where m.office_id = f.id),
        'active_7d', (select count(distinct user_id) from _a
                      where _a.office_id = f.id and day between v_to - 6 and v_to and feature <> 'office_join'),
        'clock_days_week', (select coalesce(sum(days), 0) from week_clock wc where wc.office_id = f.id and wc.week = v_week),
        'together', exists (select 1 from together t where t.office_id = f.id and t.week = v_week),
        'last_active', (select max(day) from _a where _a.office_id = f.id and feature <> 'office_join')
      ) as j
      from public.offices f
      where (f.created_at at time zone 'Asia/Seoul')::date <= v_to
      order by f.created_at desc
      limit 200
    ) o
  ),
  markers as (
    select coalesce(jsonb_agg(m.j order by m.j->>'day'), '[]'::jsonb) as v
    from (
      select jsonb_build_object('id', a.id, 'day', (a.created_at at time zone 'Asia/Seoul')::date,
                                'label', left(split_part(a.message, E'\n', 1), 80), 'kind', 'release') as j
      from public.announcements a
      union all
      select jsonb_build_object('id', k.id, 'day', k.day, 'label', k.label, 'kind', 'note')
      from public.analytics_markers k
    ) m
  ),
  sources as (
    select jsonb_build_object(
      'visits', (select coalesce(jsonb_agg(jsonb_build_object('source', s, 'n', c) order by c desc), '[]'::jsonb)
                 from (select coalesce(source, 'direct') s, count(*) c from public.app_anon_visits
                       where day between v_from and v_to group by 1) x),
      'signups', (select coalesce(jsonb_agg(jsonb_build_object('source', s, 'n', c) order by c desc), '[]'::jsonb)
                  from (select coalesce(q.source, 'direct') s, count(*) c
                        from _u join public.user_acquisition q using (user_id)
                        where _u.signup_day between v_from and v_to group by 1) x),
      'signups_unknown', (select count(*) from _u where signup_day between v_from and v_to
                          and not exists (select 1 from public.user_acquisition q where q.user_id = _u.user_id))
    ) as v
  ),
  platform as (
    select jsonb_build_object(
      'standalone', count(*) filter (where standalone),
      'browser', count(*) filter (where not standalone)
    ) as v
    from (
      select distinct on (g.user_id) g.user_id, g.standalone
      from public.app_usage_daily g join _u using (user_id)
      where g.day between v_from and v_to and g.standalone is not null
      order by g.user_id, g.day desc
    ) s
  )
  select jsonb_build_object(
    'generated_at', now(),
    'today', v_today,
    'from', v_from,
    'to', v_to,
    'week', v_week,
    'cohort', v_cohort,
    'launch_day', v_launch,
    'tracking_since', (select min(day) from public.app_usage_daily),
    'anon_since', (select min(day) from public.app_anon_visits),
    'chat_since', (select min(day) from public.analytics_chat_daily),
    'kpi', kpi.v,
    'daily', daily.v,
    'weekly', weekly.v,
    'features', features.v,
    'pages', x_pages.v,
    'hours', hours.v,
    'funnel', funnel.v,
    'retention', retention.v,
    'offices', x_offices.v,
    'markers', markers.v,
    'sources', sources.v,
    'platform', platform.v
  ) into v_out
  from kpi, daily, weekly, features, x_pages, hours, funnel, retention, x_offices, markers, sources, platform;

  return v_out;
end;
$$;

-- ========== 권한 ==========
-- 기록 함수만 앱에서 부를 수 있고, 테이블은 직접 읽거나 쓸 수 없다
revoke all on function public.is_app_admin() from public, anon;
revoke all on function public.track_usage(boolean, jsonb, boolean, uuid) from public, anon;
revoke all on function public.track_anon_visit(uuid, text) from public;
revoke all on function public.admin_add_marker(date, text) from public, anon;
revoke all on function public.admin_delete_marker(uuid) from public, anon;
revoke all on function public.admin_set_launch_day(date) from public, anon;
revoke all on function public.admin_dashboard(date, date, text) from public, anon;
revoke all on function public.count_chat_message() from public, anon, authenticated;
grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.track_usage(boolean, jsonb, boolean, uuid) to authenticated;
grant execute on function public.track_anon_visit(uuid, text) to anon, authenticated;
grant execute on function public.admin_add_marker(date, text) to authenticated;
grant execute on function public.admin_delete_marker(uuid) to authenticated;
grant execute on function public.admin_set_launch_day(date) to authenticated;
grant execute on function public.admin_dashboard(date, date, text) to authenticated;

-- ========== 운영자 등록 (본인 이메일로 바꿔서 한 번 실행) ==========
-- insert into public.app_admins (user_id)
-- select id from auth.users where email = '내 로그인 이메일' on conflict do nothing;
