# Supabase 연결 가이드 (딱 3단계)

현재 앱은 Supabase 미연결 상태(placeholder)라 로그인·저장이 동작하지 않습니다. 아래 순서대로 하면 됩니다.

## 1단계. Supabase 프로젝트 만들기
1. https://supabase.com → 로그인 → **New Project**
2. 이름 아무거나 (예: office-link), 리전 **Northeast Asia (Seoul)**, DB 비밀번호 설정
3. 생성 완료까지 1~2분 대기

## 2단계. DB 스키마 + 보안 정책 적용
1. 왼쪽 메뉴 **SQL Editor** → **New query**
2. 이 저장소의 `supabase/migrations/001_schema_and_rls.sql` 내용 전체를 붙여넣기
3. **Run** 클릭 → "Success" 확인

이 SQL이 하는 일: 테이블 7개 생성 + RLS 보안 정책(남의 데이터 접근 차단) + 중복 세션 방지 제약 + Realtime 활성화.

## 3단계. 앱에 키 연결
1. Supabase 대시보드 → **Project Settings → API**에서 두 값을 복사
   - Project URL → `VITE_SUPABASE_URL`
   - anon public 키 → `VITE_SUPABASE_ANON_KEY`
2. 넣는 위치:
   - **Atoms 배포**: Atoms 프로젝트 설정의 환경변수(Environment Variables)에 두 값을 추가하고 재배포
   - **로컬 실행**: `.env.example`을 `.env`로 복사해서 값 입력 후 `pnpm dev`

## 확인 방법
- 앱에서 회원가입 → 이메일 확인 → 프로필 만들기 → 오피스 생성이 되면 성공
- 탭 2개에서 동시에 출근을 눌러도 세션이 1개만 생기면 제약도 정상 동작

## 주의
- `service_role` 키는 절대 프론트엔드에 넣지 마세요 (anon 키만 사용)
- 이메일 인증 없이 테스트하려면: Authentication → Providers → Email → "Confirm email" 끄기
