# Supabase 가이드

- [A. 처음 연결할 때 (딱 3단계)](#a-처음-연결할-때-딱-3단계)
- [B. 주간 회고·공지 업데이트 적용하기 (PR #1)](#b-주간-회고공지-업데이트-적용하기-pr-1)

## A. 처음 연결할 때 (딱 3단계)

새 Supabase 프로젝트에 앱을 처음 붙일 때만 필요해요. 이미 쓰고 있다면 B로 가세요.

### 1단계. Supabase 프로젝트 만들기
1. https://supabase.com → 로그인 → **New Project**
2. 이름 아무거나 (예: office-link), 리전 **Northeast Asia (Seoul)**, DB 비밀번호 설정
3. 생성 완료까지 1~2분 대기

### 2단계. DB 스키마 + 보안 정책 적용
1. 왼쪽 메뉴 **SQL Editor** → **New query**
2. 이 저장소의 `supabase/migrations/001_schema_and_rls.sql` 내용 전체를 붙여넣기
3. **Run** 클릭 → "Success" 확인

이 SQL이 하는 일: 테이블 7개 생성 + RLS 보안 정책(남의 데이터 접근 차단) + 중복 세션 방지 제약 + Realtime 활성화.

그다음 `002`부터 `017`까지 **번호 순서대로** 같은 방법으로 하나씩 실행하세요. 웹푸시·크론까지 쓰려면 B의 4~7단계(함수 배포, 크론)도 해야 해요.

### 3단계. 앱에 키 연결
1. Supabase 대시보드 → **Project Settings → API**에서 두 값을 복사
   - Project URL → `VITE_SUPABASE_URL`
   - anon public 키 → `VITE_SUPABASE_ANON_KEY`
2. 넣는 위치:
   - **Atoms 배포**: Atoms 프로젝트 설정의 환경변수(Environment Variables)에 두 값을 추가하고 재배포
   - **로컬 실행**: `.env.example`을 `.env`로 복사해서 값 입력 후 `pnpm dev`

### 확인 방법
- 앱에서 회원가입 → 이메일 확인 → 프로필 만들기 → 오피스 생성이 되면 성공
- 탭 2개에서 동시에 출근을 눌러도 세션이 1개만 생기면 제약도 정상 동작

### 주의
- `service_role` 키는 절대 프론트엔드에 넣지 마세요 (anon 키만 사용)
- 이메일 인증 없이 테스트하려면: Authentication → Providers → Email → "Confirm email" 끄기


---

## B. 주간 회고·공지 업데이트 적용하기 (PR #1)

이번 업데이트는 **DB 마이그레이션 2개 + 서버 함수(push-notify) 재배포 + 크론 확인**이 필요해요.
한 번에 15~30분이면 끝나요. 위에서부터 순서대로만 따라 하세요.

### 먼저 꼭 알아둘 것 (3가지)

1. **시간 제한이 있어요.** 새 push-notify 함수를 배포하면, 다음 회고 시간(기본 월요일 오전 7시 KST)에 "📬 주간 회고가 도착했어요" 푸시가 나가요.
   이 푸시를 누르면 열리는 회고 화면은 **새 프론트(PR #1)** 에만 있어요.
   → **4단계(함수 배포)부터 8단계(머지)까지는 한 번에** 하세요. 시간이 안 되면 3단계(마이그레이션)까지만 해 두세요. 마이그레이션만으로는 아무 일도 일어나지 않아요.
2. **파일은 PR 브랜치(`claude/fervent-edison-6ia7y2`)에서 복사**하세요. main에는 아직 016·017이 없고, 함수도 옛날 버전이에요. (머지한 뒤라면 main에서 복사해도 돼요.)
3. **절대 하지 말 것**
   - service_role 키를 프론트(`VITE_...`)나 GitHub Secrets나 크론에 넣기
   - Edge Function Secrets의 `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` 수정·재발급 (기존 푸시 구독이 전부 끊겨요)
   - 테스트한다고 main에 `[공지]` 커밋 올리기 (진짜 공지 + 전 멤버 푸시가 나가요)
   - 테스트로 `midnight_clockout`(전원 퇴근 처리)이나 `nudge`(실제 푸시) 직접 호출하기
   - Database → Extensions에서 `pg_cron` 끄기 (모든 크론 작업이 영구 삭제돼요)

### SQL 실행하는 법 (이 가이드의 모든 SQL 공통)

1. [SQL Editor 열기](https://supabase.com/dashboard/project/ykyocsatvnqbuwvybirw/sql/new) — 왼쪽 메뉴 **SQL Editor** → 위쪽 **+** → **Create a new snippet**
2. 아래 SQL을 복사해서 편집기 내용을 **전부 바꿔서** 붙여넣기
3. 편집기를 한 번 클릭해서 **선택된 글자가 없게** 하기 (일부가 선택돼 있으면 버튼이 *Run selected*로 바뀌고 그 부분만 실행돼요)
4. 오른쪽 아래 **Run** (또는 Ctrl+Enter / Mac은 Cmd+Enter)
5. 결과 읽기: `Success. No rows returned` = 성공. 표가 나오면 마지막 SELECT의 결과예요. 빨간 `Error`가 나오면 아무것도 적용되지 않은 거예요(통째로 되돌려짐). 원인을 고친 뒤 **파일 전체**를 다시 실행하면 돼요.

> 실행 버튼 옆 역할(role)은 `postgres` 그대로 두세요. 시간은 UTC로 보여요(한국 시간 = +9시간).

---

### 0단계. 지금 상태 확인 (읽기만 해요)

```sql
select
  to_regprocedure('public.is_office_member(uuid)') is not null as has_is_office_member,
  to_regclass('public.app_state') is not null as has_app_state_010,
  to_regclass('public.push_subscriptions') is not null as has_push_subscriptions_004,
  exists (select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tasks' and column_name = 'due_time') as has_015_due_time,
  exists (select 1 from pg_extension where extname = 'pg_cron') as has_pg_cron,
  exists (select 1 from pg_extension where extname = 'pg_net') as has_pg_net;
```

- 앞의 3개가 `true`가 아니면 → 다른 프로젝트를 열었거나 001을 실행한 적이 없는 거예요. 멈추세요.
- `has_015_due_time`이 `false`면 → [015_task_due_time.sql](https://raw.githubusercontent.com/sominLy/office-link/main/supabase/migrations/015_task_due_time.sql)을 먼저 실행하세요.
- `has_pg_net`이 `false`면 → 5단계에서 켜요.

지금 등록된 크론 작업도 봐 두세요 (결과 창은 열어 두기):

```sql
select jobid, jobname, schedule, active,
       command ilike '%push-notify%' as calls_push_notify,
       substring(command from $r$action["']?\s*[:,]\s*["']([a-z_]+)$r$) as action
from cron.job
order by jobid;
```

`action` 열에 `nudge`, `announce_poll`, `midnight_clockout`이 각각 하나씩(`active = true`) 있으면 정상이에요.
(명령 전체(command)에는 키가 들어 있을 수 있으니 캡처해서 공유하지 마세요.)

### 1단계. 016 마이그레이션 실행 — 주간 회고·진열장

1. [016_weekly_retro.sql (raw)](https://raw.githubusercontent.com/sominLy/office-link/claude/fervent-edison-6ia7y2/supabase/migrations/016_weekly_retro.sql) 열기 → Ctrl+A → Ctrl+C
2. 새 스니펫에 붙여넣고 Run
3. **"Potential issue detected / destructive operations"** 창이 뜨면 정상이에요. 파일 안의 `drop policy if exists` 같은 "있으면 지우고 다시 만들기" 줄 때문이에요. **Run query**를 누르세요.

하는 일: 프로필에 회고 요일·시간 칸, 칭찬 한마디 표, 스티커 진열장 표, 할 일에 "처음 계획한 주" 칸과 자동 기록 트리거를 추가해요. 기존 데이터는 지우거나 바꾸지 않아요. 여러 번 실행해도 안전해요.

### 2단계. 017 마이그레이션 실행 — 업데이트 공지 고정

1. [017_announcements.sql (raw)](https://raw.githubusercontent.com/sominLy/office-link/claude/fervent-edison-6ia7y2/supabase/migrations/017_announcements.sql) 복사 → 새 스니펫 → Run (같은 경고 창이 뜨면 Run query)

하는 일: 공지 전용 표를 만들고, 지금까지 사라졌던 지난 공지 12개를 되살려요. 두 번 실행해도 중복되지 않아요.

### 3단계. 잘 됐는지 확인

```sql
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name in ('retro_day', 'retro_time', 'last_retro_pushed')) = 3 as profiles_retro_columns,
  exists (select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tasks' and column_name = 'planned_week') as tasks_planned_week_column,
  to_regclass('public.weekly_reflections') is not null as weekly_reflections_table,
  to_regclass('public.achievements') is not null as achievements_table,
  to_regclass('public.announcements') is not null as announcements_table,
  exists (select 1 from pg_trigger
     where tgrelid = 'public.tasks'::regclass and tgname = 'tasks_planned_week' and not tgisinternal) as planned_week_trigger,
  (select count(*) from public.announcements) as announcements_count;
```

전부 `true`이고 `announcements_count`가 `12`면 성공이에요. `false`가 있으면 그 파일을 **처음부터 전체** 다시 실행하세요.

> ⏸ 시간이 없으면 여기서 멈춰도 돼요. 아래 4~8단계는 머지까지 한 번에 할 수 있을 때 하세요.

### 4단계. push-notify 함수 다시 배포

**방법 A — 대시보드에서 (설치 없이, 추천)**

1. [index.ts (raw, 새 버전)](https://raw.githubusercontent.com/sominLy/office-link/claude/fervent-edison-6ia7y2/supabase/functions/push-notify/index.ts) 열기 → Ctrl+A → Ctrl+C
   - 새 버전이 맞는지 확인: 안에 `publishAnnouncement`라는 글자가 있어야 해요.
2. 대시보드 → **Edge Functions** → **push-notify** → **Code** 탭 → `index.ts` 안을 클릭 → Ctrl+A → Ctrl+V (전부 바꾸기)
3. **Deploy updates** → 확인 창에서 다시 **Deploy updates** → "Successfully updated edge function"이 뜨면 끝

Code 탭에 "Failed to load function code"가 뜨면 방법 B를 쓰세요.

**방법 B — 터미널(CLI)에서**

```bash
git fetch origin && git switch claude/fervent-edison-6ia7y2 && git pull
npx supabase@latest login
npx supabase@latest functions deploy push-notify --project-ref ykyocsatvnqbuwvybirw --no-verify-jwt --use-api
```

- `npm install supabase`는 하지 마세요(package.json과 lock 파일이 바뀌어요). `npx`로 충분해요.
- `--no-verify-jwt`를 빼면 아래 5단계 설정이 다시 켜져 버려요.

### 5단계. 함수 설정 확인 + pg_net

1. **Edge Functions → push-notify → Settings → Function configuration**에서 **Verify JWT** 스위치가 **OFF**인지 확인하세요. 켜져 있으면 끄고 **Save changes**.
   - 왜 꺼도 되나요? 켜져 있어도 앱에 공개된 anon 키만 있으면 통과라서 보안 차이가 거의 없어요. 대신 꺼야 크론과 GitHub 공지 자동화가 키 없이 호출할 수 있어요.
2. 0단계에서 `has_pg_net`이 `false`였다면 이것도 실행하세요:

```sql
create extension if not exists pg_net with schema extensions;
```

### 6단계. 공지 자동화 시험 호출 (안전해요)

새 함수가 올라간 **뒤에만** 실행하세요. 이 호출은 "새 [공지] 커밋이 있나?"만 확인하고, 이미 올린 공지는 중복이라 다시 보내지 않아요.

```sql
select net.http_post(
  url := 'https://ykyocsatvnqbuwvybirw.supabase.co/functions/v1/push-notify',
  headers := jsonb_build_object('Content-Type', 'application/json'),
  body := jsonb_build_object('action', 'announce_poll'),
  timeout_milliseconds := 30000
) as request_id;
```

10~30초 뒤 결과 확인:

```sql
select id, status_code, left(content, 80) as body, timed_out, error_msg, created
from net._http_response
order by created desc
limit 5;
```

| 결과 | 뜻 |
|---|---|
| `200` + `processed 0` / `initialized` / `processed N` | 정상 |
| `401` | 5단계의 Verify JWT가 아직 켜져 있어요 |
| `500` / `503` | Edge Functions → push-notify → **Logs** 탭에서 오류를 확인하세요 (대개 VAPID 시크릿 누락) |
| `github unavailable` | GitHub 요청 한도예요. 배포 문제는 아니고, 나중에 다시 돼요 |

### 7단계. 크론 작업 확인 (없을 때만 만들기)

0단계 결과에 세 작업(`nudge`, `announce_poll`, `midnight_clockout`)이 모두 `active = true`로 있으면 **이 단계는 건너뛰세요.**
없는 것만 아래에서 골라 실행하세요. 같은 작업이 이미 있으면 아무것도 만들지 않게 되어 있어서, 잘못 실행해도 중복되지 않아요.

<details>
<summary>nudge (10분마다: 미출근 알림 + 주간 회고 도착 푸시)</summary>

```sql
select cron.schedule(
  'push-notify-nudge',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://ykyocsatvnqbuwvybirw.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('action', 'nudge'),
    timeout_milliseconds := 30000
  );
  $$
)
where not exists (
  select 1 from cron.job
  where command ilike '%push-notify%'
    and substring(command from $r$action["']?\s*[:,]\s*["']([a-z_]+)$r$) = 'nudge'
);
```
</details>

<details>
<summary>announce_poll (10분마다: [공지] 커밋을 소식 탭에 게시)</summary>

```sql
select cron.schedule(
  'push-notify-announce-poll',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://ykyocsatvnqbuwvybirw.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('action', 'announce_poll'),
    timeout_milliseconds := 30000
  );
  $$
)
where not exists (
  select 1 from cron.job
  where command ilike '%push-notify%'
    and substring(command from $r$action["']?\s*[:,]\s*["']([a-z_]+)$r$) = 'announce_poll'
);
```
</details>

<details>
<summary>midnight_clockout (매일 자정 KST 자동 퇴근 = 15:00 UTC)</summary>

```sql
select cron.schedule(
  'push-notify-midnight-clockout',
  '0 15 * * *',
  $$
  select net.http_post(
    url := 'https://ykyocsatvnqbuwvybirw.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('action', 'midnight_clockout'),
    timeout_milliseconds := 30000
  );
  $$
)
where not exists (
  select 1 from cron.job
  where command ilike '%push-notify%'
    and substring(command from $r$action["']?\s*[:,]\s*["']([a-z_]+)$r$) = 'midnight_clockout'
);
```
</details>

- 결과에 숫자(작업 번호)가 나오면 새로 만든 거고, `Success. No rows returned`면 이미 있어서 건너뛴 거예요.
- 작업이 있는데 `active = false`라면 새로 만들지 말고 켜기만 하세요: 대시보드 **Integrations → Cron → Jobs**에서 Active 스위치, 또는 `select cron.alter_job(job_id := <jobid>, active := true);`

### 8단계. PR 머지 (다음 회고 시간 전에)

1. [PR #1](https://github.com/sominLy/office-link/pull/1) → **Merge pull request** (기본값 *Create a merge commit*) → Confirm
   - *Squash and merge*를 쓸 거면 커밋 메시지에 `[공지] 📬 ...` 줄이 남아 있는지 확인하세요. 그 줄이 있어야 자동 공지가 나가요.
2. 프론트 호스팅(Vercel 등)이 새 main을 배포했는지 사이트에서 확인하세요 (더보기 → 주간 회고·상장 메뉴가 보이면 성공).

### 9단계. 머지 10~20분 뒤 확인

```sql
select left(sha, 7) as sha, left(message, 40) as message, created_at
from public.announcements
order by created_at desc
limit 5;
```

맨 위에 `9971534 📬 주간 회고와 상장이 생겼어요…`가 보이면 자동 공지까지 성공이에요. 앱 소식 탭 맨 위 "업데이트 소식" 카드에도 떠요.

- GitHub Actions의 "Announce update to office feeds"가 `No announcement marker - skipping`으로 끝나도 정상이에요. 머지 커밋에는 `[공지]`가 없어서 그래요. 실제 게시는 크론이 해요.
- 크론이 잘 도는지 보려면 6단계의 `net._http_response` 조회를 다시 실행하세요. `200` + `ok`(nudge) / `processed …`(announce_poll)면 정상이에요. 크론 기록(`cron.job_run_details`)의 `succeeded`는 "요청을 보냈다"는 뜻일 뿐이라, 진짜 결과는 이쪽에서 봐야 해요.

<details>
<summary>📬 공지가 소식 카드에 안 보일 때 (옛 함수가 먼저 올린 경우만)</summary>

```sql
insert into public.announcements (sha, message, created_at) values ('997153427e334e95adf6ea5cb8e2271e22526e68', $q$📬 주간 회고와 상장이 생겼어요! 매주 월요일 오전 7시(원하는 요일·시간으로 바꿀 수 있어요)에 지난 한 주 출근·집중·해낸 할 일을 정리해 드리고, 매주 다른 디자인의 상장이 도착해요. 회고를 열면 칭찬 스티커가 🏆 진열장에 쌓이고, 쌓인 만큼 트로피가 열려요. 할 일도 한 줄 빠른 추가·되돌리기·마감 지난 할 일 정리로 훨씬 편해졌어요!$q$, '2026-10-03T14:36:30+09:00') on conflict (sha) do nothing;
```
푸시는 다시 나가지 않고 카드에만 추가돼요.
</details>

### (선택) GitHub에서 바로 공지하기 — ANNOUNCE_SECRET

**안 해도 돼요.** 크론(`announce_poll`)이 10분 안에 [공지] 커밋을 올려 줘요. 머지 커밋 방식으로 머지하면 GitHub Action은 어차피 이 값을 쓰지 않아요.
쓰고 싶다면 5단계(Verify JWT OFF)를 마친 뒤에:

1. 값 만들기 (SQL Editor): `select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') as secret;` → 비밀번호 관리자에 저장
2. **Supabase 먼저**: Edge Functions → **Secrets** → Add new secret → 이름 `ANNOUNCE_SECRET`, 값 붙여넣기 → Save (재배포 필요 없음)
3. **그다음 GitHub**: 저장소 → Settings → Secrets and variables → Actions → **New repository secret** → 이름 `ANNOUNCE_SECRET`, **같은 값**
4. 시험은 main에 [공지] 커밋을 올리지 말고, 대시보드의 함수 **Test**에서 body `{"action":"announce","secret":"<값>","message":""}`로 해 보세요. `400 empty`면 값이 맞는 거예요(아무것도 게시되지 않음). `401`이면 두 값이 달라요.

### 배포 후 첫 회고 시간(기본 월요일 오전 7시) 10분 뒤 — 회고 푸시 확인

```sql
select count(*) as profiles,
       count(*) filter (where last_retro_pushed is not null) as retro_marked,
       max(last_retro_pushed) as latest_retro_week
from public.profiles;
```

`latest_retro_week`가 **지난주 월요일 날짜**면 회고 푸시가 나간 거예요. 그 주에 한 번이라도 출근한 사람에게만 가요.
배포 직후에는 "이미 도착 시각이 12시간 넘게 지난 회고는 보내지 않고 표시만" 해요. 그래서 엉뚱한 새벽 푸시는 가지 않아요.

### 문제가 생기면

| 증상 | 확인할 곳 |
|---|---|
| 푸시가 아예 안 와요 | Edge Functions → push-notify → **Logs**, 그리고 6단계의 `net._http_response` |
| 회고 시간 설정이 "이 기기에만 저장"으로 떠요 | 016을 아직 안 돌린 거예요. 016을 실행하면 다음에 앱을 열 때 자동으로 서버에 올라가요 |
| 소식 탭 위 "업데이트 소식" 카드가 안 보여요 | 017을 안 돌렸거나, 앱이 아직 옛 버전이에요 |
| 크론이 `timed_out = true` | Integrations → Cron → Jobs → 해당 작업 ⋮ → Edit → Timeout을 최대(5000)로. 그래도 안 되면 그 작업을 `select cron.unschedule('<이름>');`로 지우고 7단계 SQL(30초)로 다시 만들기 |
