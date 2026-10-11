-- 업데이트 공지 전용 저장소
-- 지금까지는 공지를 오피스마다 '방장 이름의 일반 게시글'로 넣어서, 소식 탭이 최근 100개만 불러오는 동안
-- 출퇴근 기록에 밀려 공지가 보이지 않게 됐다. 공지는 따로 저장하고 소식 탭 맨 위에 고정해 보여준다.
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (여러 번 실행해도 안전)

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  sha text unique,              -- 공지를 만든 커밋 — 같은 공지가 두 번 올라가지 않게 (GitHub Actions + 크론 동시 동작 대비)
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_announcements_time on public.announcements (created_at desc);

alter table public.announcements enable row level security;

-- 로그인한 누구나 읽기만 가능, 쓰기는 서버(push-notify 함수, service role)만
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select to authenticated using (true);

do $$
begin
  begin
    alter publication supabase_realtime add table public.announcements;
  exception when duplicate_object then null;
  end;
end $$;

-- 지난 공지 복구 (커밋 기록의 [공지] 줄에서 가져옴)
insert into public.announcements (sha, message, created_at) values
  ('ee59d0c476ddf341f9e30482865aa59e0364219f', $q$새 기능이 나올 때마다 소식 탭으로 자동으로 알려드릴게요! 이 글이 자동으로 올라왔다면 성공이에요 🎉🐥$q$, '2026-07-20T10:41:35+09:00'),
  ('23b6a4c911ac04b79cc433fa77bbb90fd9f3d09d', $q$앱 디자인이 산뜻하게 새단장했어요! ✨ 유리 질감 상단바·하단바, 더 또렷한 글씨, 부드러운 카드 반응까지 🐥$q$, '2026-07-20T20:17:11+09:00'),
  ('72c569b65c466f9d024b4dadca26f158e21aad67', $q$모바일 화면이 더 편해졌어요! 📱 할 일 글씨 깨짐·모달 잘림·좌우 밀림을 싹 정리했어요 🐥$q$, '2026-08-12T20:45:32+09:00'),
  ('0dac575b2f33a563206c0ef87b2d0c3e3b5bb6a5', $q$할 일 카드가 모바일에서 더 깔끔해졌어요! ⋯ 메뉴로 정리하고 긴 이름도 안 깨지게 다듬었어요 🐥$q$, '2026-08-12T20:51:00+09:00'),
  ('66fbe5dfbe6795de9d016a8dbe40243bfddd5aa6', $q$리포트가 근무시간 중심으로 바뀌고, ◀▶로 지난 주 기록도 볼 수 있어요! 📊$q$, '2026-08-12T20:56:29+09:00'),
  ('dd9066f338c15cf0daaa96397a1c2c9b450183d2', $q$홈 우측 하단 ✨ 버튼을 눌러보세요! 숨은 기능 모음이 들어있고, 오늘의 응원 한마디도 직접 제보할 수 있어요 💌$q$, '2026-08-12T21:11:37+09:00'),
  ('a1ceb9b7243f415ea7c279a51ba65a3da223388f', $q$홈의 응원 한마디 옆 🔄 버튼을 눌러보세요! 마음에 드는 응원이 나올 때까지 새로고침할 수 있어요 💌$q$, '2026-08-12T21:24:46+09:00'),
  ('df470986a8a17238fed2d6a8ae80396e93c91026', $q$소식 탭에 💬 채팅이 생겼어요! 오피스 멤버끼리 실시간으로 대화할 수 있어요 🗨️$q$, '2026-08-13T21:42:42+09:00'),
  ('6cf1cd703877c66e9a48a92bb2b20643f0f931a0', $q$채팅이 확 좋아졌어요! 💬 이제 갠톡(1:1)·이모티콘·읽음 표시가 되고, 보낸 메시지는 10분 안에 삭제할 수 있어요 (지난 대화는 일주일 뒤 자동 정리)$q$, '2026-08-13T21:50:30+09:00'),
  ('1773e313dada5c4874ed213a657dfe2a5b539190', $q$🍅 집중 모드 3종 추가: 뽀모도로 타이머·판옵티콘 감시·예상 퇴근 알림$q$, '2026-09-06T23:56:34+09:00'),
  ('6caf14f9c20a08b0459c724abc85893ff03e2503', $q$🍅 집중 모드가 생겼어요! 우측 하단 ✨ 더보기 → 집중 모드에서 열 수 있어요. 뽀모도로 타이머로 귀여운 친구와 같이 집중하고, [감시] 탭의 판옵티콘 모드는 5분 단위로 5분~6시간 원하는 간격마다 '아직 집중 중?' 알림을 보내드려요. [퇴근알림] 탭에 예상 퇴근 시간을 정해두면 그 시간에 살짝 알려드릴게요. 화면이 안 바뀌면 더보기 → 앱 새로고침을 한 번 눌러주세요!$q$, '2026-09-07T09:40:28+09:00'),
  ('7e619e8a69370a73826fb2b55bade4562fb85a5c', $q$✅ 할 일이 똑똑해졌어요! ① 카드마다 시작 전·진행 중·완료를 직접 고를 수 있어요 ② 출근 버튼을 누르면 마감일이 지난 할 일을 모아 보여주고, +1일·+2일·+3일·+일주일로 미루거나 날짜를 다시 정하거나 완료·삭제할 수 있어요 ③ 캘린더에 잡아둔 일정이 이번 주 할 일에 자동으로 올라와요 ④ 할 일에 마감 시간(오후 6시까지)도 정할 수 있어요$q$, '2026-09-09T09:24:00+09:00')
on conflict (sha) do nothing;
