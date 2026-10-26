-- Profiles: one row per tester account. Public sign-up is off, so every Auth account is a tester.

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 50),
  age integer not null check (age between 18 and 120),
  gender text not null check (gender = btrim(gender) and char_length(gender) between 1 and 50),
  bio text not null check (bio = btrim(bio) and char_length(bio) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- user_id is never supplied or changed by the client. It comes from the session.
grant select on public.profiles to authenticated;
grant insert (name, age, gender, bio) on public.profiles to authenticated;
grant update (name, age, gender, bio, updated_at) on public.profiles to authenticated;

create policy "Signed-in users read all profiles"
  on public.profiles for select to authenticated
  using (true);

create policy "Users create their own profile"
  on public.profiles for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users edit their own profile"
  on public.profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
