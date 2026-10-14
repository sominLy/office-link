-- 모임 삭제는 오피스 방장만 (소민 요청, 2026-10-14).
-- 024는 연 사람(host)이 지울 수 있게 했다. 이제 연 사람은 종료까지만, 들어온 사람은 나가기만, 지우는 건 방장(008의 is_office_admin).
-- 024 파일도 같은 정책으로 고쳐 두었다. 실행: SQL Editor에 붙여넣고 Run (여러 번 실행해도 안전).
drop policy if exists study_rooms_delete on public.study_rooms;
create policy study_rooms_delete on public.study_rooms for delete to authenticated
  using (public.is_office_admin(office_id));
