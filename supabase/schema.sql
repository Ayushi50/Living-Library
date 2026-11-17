create table if not exists public.user_libraries (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

-- Guard against runaway payloads (~10 MB of JSON); the app uploads the whole library on each save.
alter table public.user_libraries drop constraint if exists user_libraries_data_size;
alter table public.user_libraries add constraint user_libraries_data_size check (octet_length(data::text) <= 10485760);

alter table public.user_libraries enable row level security;

revoke all on public.user_libraries from anon, public;
grant select, insert, update on public.user_libraries to authenticated;

drop policy if exists "Users can read their own library" on public.user_libraries;
create policy "Users can read their own library"
  on public.user_libraries for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own library" on public.user_libraries;
create policy "Users can create their own library"
  on public.user_libraries for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own library" on public.user_libraries;
create policy "Users can update their own library"
  on public.user_libraries for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);