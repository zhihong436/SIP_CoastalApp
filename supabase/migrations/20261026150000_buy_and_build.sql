-- Hold the shore is now split. The Interpreter buys protections within the budget, and the Investigator places them on
-- the shore and starts the storm. The bought items live in stop_progress.build, a list of
-- { "id", "protection", "section" } where section is null while the item sits in the toolbox. No two items share a
-- section. Existing trail rows stay, because the new column has a default.

alter table public.stop_progress add column build jsonb not null default '[]'::jsonb;
alter table public.stop_progress add constraint stop_progress_build_is_list check (jsonb_typeof(build) = 'array');

-- The only place that knows the budget and what each protection costs. buy_protection and submit_stop_answer both use
-- these, and the phones never decide a cost. The functions are internal, so no client role can call them.
create function public.hold_the_shore_budget()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 7;
$$;

create function public.protection_cost(p_protection text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_protection
    when 'sea_wall' then 3
    when 'rock_slope' then 2
    when 'breakwater' then 3
    when 'beach_plants' then 1
  end;
$$;

-- Finds the caller's open, unsolved stop and locks its progress row until the transaction ends, so a purchase, a return
-- and a placement at the same moment run one after another. The role is interpreter or investigator, and the caller
-- must hold it. Used by all four build functions.
create function public.lock_open_stop(p_session_id uuid, p_stop integer, p_role text)
returns public.stop_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_holder uuid;
  v_row public.stop_progress%rowtype;
  v_session public.trail_sessions%rowtype;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select * into v_row
  from public.stop_progress
  where session_id = p_session_id and stop = p_stop
  for update;
  if not found then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_role = 'interpreter' then
    v_holder := v_row.interpreter_id;
  else
    v_holder := v_row.investigator_id;
  end if;
  if v_user <> v_holder then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_session from public.trail_sessions where id = p_session_id;
  if v_session.status <> 'active' or v_session.current_stop is distinct from p_stop then
    raise exception 'This stop is not open' using errcode = '22023';
  end if;
  if v_row.solved_at is not null then
    raise exception 'This stop is already solved' using errcode = '22023';
  end if;

  return v_row;
end;
$$;

-- Interpreter only. Adds one unplaced item. A purchase that would take the build over budget changes nothing and
-- returns over_budget true, so the app can tell it apart from other errors.
create function public.buy_protection(p_session_id uuid, p_stop integer, p_protection text)
returns table (over_budget boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.stop_progress%rowtype;
  v_cost integer := public.protection_cost(p_protection);
  v_spent integer;
begin
  v_row := public.lock_open_stop(p_session_id, p_stop, 'interpreter');

  if v_cost is null then
    raise exception 'Unknown protection' using errcode = '22023';
  end if;

  select coalesce(sum(public.protection_cost(item ->> 'protection')), 0) into v_spent
  from jsonb_array_elements(v_row.build) as item;
  if v_spent + v_cost > public.hold_the_shore_budget() then
    return query select true;
    return;
  end if;

  update public.stop_progress
  set build = build || jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'protection', p_protection, 'section', null::text)
  )
  where session_id = p_session_id and stop = p_stop;

  return query select false;
end;
$$;

-- Interpreter only. Removes the item, placed or not, which refunds its cost. An unknown item changes nothing.
create function public.return_protection(p_session_id uuid, p_stop integer, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_open_stop(p_session_id, p_stop, 'interpreter');

  update public.stop_progress
  set build = coalesce(
    (
      select jsonb_agg(item order by position)
      from jsonb_array_elements(build) with ordinality as items(item, position)
      where item ->> 'id' <> p_item_id::text
    ),
    '[]'::jsonb
  )
  where session_id = p_session_id and stop = p_stop;
end;
$$;

-- Investigator only. Puts the item on a section, or back in the toolbox when the section is null. Any other item that
-- held the section goes back to the toolbox.
create function public.place_protection(p_session_id uuid, p_stop integer, p_item_id uuid, p_section text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.stop_progress%rowtype;
begin
  v_row := public.lock_open_stop(p_session_id, p_stop, 'investigator');

  if p_section is not null and p_section not in ('beach', 'path', 'car_park') then
    raise exception 'Unknown section' using errcode = '22023';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_row.build) as item where item ->> 'id' = p_item_id::text) then
    raise exception 'Unknown item' using errcode = '22023';
  end if;

  update public.stop_progress
  set build = (
    select jsonb_agg(
      case
        when item ->> 'id' = p_item_id::text then jsonb_set(item, '{section}', coalesce(to_jsonb(p_section), 'null'::jsonb))
        when p_section is not null and item ->> 'section' = p_section then jsonb_set(item, '{section}', 'null'::jsonb)
        else item
      end
      order by position
    )
    from jsonb_array_elements(build) with ordinality as items(item, position)
  )
  where session_id = p_session_id and stop = p_stop;
end;
$$;

-- Hold the shore. Investigator only. The plan is built from the placed items and maps beach, path and car_park to
-- sea_wall, rock_slope, breakwater, beach_plants or null for Empty. The results table lives only here, so no phone
-- decides a result. A build over budget is refused with over_budget true and is not counted. Any other checked plan
-- counts as an attempt, and the stop is solved once no section is lost.
drop function public.submit_stop_answer(uuid, integer, jsonb);

create function public.submit_stop_answer(p_session_id uuid, p_stop integer)
returns table (over_budget boolean, solved boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.stop_progress%rowtype;
  v_section text;
  v_protection text;
  v_cost integer;
  v_plan jsonb := '{}'::jsonb;
  v_results jsonb := '{}'::jsonb;
  v_result text;
  v_solved boolean := true;
begin
  v_row := public.lock_open_stop(p_session_id, p_stop, 'investigator');

  select coalesce(sum(public.protection_cost(item ->> 'protection')), 0) into v_cost
  from jsonb_array_elements(v_row.build) as item;
  if v_cost > public.hold_the_shore_budget() then
    return query select true, false;
    return;
  end if;

  foreach v_section in array array['beach', 'path', 'car_park'] loop
    -- Empty is null here and is always lost.
    select item ->> 'protection' into v_protection
    from jsonb_array_elements(v_row.build) as item
    where item ->> 'section' = v_section
    limit 1;
    v_plan := v_plan || jsonb_build_object(v_section, v_protection);

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

  update public.stop_progress
  set last_plan = v_plan,
      last_results = v_results,
      attempts = attempts + 1,
      solved_at = case when v_solved then now() end
  where session_id = p_session_id and stop = p_stop;

  return query select false, v_solved;
end;
$$;

revoke execute on function public.hold_the_shore_budget() from public, anon, authenticated;
revoke execute on function public.protection_cost(text) from public, anon, authenticated;
revoke execute on function public.lock_open_stop(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.buy_protection(uuid, integer, text) from public, anon;
revoke execute on function public.return_protection(uuid, integer, uuid) from public, anon;
revoke execute on function public.place_protection(uuid, integer, uuid, text) from public, anon;
revoke execute on function public.submit_stop_answer(uuid, integer) from public, anon;
grant execute on function public.buy_protection(uuid, integer, text) to authenticated;
grant execute on function public.return_protection(uuid, integer, uuid) to authenticated;
grant execute on function public.place_protection(uuid, integer, uuid, text) to authenticated;
grant execute on function public.submit_stop_answer(uuid, integer) to authenticated;
