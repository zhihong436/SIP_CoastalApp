-- The shared trail. A matched pair marks ready in a lobby, the trail starts and each stop gives them one role each.
-- Members read their own trail. Everything is written through the four functions below, so a phone never decides
-- readiness, roles, answers or progress. Deleting a match deletes its trail rows through the foreign keys.

create table public.trail_sessions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches (id) on delete cascade,
  -- Paused means the last built stop is finished and the next stop does not exist yet.
  status text not null default 'lobby' check (status in ('lobby', 'active', 'paused')),
  current_stop integer not null default 1 check (current_stop >= 1),
  created_at timestamptz not null default now(),
  started_at timestamptz
);

create table public.trail_members (
  session_id uuid not null references public.trail_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  ready boolean not null default false,
  -- True from the moment the trail starts, which claims the person's one active trail.
  active boolean not null default false,
  primary key (session_id, user_id)
);

-- A person can be active in only one trail at a time.
create unique index trail_members_one_active_idx on public.trail_members (user_id) where active;

create table public.stop_progress (
  session_id uuid not null references public.trail_sessions (id) on delete cascade,
  stop integer not null check (stop >= 1),
  interpreter_id uuid not null references public.profiles (user_id) on delete cascade,
  investigator_id uuid not null references public.profiles (user_id) on delete cascade,
  answer_correct boolean not null default false,
  wrong_attempts integer not null default 0,
  -- Only that the photo was taken. The photo itself stays on the Investigator's phone.
  photo_taken boolean not null default false,
  started_at timestamptz not null default now(),
  solved_at timestamptz,
  interpreter_acknowledged_at timestamptz,
  investigator_acknowledged_at timestamptz,
  primary key (session_id, stop),
  check (interpreter_id <> investigator_id)
);

alter table public.trail_sessions enable row level security;
alter table public.trail_members enable row level security;
alter table public.stop_progress enable row level security;

-- Read only. No client can insert, update or delete trail rows directly.
grant select on public.trail_sessions to authenticated;
grant select on public.trail_members to authenticated;
grant select on public.stop_progress to authenticated;

create policy "Members read their trail session"
  on public.trail_sessions for select to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id and auth.uid() in (m.participant_a, m.participant_b)
  ));

create policy "Members read their trail members"
  on public.trail_members for select to authenticated
  using (exists (
    select 1
    from public.trail_sessions s
    join public.matches m on m.id = s.match_id
    where s.id = session_id and auth.uid() in (m.participant_a, m.participant_b)
  ));

create policy "Members read their stop progress"
  on public.stop_progress for select to authenticated
  using (auth.uid() in (interpreter_id, investigator_id));

