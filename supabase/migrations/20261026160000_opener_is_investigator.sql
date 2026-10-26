-- The person who opens a problem is now its Investigator and their partner is the Interpreter, instead of a random pick.
-- A chosen tester can then take the camera role by scanning the card. The session row lock is kept, so with two scans at
-- once the first caller keeps the role and the second finds the stop already open.

create or replace function public.open_stop(p_session_id uuid, p_stop integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.trail_sessions%rowtype;
  v_match public.matches%rowtype;
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
  insert into public.stop_progress (session_id, stop, interpreter_id, investigator_id)
  values (
    p_session_id,
    p_stop,
    case when v_user = v_match.participant_a then v_match.participant_b else v_match.participant_a end,
    v_user
  );
  update public.trail_sessions set current_stop = p_stop where id = p_session_id;

  return true;
end;
$$;

revoke execute on function public.open_stop(uuid, integer) from public, anon;
grant execute on function public.open_stop(uuid, integer) to authenticated;
