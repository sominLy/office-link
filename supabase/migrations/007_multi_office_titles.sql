-- 멀티 오피스 + 호칭 모드

-- 오피스별 호칭 방식: nim(~님) / pro(~프로) / rank(직급) / english(영어 이름)
alter table public.offices add column if not exists title_mode text not null default 'nim'
  check (title_mode in ('nim','pro','rank','english'));

-- 사용자가 마지막으로 보고 있던 오피스 (멀티 오피스 전환용)
alter table public.profiles add column if not exists current_office_id uuid references public.offices(id) on delete set null;

-- 호칭 변경은 같은 오피스 멤버(방장)가 해야 하므로 offices update 정책 추가
drop policy if exists offices_update on public.offices;
create policy offices_update on public.offices for update to authenticated
  using (exists (
    select 1 from public.office_members m
    where m.office_id = id and m.user_id = auth.uid() and m.role = 'admin'
  ));
