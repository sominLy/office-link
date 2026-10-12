-- 오피스링크 분석 쿼리 모음. Supabase 대시보드 → SQL Editor에 필요한 블록만 붙여 쓴다.
--
-- ⚠️ 먼저 한 번만 실행할 것: 2026-10-06 검증 때 넣은 테스트 행을 지운다.
--   delete from public.events where source in ('rls_check', 'e2e_check');
--
-- events 테이블은 SELECT 정책이 없으므로 대시보드(service role)에서만 조회된다.
-- 기준 지표 정의는 .omc/specs/deep-interview-office-link-public-launch.md

-- ============================================================
-- 1. North Star: 주당 3일 이상 출근한 멤버 수 (주별)
--    출근은 work_sessions가 원천이다(events의 clock_in은 유입 채널 연결용).
-- ============================================================
with daily as (
  select user_id,
         date_trunc('week', (started_at at time zone 'Asia/Seoul'))::date as week,
         count(distinct (started_at at time zone 'Asia/Seoul')::date) as days
  from work_sessions
  group by 1, 2
)
select week,
       count(*) filter (where days >= 3) as nsm_habit_members,
       count(*)                          as active_members,
       round(avg(days), 2)               as avg_days_per_member
from daily
group by week
order by week desc;

-- ============================================================
-- 2. 주당 출근율 — 기능 출시 전후 paired 비교
--    아래 feature_date의 날짜만 출시일로 바꿔서 실행한다.
--    전후 28일씩을 보고, 양쪽에 모두 출근 기록이 있는 멤버만 센다.
-- ============================================================
with feature_date as (
  select '2026-11-01 00:00+09'::timestamptz as t   -- ← 출시일로 바꿀 곳
),
d as (
  select w.user_id,
         (w.started_at at time zone 'Asia/Seoul')::date as day,
         case when w.started_at < f.t then 'before' else 'after' end as phase
  from work_sessions w
  cross join feature_date f
  where w.started_at >= f.t - interval '28 days'
    and w.started_at <  f.t + interval '28 days'
),
per_user as (
  select user_id, phase, count(distinct day) / 4.0 as days_per_week
  from d group by 1, 2
),
paired as (
  select b.user_id,
         b.days_per_week as before_dpw,
         a.days_per_week as after_dpw,
         a.days_per_week - b.days_per_week as delta
  from per_user b
  join per_user a on a.user_id = b.user_id and a.phase = 'after'
  where b.phase = 'before'
)
select count(*)                       as n_paired,      -- 25~35면 판정 가능
       round(avg(before_dpw), 2)      as before_avg,
       round(avg(after_dpw), 2)       as after_avg,
       round(avg(delta), 2)           as mean_delta,
       round(stddev_samp(delta), 3)   as sd_delta,
       -- Cohen's d (paired). 0.5 이상이면 중간 크기 변화
       round(avg(delta) / nullif(stddev_samp(delta), 0), 3) as cohens_d
from paired;

-- ============================================================
-- 3. 유입 퍼널 (채널별)
-- ============================================================
select source,
       count(distinct visitor_id) filter (where name = 'landing_view')    as landed,
       count(distinct visitor_id) filter (where name = 'signup_start')    as signup_started,
       count(distinct visitor_id) filter (where name = 'signup_complete') as signed_up,
       count(distinct user_id)    filter (where name = 'office_joined')   as joined_office,
       count(distinct user_id)    filter (where name = 'clock_in')        as clocked_in
from events
group by source
order by landed desc nulls last;

-- ============================================================
-- 4. 가드레일: 동료가 1명 이상 있는 멤버 비율
--    낮으면 콜드 스타트 상태이므로 다른 숫자를 해석하지 않는다.
-- ============================================================
with office_size as (
  select office_id, count(*) as members
  from office_members group by 1
)
select round(100.0 * sum(case when os.members > 1 then 1 else 0 end) / count(*), 1) as pct_with_colleague,
       count(*) as total_memberships
