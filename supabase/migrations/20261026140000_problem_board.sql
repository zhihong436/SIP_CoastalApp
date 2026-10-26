-- The problem board replaces the first puzzle. A started trail waits on the board with no stop open, and either person
-- opens a problem. Hold the shore is solved by a plan, which only the Interpreter submits and only this file judges.
-- This migration deletes every existing trail row, because those rows belong to the replaced puzzle. Their members and
-- stop progress go with them through the foreign keys, which also frees the people's one-active-trail claim.

delete from public.trail_sessions;

-- Null means the pair is on the board.
alter table public.trail_sessions alter column current_stop drop not null;
alter table public.trail_sessions alter column current_stop drop default;

alter table public.stop_progress drop column answer_correct;
alter table public.stop_progress drop column photo_taken;
alter table public.stop_progress rename column wrong_attempts to attempts;
-- started_at now means when the problem opened. The plan maps each section to a protection or null, and the results map
-- each section to safe, safe_with_cost or lost.
alter table public.stop_progress add column last_plan jsonb;
alter table public.stop_progress add column last_results jsonb;

drop function public.submit_stop_answer(uuid, integer, text);
drop function public.record_stop_photo(uuid, integer);

-- Saves the caller's readiness, creating the session on first use. When both people are ready it starts the trail:
-- it locks the pair and puts them on the board. If either person is already on another active trail nothing is saved
-- and blocked is true.
create or replace function public.set_trail_ready(p_match_id uuid, p_ready boolean)
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

  return query select true, false;
end;
$$;

