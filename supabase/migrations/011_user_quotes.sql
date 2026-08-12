-- 사용자 제보 응원 글귀
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  created_by uuid references public.profiles(id) on delete set null,
  approved boolean not null default true, -- 베타: 비속어 필터 통과 시 바로 노출
  created_at timestamptz not null default now()
);

alter table public.quotes enable row level security;

-- 승인된 글귀는 누구나 읽기 (오늘의 한마디 풀)
drop policy if exists quotes_select on public.quotes;
create policy quotes_select on public.quotes for select to authenticated
  using (approved = true or created_by = auth.uid());

-- 제보는 로그인 사용자 본인 명의로만
drop policy if exists quotes_insert on public.quotes;
create policy quotes_insert on public.quotes for insert to authenticated
  with check (created_by = auth.uid());

-- 본인이 올린 건 삭제 가능
drop policy if exists quotes_delete on public.quotes;
create policy quotes_delete on public.quotes for delete to authenticated
  using (created_by = auth.uid());
