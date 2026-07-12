# 연결오피스 (office-link) 코드 감사 리포트

> 기준: 04_CLAUDE_CODE_REVIEW_PROMPT.md 감사 항목 / 대상: Atoms 내보내기 소스 (app/frontend)
> 검토일: 2026-07-11 / 코드 수정 없음 (감사 전용)

## 1. 요약 (Executive Summary)

UI와 기능 구조는 MVP 범위에 충실하게 잘 짜여 있습니다. 타이머를 `started_at` 기반으로 계산하는 설계 결정도 올바릅니다. 그러나 **배포본이 Supabase에 연결되지 않았고**, **DB 스키마·RLS 정책이 저장소에 없어 보안을 검증할 수 없으며**, **중복 세션을 막는 장치가 클라이언트 상태에만 의존**하고 있어 베타 전 반드시 손봐야 합니다.

## 2. BLOCKER

### B1. Supabase 미연결 (배포본 동작 불가)
- 증거: `src/lib/supabase.ts` — `VITE_SUPABASE_URL` 미설정 시 `placeholder.supabase.co` 사용. 배포된 번들에도 placeholder가 들어있음을 확인.
- 재현: https://10xm41s.atoms.world 접속 → 로그인/데이터 동작 안 함.
- 수정: Atoms 플랫폼 설정에서 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 설정 후 재배포.

### B2. DB 스키마 & RLS 정책이 저장소에 없음 (보안 검증 불가)
- 증거: 저장소에 마이그레이션/SQL 파일이 전혀 없음. ARCHITECTURE.md에 "RLS 정책 설정" 계획만 있음.
- 위험: RLS가 없거나 느슨하면 **로그인한 아무 사용자나 모든 오피스·모든 사용자의 세션/할일을 읽고 쓸 수 있음**. anon key는 번들에 공개되므로 RLS가 유일한 방어선.
- 특히 확인 필요:
  - `offices`: `joinOffice`가 invite_code로 SELECT — 전체 목록 SELECT가 열려 있으면 초대 코드 유출.
  - `work_sessions`/`status_sessions`/`focus_sessions`/`tasks`: INSERT/UPDATE는 `user_id = auth.uid()`로 제한, SELECT는 같은 오피스 멤버로 제한되어야 함.
  - `office_members`: 아무나 INSERT 가능하면 초대 코드 없이 가입 가능.
- 수정: Supabase 대시보드의 스키마를 `supabase/migrations/`로 내보내 저장소에 커밋하고, 위 정책을 SQL로 검증.

### B3. 중복 열린 세션 방지가 클라이언트 상태에만 의존
- 증거: `OfficeContext.clockIn`은 `myWorkSession` state로만 가드. `FocusTimer.startFocus`는 `starting` 플래그뿐, DB의 열린 세션을 확인하지 않음. `changeStatus`는 state의 `myStatusSession`만 닫음.
- 재현: 탭 2개에서 각각 출근 → 열린 work_session 2개 생성. 상태 변경을 두 탭에서 하면 닫히지 않은 status_session 누적 → 멤버 카드 상태 불일치.
- 수정: DB에 partial unique index 추가가 근본 해결.
  ```sql
  create unique index one_open_work  on work_sessions(user_id, office_id)  where ended_at is null;
  create unique index one_open_focus on focus_sessions(user_id, office_id) where ended_at is null;
  ```
  status_sessions는 insert 전에 "열린 세션 전부 close"를 서버측(RPC 함수)으로 처리 권장.

## 3. HIGH

### H1. 퇴근 시 열린 집중 세션이 닫히지 않음
- `clockOut`은 work_session만 종료. 집중 중 퇴근하면 focus_session이 영원히 열린 채 남고(`duration_seconds` null), 다음 출근 때 타이머가 수십 시간으로 복원됨.
- 수정: `clockOut`에서 열린 focus_session도 `ended_at` 처리.

### H2. week_start 날짜가 한국시간에서 하루 밀림
- `MyTasks.getWeekStart()`: 로컬 자정(월요일 00:00 KST)으로 맞춘 뒤 `toISOString()` → UTC 변환되며 **일요일 날짜가 저장됨**. 또한 `now.setDate()`가 원본 Date를 변경(mutation)해 월말 경계에서 오동작 가능.
- Tasks.tsx 등 다른 곳에서 week_start를 다르게 계산하면 같은 주의 할 일이 서로 안 보이는 버그로 이어짐.
- 수정: 시간대 안전한 계산으로 통일 (예: `Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul'})`로 KST 날짜를 뽑아 월요일 계산) 후 공용 util로 추출.

