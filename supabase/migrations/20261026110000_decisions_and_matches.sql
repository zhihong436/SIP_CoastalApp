-- Likes, passes and matches. Clients read their own decisions and their own matches.
-- Everything is written through submit_decision, so a pass cannot be changed and no client can create a match.

create table public.profile_decisions (
  actor_id uuid not null references public.profiles (user_id) on delete cascade,
  target_id uuid not null references public.profiles (user_id) on delete cascade,
  decision text not null check (decision in ('like', 'pass')),
  created_at timestamptz not null default now(),
  primary key (actor_id, target_id),
  check (actor_id <> target_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  participant_a uuid not null references public.profiles (user_id) on delete cascade,
  participant_b uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Ordering the pair makes it unique whichever person liked first.
  check (participant_a < participant_b),
  unique (participant_a, participant_b)
);

-- The primary key and the unique pair already index lookups by actor and by participant_a.
create index matches_participant_b_idx on public.matches (participant_b);

alter table public.profile_decisions enable row level security;
alter table public.matches enable row level security;

grant select on public.profile_decisions to authenticated;
grant select on public.matches to authenticated;

create policy "Users read their own decisions"
  on public.profile_decisions for select to authenticated
  using (actor_id = auth.uid());

create policy "Members read their matches"
  on public.matches for select to authenticated
  using (auth.uid() in (participant_a, participant_b));

-- Saves the caller's decision and creates the match when both people have liked.
-- A repeat decision returns the saved outcome and never overwrites it.
create function public.submit_decision(p_target uuid, p_decision text)
returns table (saved_decision text, new_match_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_saved text;
  v_match uuid;
begin
  if v_actor is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if p_decision not in ('like', 'pass') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;
  if p_target = v_actor
     or not exists (select 1 from public.profiles where user_id = p_target)
     or not exists (select 1 from public.profiles where user_id = v_actor) then
    raise exception 'Invalid target' using errcode = '22023';
  end if;

  v_a := least(v_actor, p_target);
  v_b := greatest(v_actor, p_target);

  -- Two simultaneous likes would otherwise each miss the other and form no match.
  perform pg_advisory_xact_lock(hashtextextended(v_a::text || v_b::text, 0));

  insert into public.profile_decisions (actor_id, target_id, decision)
  values (v_actor, p_target, p_decision)
  on conflict (actor_id, target_id) do nothing;

  select d.decision into v_saved
  from public.profile_decisions d
  where d.actor_id = v_actor and d.target_id = p_target;

  if v_saved = 'like' and exists (
    select 1 from public.profile_decisions r
    where r.actor_id = p_target and r.target_id = v_actor and r.decision = 'like'
  ) then
    insert into public.matches (participant_a, participant_b)
    values (v_a, v_b)
    on conflict (participant_a, participant_b) do nothing;
  end if;

  select m.id into v_match
  from public.matches m
  where m.participant_a = v_a and m.participant_b = v_b;

  return query select v_saved, v_match;
end;
$$;

revoke execute on function public.submit_decision(uuid, text) from public, anon;
grant execute on function public.submit_decision(uuid, text) to authenticated;
