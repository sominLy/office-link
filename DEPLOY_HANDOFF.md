# 배포 인수인계 — 스터디룸 + 의견·문의 (PR #4)

클라우드 세션에서는 Supabase에 닿을 수 없어서(네트워크 정책·토큰 없음) 여기서 마무리해요.
아래 프롬프트를 VS Code의 Claude Code에 그대로 붙여 넣으면 돼요. 직접 하려면 그 아래 순서대로.

- 브랜치: `claude/vibrant-turing-q29e2m` · PR: https://github.com/sominLy/office-link/pull/4
- Supabase 프로젝트: `ykyocsatvnqbuwvybirw`
- 들어 있는 것: 스터디룸(024), 의견·문의(025), 공개 운영 보안 보강(026), 자동 답변·업데이트 완료, 모달 스크롤, GitHub Actions 배포 워크플로
- 아직 운영 DB에 적용 안 된 것: `024_study_rooms.sql`, `025_feedback.sql`, `026_hardening.sql`, `push-notify` 함수 재배포

## Claude Code에 붙여 넣을 프롬프트

```text
sominLy/office-link 저장소의 브랜치 claude/vibrant-turing-q29e2m (PR #4)에 스터디룸과 의견·문의 기능이 올라가 있어.
이 컴퓨터에서 Supabase 배포까지 마쳐 줘. DEPLOY_HANDOFF.md에 순서가 있어. 각 단계가 끝날 때마다 결과를 보여 줘.

1. git fetch origin && git checkout claude/vibrant-turing-q29e2m && git pull
2. npm ci → npm run lint → npx tsc -p tsconfig.app.json --noEmit → npx vitest run → npm run build. 하나라도 실패하면 멈추고 알려 줘.
3. Supabase 마이그레이션 적용. 토큰은 환경 변수 SUPABASE_ACCESS_TOKEN으로만 다루고 채팅에 절대 출력하지 마.
   PROJECT_REF=ykyocsatvnqbuwvybirw python3 supabase/scripts/mgmt_sql.py apply supabase/migrations/024_study_rooms.sql
   PROJECT_REF=ykyocsatvnqbuwvybirw python3 supabase/scripts/mgmt_sql.py apply supabase/migrations/025_feedback.sql
   PROJECT_REF=ykyocsatvnqbuwvybirw python3 supabase/scripts/mgmt_sql.py apply supabase/migrations/026_hardening.sql
   PROJECT_REF=ykyocsatvnqbuwvybirw python3 supabase/scripts/mgmt_sql.py check supabase/queries/launch_check.sql
   → 표의 모든 줄이 ✅여야 해. 특히 '스터디룸 …' 3줄, '의견·문의 …' 3줄, '프로필 열 범위'부터 '글귀 제보자 숨김'까지 026의 열한 줄. ❌가 있으면 그 줄의 '고칠 일'대로 하고 다시 check.
   (토큰이 없으면 supabase.com → Account → Access Tokens에서 만들라고 안내하고, 대안으로 Supabase 대시보드 SQL Editor에 024 → 025 순서로 붙여 넣어 Run 하는 방법을 알려 줘.)
4. 함수 재배포: supabase functions deploy push-notify --project-ref ykyocsatvnqbuwvybirw --no-verify-jwt --use-api
   (Docker가 있으면 --use-api 없이도 돼. 배포 뒤 Verify JWT가 꺼져 있어야 해 — 크론이 토큰 없이 부르니까.)
5. 앱에서 확인: 홈에 "같이 공부하기" 섹션이 보이는지, ✨ 더보기 → 의견·문의 보내기가 되는지, 내 계정 → 운영 대시보드 → 문의 탭에 그 글이 보이는지.
6. PR #4를 "머지 커밋 만들기(Create a merge commit)"로 머지하고, 머지 커밋 메시지 본문에 아래 [공지] 줄을 그대로 넣어 줘. main에 올라가면 announce.yml(또는 크론 announce_poll)이 이 줄을 소식 탭 업데이트 공지로 올리고 전원에게 푸시해.
   [공지] 📚 같이 공부하는 스터디룸과 📮 의견·문의 창구가 생겼어요! ① 홈의 '같이 공부하기'에서 줌·구글밋 링크를 붙여 스터디룸을 열면 멤버들에게 알림이 가고, 누가 들어와 있는지 실시간으로 보여요. 참여하면 상태가 '스터디/회의 중'으로 바뀌어요 ② 홈 ✨ 더보기 → '의견·문의 보내기'로 불편한 점·바라는 기능·버그를 운영자에게 바로 보낼 수 있어요. 답변은 내 계정에서 볼 수 있고, 바라신 내용이 업데이트되면 알려드려요 ③ 화면이 안 바뀌면 더보기 → 앱 새로고침을 한 번 눌러주세요
7. Vercel 배포가 끝나면 앱을 새로고침해서 소식 탭에 공지가 올라왔는지 확인해 줘.
```

## 직접 할 때의 순서

1. **브랜치 받기** — `git fetch origin && git checkout claude/vibrant-turing-q29e2m && git pull`
2. **확인** — `npm ci && npm run lint && npx tsc -p tsconfig.app.json --noEmit && npx vitest run && npm run build`
3. **마이그레이션** — 둘 중 하나
   - 대시보드: SQL Editor에 `supabase/migrations/024_study_rooms.sql` 붙여 넣고 Run → `025_feedback.sql` Run → `026_hardening.sql` Run → `supabase/queries/launch_check.sql` Run (모든 줄 ✅)
   - 터미널: 위 프롬프트의 3번 명령 (토큰: supabase.com → Account → Access Tokens)
4. **함수** — `supabase functions deploy push-notify --project-ref ykyocsatvnqbuwvybirw --no-verify-jwt --use-api`
5. **앱 확인** — 홈 '같이 공부하기', ✨ 더보기 → 의견·문의 보내기, 운영 대시보드 → 문의 탭
6. **머지 + 공지** — PR #4를 머지 커밋으로 머지, 커밋 본문에 위 `[공지]` 줄
7. **Vercel** — main에 올라가면 자동 배포. 더보기 → 앱 새로고침

## 알아둘 것

- 마이그레이션은 여러 번 실행해도 안전해요. 순서는 024 → 025 → 026.
- 026은 보안 보강이에요(SUPABASE_SETUP.md I절). 적용하면 공개 오피스에서 프로필 사진·본명이 낯선 사람에게 보이지 않게 돼요. 크론 비밀값(CRON_SECRET)은 선택이고, 설정 순서를 지켜야 해요.
- 024·025를 적용하기 전에는 홈에 스터디룸 섹션이 보이지 않고, 의견 보내기는 "아직 켜지지 않았어요"로 안내해요. 그래서 공지(머지)는 마이그레이션 뒤에 해요.
- 함수를 재배포하기 전에는 푸시만 안 가고 나머지는 다 돼요.
- `GitHub Actions → Deploy to Supabase`로도 같은 일을 할 수 있어요 (SUPABASE_SETUP.md H절). 저장소 비밀값에 `SUPABASE_ACCESS_TOKEN`만 넣으면 돼요.
- 클라우드 세션에서 앱 전체 보안 감사가 돌고 있어요. 결과가 나오면 고친 것을 같은 브랜치에 커밋으로 올려요. 머지 전에 `git pull`로 한 번 더 받아 주세요.
