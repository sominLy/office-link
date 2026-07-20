-- 자동 공지 등 내부 상태 저장용 (서비스 전용, 사용자 접근 불가)
create table if not exists public.app_state (
  key text primary key,
  value text not null
);
alter table public.app_state enable row level security;
-- 정책 없음 = anon/authenticated 접근 불가, service role만 사용