-- Opens a problem for the pair, picking the roles at random. Only stop 1 is playable so far. Returns true when the stop
-- is open afterwards, including when it was already open, so two scans at once open it once. Returns false when the
-- problem cannot be opened: it is not playable, it is finished or another problem is open.
create function public.open_stop(p_session_id uuid, p_stop integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.trail_sessions%rowtype;
  v_match public.matches%rowtype;
  v_interpreter uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  -- Locking the session row makes a second call wait, then find the stop already open.
  select s.* into v_session
  from public.trail_sessions s
  join public.trail_members m on m.session_id = s.id
  where s.id = p_session_id and m.user_id = v_user
  for update of s;
  if not found then
    raise exception 'Trail not found' using errcode = '42501';
  end if;

  if v_session.status = 'lobby' then
    raise exception 'The trail has not started' using errcode = '22023';
  end if;
  if v_session.current_stop = p_stop then
    return true;
  end if;
  -- Paused means no problem is left to play. A finished stop has a row, and a different open stop blocks this one.
  if p_stop <> 1 or v_session.status <> 'active' or v_session.current_stop is not null then
    return false;
  end if;
  if exists (select 1 from public.stop_progress where session_id = p_session_id and stop = p_stop) then
    return false;
  end if;

  select * into v_match from public.matches where id = v_session.match_id;
  v_interpreter := case when random() < 0.5 then v_match.participant_a else v_match.participant_b end;
  insert into public.stop_progress (session_id, stop, interpreter_id, investigator_id)
  values (
    p_session_id,
    p_stop,
    v_interpreter,
    case when v_interpreter = v_match.participant_a then v_match.participant_b else v_match.participant_a end
  );
  update public.trail_sessions set current_stop = p_stop where id = p_session_id;

  return true;
end;
$$;

-- Hold the shore. The Interpreter submits a plan that maps beach, path and car_park to sea_wall, rock_slope,
-- breakwater, beach_plants or null for Empty. The costs, the budget and the results table live only here, so no phone
-- decides a result. A plan over budget is refused with over_budget true and is not counted. Any other checked plan
-- counts as an attempt, and the stop is solved once no section is lost.
create function public.submit_stop_answer(p_session_id uuid, p_stop integer, p_plan jsonb)
returns table (over_budget boolean, solved boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_budget constant integer := 7;
  v_user uuid := auth.uid();
  v_session public.trail_sessions%rowtype;
  v_row public.stop_progress%rowtype;
  v_section text;
  v_protection text;
  v_cost integer := 0;
  v_results jsonb := '{}'::jsonb;
  v_result text;
  v_solved boolean := true;
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
  if v_session.status <> 'active' or v_session.current_stop is distinct from p_stop then
    raise exception 'This stop is not open' using errcode = '22023';
  end if;
  if v_row.solved_at is not null then
    raise exception 'This stop is already solved' using errcode = '22023';
  end if;

  -- The plan has exactly the three sections, each empty or one of the four protections.
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' or (select count(*) from jsonb_object_keys(p_plan)) <> 3 then
    raise exception 'Invalid plan' using errcode = '22023';
  end if;
  foreach v_section in array array['beach', 'path', 'car_park'] loop
    if not p_plan ? v_section then
      raise exception 'Invalid plan' using errcode = '22023';
    end if;
    if jsonb_typeof(p_plan -> v_section) = 'null' then
      v_protection := null;
    elsif jsonb_typeof(p_plan -> v_section) = 'string' then
      v_protection := p_plan ->> v_section;
      if v_protection not in ('sea_wall', 'rock_slope', 'breakwater', 'beach_plants') then
        raise exception 'Invalid plan' using errcode = '22023';
      end if;
    else
      raise exception 'Invalid plan' using errcode = '22023';
    end if;

    v_cost := v_cost + case v_protection
      when 'sea_wall' then 3
      when 'rock_slope' then 2
      when 'breakwater' then 3
      when 'beach_plants' then 1
      else 0
    end;

    -- Empty is null here and is always lost.
    v_result := case v_section
      when 'beach' then case v_protection
        when 'sea_wall' then 'safe_with_cost'
        when 'rock_slope' then 'safe_with_cost'
        when 'breakwater' then 'safe'
        when 'beach_plants' then 'safe'
        else 'lost'
      end
      when 'path' then case v_protection
        when 'sea_wall' then 'safe'
        when 'rock_slope' then 'safe'
        when 'breakwater' then 'safe'
        when 'beach_plants' then 'lost'
        else 'lost'
      end
      else case v_protection
        when 'sea_wall' then 'safe'
        when 'rock_slope' then 'lost'
        when 'breakwater' then 'lost'
        when 'beach_plants' then 'lost'
        else 'lost'
      end
    end;
    v_results := v_results || jsonb_build_object(v_section, v_result);
    if v_result = 'lost' then
      v_solved := false;
    end if;
  end loop;

  if v_cost > c_budget then
    return query select true, false;
    return;
  end if;

  update public.stop_progress
  set last_plan = p_plan,
      last_results = v_results,
      attempts = attempts + 1,
      solved_at = case when v_solved then now() end
  where session_id = p_session_id and stop = p_stop;

  return query select false, v_solved;
end;
$$;

-- Saves the caller's acknowledgement of a solved stop once. When both people have acknowledged, the pair returns to the
-- board, and the session pauses if no playable problem is left. A repeated or stale call changes nothing.
create or replace function public.acknowledge_stop(p_session_id uuid, p_stop integer)
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

  -- Only stop 1 is playable so far, so finishing it leaves nothing to play.
  update public.trail_sessions
  set current_stop = null,
      status = 'paused'
  where id = p_session_id and status = 'active' and current_stop = p_stop
    and exists (
      select 1 from public.stop_progress s
      where s.session_id = p_session_id and s.stop = p_stop
        and s.interpreter_acknowledged_at is not null and s.investigator_acknowledged_at is not null
    );
end;
$$;

revoke execute on function public.set_trail_ready(uuid, boolean) from public, anon;
revoke execute on function public.open_stop(uuid, integer) from public, anon;
revoke execute on function public.submit_stop_answer(uuid, integer, jsonb) from public, anon;
revoke execute on function public.acknowledge_stop(uuid, integer) from public, anon;
grant execute on function public.set_trail_ready(uuid, boolean) to authenticated;
grant execute on function public.open_stop(uuid, integer) to authenticated;
grant execute on function public.submit_stop_answer(uuid, integer, jsonb) to authenticated;
grant execute on function public.acknowledge_stop(uuid, integer) to authenticated;