from office_members om
join office_size os on os.office_id = om.office_id;

-- ============================================================
-- 5. 온보딩 완주율 — 가입에서 첫 출근까지
-- ============================================================
with signup as (
  select user_id, min(created_at) as signed_at
  from events where name = 'signup_complete' and user_id is not null group by 1
),
first_in as (
  select user_id, min(started_at) as first_clock_in
  from work_sessions group by 1
)
select count(*)                                           as signed_up,
       count(f.user_id)                                   as reached_first_clock_in,
       round(100.0 * count(f.user_id) / nullif(count(*), 0), 1) as pct,
       round(avg(extract(epoch from (f.first_clock_in - s.signed_at)) / 60)::numeric, 1) as avg_minutes_to_first
from signup s
left join first_in f on f.user_id = s.user_id;

-- ============================================================
-- 6. 기능별 채택률 (가입자 중 한 번이라도 쓴 비율)
-- ============================================================
--    reaction_sent는 props->>'to_self'가 'false'인 것만 상호작용으로 센다
--    (내 할 일에 스스로 붙인 반응은 "봐주는 사람이 있다"의 증거가 아니다).
with users as (select distinct user_id from events where user_id is not null)
select case when e.name = 'reaction_sent' and e.props->>'to_self' = 'true'
            then 'reaction_sent (self)' else e.name end                           as feature,
       count(distinct e.user_id)                                                  as users_used,
       round(100.0 * count(distinct e.user_id) / nullif((select count(*) from users), 0), 1) as pct_of_users,
       count(*)                                                                   as total_events
from events e
where e.name in ('clock_in', 'task_created', 'focus_started', 'reaction_sent')
group by feature
order by users_used desc;

-- ============================================================
-- 7. 방문당 체류 시간 — 같은 visitor_id의 이벤트를 30분 공백으로 끊어 방문 단위로 묶는다
--    주의: work_sessions의 출근 시간과 다른 값이다. 출근은 앱을 닫아도 열려 있다.
-- ============================================================
with marked as (
  select visitor_id, created_at,
         case when created_at - lag(created_at) over (partition by visitor_id order by created_at)
                   > interval '30 minutes'
                or lag(created_at) over (partition by visitor_id order by created_at) is null
              then 1 else 0 end as new_visit
  from events
),
numbered as (
  select visitor_id, created_at,
         sum(new_visit) over (partition by visitor_id order by created_at) as visit_no
  from marked
),
visits as (
  select visitor_id, visit_no,
         extract(epoch from (max(created_at) - min(created_at))) / 60 as minutes,
         count(*) as events_in_visit
  from numbered group by 1, 2
)
select count(*)                                as visits,
       round(avg(minutes)::numeric, 1)         as avg_minutes,
       round((percentile_cont(0.5) within group (order by minutes))::numeric, 1) as median_minutes,
       round(avg(events_in_visit), 1)          as avg_events
from visits
where events_in_visit > 1;  -- 이벤트 1개짜리 방문은 체류 0분으로만 나와 평균을 왜곡한다

-- ============================================================
-- 8. 리텐션 — 가입 주차 코호트별 D1/D7 재방문
-- ============================================================
with signup as (
  select user_id, min(created_at) as signed_at
  from events where name = 'signup_complete' and user_id is not null group by 1
)
select date_trunc('week', (s.signed_at at time zone 'Asia/Seoul'))::date as cohort_week,
       count(*) as users,
       count(*) filter (where exists (
         select 1 from events e where e.user_id = s.user_id
           and e.created_at between s.signed_at + interval '1 day' and s.signed_at + interval '2 days'
       )) as d1_returned,
       count(*) filter (where exists (
         select 1 from events e where e.user_id = s.user_id
           and e.created_at between s.signed_at + interval '7 days' and s.signed_at + interval '8 days'
       )) as d7_returned
from signup s
group by cohort_week
order by cohort_week desc;