### H3. 집중 시간(duration)을 클라이언트 시계로 계산
- `stopFocus`: `Date.now() - started_at`을 클라이언트에서 계산해 저장. 기기 시계가 틀리면 기록 오염, 브라우저를 닫으면 세션이 영영 안 닫힘(리포트에서 조용히 누락).
- 수정: 종료 시 `ended_at`만 기록하고 duration은 DB에서 `ended_at - started_at`으로 계산(generated column 또는 조회 시 계산). 앱 시작 시 "비정상적으로 오래 열린 세션" 자동 정리 로직 추가.

### H4. 초대 코드 충돌·중복 미검증
- `createOffice`: `Math.random()` 6자리, 유니크 확인 없음 → 충돌 시 `joinOffice`가 `.single()`로 실패하거나 엉뚱한 오피스에 가입. 또한 오피스 insert 성공 후 멤버 insert 실패 시 고아 오피스 생성.
- 수정: `invite_code`에 unique 제약 + 충돌 시 재생성, 오피스+멤버 생성을 RPC 함수(트랜잭션)로 묶기.

### H5. 쓰기 작업 에러 무시
- `clockIn`/`clockOut`/`changeStatus`/`toggleComplete` 등이 supabase 응답의 `error`를 확인하지 않음 → RLS 거부나 네트워크 실패 시 사용자는 성공한 줄 알지만 DB엔 반영 안 됨.
- 수정: error 체크 후 toast로 안내 + 상태 재조회.

## 4. MEDIUM

- **M1. ClockOut 렌더 중 navigate**: `if (!myWorkSession) { navigate('/'); return null; }` — 렌더 중 side effect. 로딩 중 일시적으로 null이면 퇴근 페이지 진입 자체가 안 됨. `useEffect`로 이동 + 로딩 상태 구분.
- **M2. fetchMembers N+1 쿼리**: 멤버당 status/work 2쿼리씩. 6명이면 12쿼리+realtime 이벤트마다 재실행. 뷰(view) 하나로 합치거나 `in()` 배치 조회 권장.
- **M3. "오늘" 경계가 기기 시간대 의존**: `today.setHours(0,0,0,0)` — 해외 접속 시 기록 날짜가 달라짐. KST 고정 권장.
- **M4. clockIn에서 changeStatus 호출 순서**: 열린 상태 세션 조회 전에 insert → 이전 미종료 상태와 겹칠 수 있음 (B3와 동일 근본 원인).
- **M5. 오피스 1개 가정**: `fetchOffice`가 `.limit(1).single()` — 멤버십이 2개면 임의의 첫 번째만 사용. 의도라면 `office_members`에 user_id unique 제약으로 강제.

## 5. LOW

- config.ts의 API_BASE_URL 로직은 Supabase 직접 호출 구조에서 사실상 미사용 (죽은 코드) — 정리 가능.
- console.log 디버그 출력 다수 (config.ts).
- lib/api.ts는 빈 파일.
- 테스트 부재 (Playwright 의존성은 있으나 테스트 없음).

## 6. 보안 요약
- ✅ 번들에 service-role 키 노출 없음 (anon key만, 정상).
- ⚠️ 보안의 전부가 RLS에 달려 있는데 RLS를 코드로 검증할 수 없음 (B2).
- ⚠️ 초대 코드 6자리 영숫자 — 브루트포스 가능성 낮지 않음. rate limit 또는 코드 길이 증가 고려.

## 7. 권장 수정 순서
1. B1 — Supabase 연결 (이것 없이는 아무것도 동작 안 함)
2. B2 — 스키마/RLS를 저장소로 가져와 검증·수정
3. B3 — 중복 세션 DB 제약 (unique partial index)
4. H1 — 퇴근 시 집중 세션 종료
5. H2 — week_start KST 버그 수정
6. H3~H5, M1~M5 순차 처리

## 8. 변경이 예상되는 파일
- `src/contexts/OfficeContext.tsx` (B3, H1, H4, H5, M4, M5)
- `src/components/FocusTimer.tsx` (B3, H3, H5)
- `src/components/MyTasks.tsx` + `src/pages/Tasks.tsx` (H2 — 공용 util 추출)
- `src/pages/ClockOut.tsx` (M1, M3)
- 신규: `supabase/migrations/*.sql` (B2, B3, H4)

## 참고: GitHub 저장소 상태
현재 https://github.com/sominLy/office-link 에는 설정 파일 14개만 올라가 있고 `src/`가 없습니다. 로컬의 `오피스만들기.zip` 내용(`app/frontend/` 전체)을 저장소에 올려야 이 감사 결과를 적용할 수 있습니다.