-- Saves the caller's readiness, creating the session on first use. When both people are ready it starts the trail:
-- it locks the pair, picks the roles at random and opens stop 1. If either person is already on another active trail
-- nothing is saved and blocked is true.
create function public.set_trail_ready(p_match_id uuid, p_ready boolean)
returns table (started boolean, blocked boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_match public.matches%rowtype;
  v_session public.trail_sessions%rowtype;
  v_partner_ready boolean;
  v_interpreter uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id and v_user in (participant_a, participant_b);
  if not found then
    raise exception 'Match not found' using errcode = '42501';
  end if;

  -- Two people marking ready at the same moment must not each miss the other.
  perform pg_advisory_xact_lock(hashtextextended(p_match_id::text, 1));

  insert into public.trail_sessions (match_id) values (p_match_id)
  on conflict (match_id) do nothing;
  select * into v_session from public.trail_sessions where match_id = p_match_id;

  insert into public.trail_members (session_id, user_id)
  values (v_session.id, v_match.participant_a), (v_session.id, v_match.participant_b)
  on conflict (session_id, user_id) do nothing;

  -- Once the trail has started, readiness no longer changes anything.
  if v_session.status <> 'lobby' then
    return query select true, false;
    return;
  end if;

  select m.ready into v_partner_ready
  from public.trail_members m
  where m.session_id = v_session.id and m.user_id <> v_user;

  if not (p_ready and v_partner_ready) then
    update public.trail_members set ready = p_ready
    where session_id = v_session.id and user_id = v_user;
    return query select false, false;
    return;
  end if;

  -- Lock both people in a fixed order, so two trails sharing a person cannot both start.
  perform pg_advisory_xact_lock(hashtextextended(least(v_match.participant_a, v_match.participant_b)::text, 2));
  perform pg_advisory_xact_lock(hashtextextended(greatest(v_match.participant_a, v_match.participant_b)::text, 2));

  -- This session's members are not active yet, so any active row belongs to another trail.
  if exists (
    select 1 from public.trail_members m
    where m.user_id in (v_match.participant_a, v_match.participant_b) and m.active
  ) then
    return query select false, true;
    return;
  end if;

  update public.trail_members set ready = true where session_id = v_session.id and user_id = v_user;
  update public.trail_members set active = true where session_id = v_session.id;
  update public.trail_sessions set status = 'active', started_at = now() where id = v_session.id;

  v_interpreter := case when random() < 0.5 then v_match.participant_a else v_match.participant_b end;
  insert into public.stop_progress (session_id, stop, interpreter_id, investigator_id)
  values (
    v_session.id,
    1,
    v_interpreter,
    case when v_interpreter = v_match.participant_a then v_match.participant_b else v_match.participant_a end
  );

  return query select true, false;
end;
$$;

-- The Interpreter picks one object. The answer to stop 1 lives only here, so no phone can decide it.
-- A wrong choice is counted and can be repeated. The stop is solved once the answer is right and the photo is taken.
create function public.submit_stop_answer(p_session_id uuid, p_stop integer, p_choice text)
returns table (correct boolean, solved boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.trail_sessions%rowtype;
  v_row public.stop_progress%rowtype;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select * into v_row
  from public.stop_progress
  where session_id = p_session_id and stop = p_stop
  for update;
  if not found or v_row.interpreter_id <> v_user then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_session from public.trail_sessions where id = p_session_id;
  if v_session.status <> 'active' or v_session.current_stop <> p_stop then
    raise exception 'This stop is not open' using errcode = '22023';
  end if;
  if p_stop <> 1 or p_choice not in ('bench', 'barbecue_pit', 'shelter', 'lamp_post', 'palm_tree') then
    raise exception 'Invalid choice' using errcode = '22023';
  end if;

  -- A stop that already has its right answer keeps it.
  if not v_row.answer_correct then
    if p_choice = 'shelter' then
      update public.stop_progress set answer_correct = true
      where session_id = p_session_id and stop = p_stop;
    else
      update public.stop_progress set wrong_attempts = wrong_attempts + 1
      where session_id = p_session_id and stop = p_stop;
    end if;
  end if;

  update public.stop_progress set solved_at = now()
  where session_id = p_session_id and stop = p_stop
    and answer_correct and photo_taken and solved_at is null;

  return query
    select s.answer_correct, s.solved_at is not null
    from public.stop_progress s
    where s.session_id = p_session_id and s.stop = p_stop;
end;
$$;

-- The Investigator took the photo. Repeating the call after a retake changes nothing.
create function public.record_stop_photo(p_session_id uuid, p_stop integer)
returns table (solved boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.trail_sessions%rowtype;
  v_row public.stop_progress%rowtype;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select * into v_row
  from public.stop_progress
  where session_id = p_session_id and stop = p_stop
  for update;
  if not found or v_row.investigator_id <> v_user then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_session from public.trail_sessions where id = p_session_id;
  if v_session.status <> 'active' or v_session.current_stop <> p_stop then
    raise exception 'This stop is not open' using errcode = '22023';
  end if;

  update public.stop_progress set photo_taken = true
  where session_id = p_session_id and stop = p_stop;

  update public.stop_progress set solved_at = now()
  where session_id = p_session_id and stop = p_stop
    and answer_correct and photo_taken and solved_at is null;

  return query
    select s.solved_at is not null
    from public.stop_progress s
    where s.session_id = p_session_id and s.stop = p_stop;
end;
$$;

-- Saves the caller's acknowledgement of a solved stop once. When both people have acknowledged, the session pauses.
-- A repeated or stale call changes nothing.
create function public.acknowledge_stop(p_session_id uuid, p_stop integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.stop_progress%rowtype;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select * into v_row
  from public.stop_progress
  where session_id = p_session_id and stop = p_stop
  for update;
  if not found or v_user not in (v_row.interpreter_id, v_row.investigator_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_row.solved_at is null then
    raise exception 'This stop is not solved yet' using errcode = '22023';
  end if;

  if v_user = v_row.interpreter_id then
    update public.stop_progress
    set interpreter_acknowledged_at = coalesce(interpreter_acknowledged_at, now())
    where session_id = p_session_id and stop = p_stop;
  else
    update public.stop_progress
    set investigator_acknowledged_at = coalesce(investigator_acknowledged_at, now())
    where session_id = p_session_id and stop = p_stop;
  end if;

  update public.trail_sessions set status = 'paused'
  where id = p_session_id and status = 'active' and current_stop = p_stop
    and exists (
      select 1 from public.stop_progress s
      where s.session_id = p_session_id and s.stop = p_stop
        and s.interpreter_acknowledged_at is not null and s.investigator_acknowledged_at is not null
    );
end;
$$;

revoke execute on function public.set_trail_ready(uuid, boolean) from public, anon;
revoke execute on function public.submit_stop_answer(uuid, integer, text) from public, anon;
revoke execute on function public.record_stop_photo(uuid, integer) from public, anon;
revoke execute on function public.acknowledge_stop(uuid, integer) from public, anon;
grant execute on function public.set_trail_ready(uuid, boolean) to authenticated;
grant execute on function public.submit_stop_answer(uuid, integer, text) to authenticated;
grant execute on function public.record_stop_photo(uuid, integer) to authenticated;
grant execute on function public.acknowledge_stop(uuid, integer) to authenticated;

-- Realtime only announces rows the listening user is allowed to read.
alter publication supabase_realtime add table public.trail_sessions, public.trail_members, public.stop_progress;
