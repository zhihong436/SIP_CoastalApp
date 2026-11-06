-- Break the waves is the first stop of the new hunt. Existing trail sessions keep the old problem-board
-- behaviour and their rows: the new version is opt-in by a version column, and only newly created
-- sessions default to the hunt. No old session is migrated, deleted or abandoned here.
--
-- The stop stores accepted geometry in one row per trail session. Both participants own two fixed
-- pieces. Every mutation locks the session and progress row, checks membership, ownership and the
-- expected layout revision, logs an action id, and clears both ready checks on an accepted edit.
-- The database evaluates the simplified shelter model; the client only mirrors it for display.

alter table public.trail_sessions add column game_version text;
update public.trail_sessions set game_version = 'legacy';
alter table public.trail_sessions alter column game_version set default 'hunt-v1';
alter table public.trail_sessions alter column game_version set not null;
alter table public.trail_sessions
  add constraint trail_sessions_game_version_check check (game_version in ('legacy', 'hunt-v1'));

create table public.break_waves_progress (
  session_id uuid primary key references public.trail_sessions (id) on delete cascade,
  -- The revision changes only when accepted construction changes.
  revision integer not null default 0,
  -- All four pieces, placed or not. Owner is the stable match participant a or b.
  pieces jsonb not null default '[
    {"id":"a1","owner":"a","placed":false,"x":0,"z":0,"rotation":0},
    {"id":"a2","owner":"a","placed":false,"x":0,"z":0,"rotation":0},
    {"id":"b1","owner":"b","placed":false,"x":0,"z":0,"rotation":0},
    {"id":"b2","owner":"b","placed":false,"x":0,"z":0,"rotation":0}
  ]'::jsonb,
  ready_a boolean not null default false,
  ready_b boolean not null default false,
  attempts integer not null default 0,
  last_test_revision integer,
  last_test_layout jsonb,
  last_test_result jsonb,
  last_test_action_id uuid,
  solved_revision integer,
  solved_at timestamptz,
  ack_a_at timestamptz,
  ack_b_at timestamptz,
  clue_unlocked_at timestamptz,
  opened_at timestamptz,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(pieces) = 'array'),
  check (revision >= 0),
  check (attempts >= 0)
);

-- Only the database functions need this log. It makes a repeated action id a no-op, including a
-- retried ready call that would otherwise run a second test.
create table public.break_waves_actions (
  session_id uuid not null references public.break_waves_progress (session_id) on delete cascade,
  action_id uuid not null,
  kind text not null check (kind in ('edit', 'return', 'ready', 'test', 'ack')),
  revision integer not null,
  created_at timestamptz not null default now(),
  primary key (session_id, action_id)
);

alter table public.break_waves_progress enable row level security;
-- The action log is intentionally client-inaccessible: RLS on, no policy, no grants.
alter table public.break_waves_actions enable row level security;

-- Read only. No client role can insert, update or delete these rows directly.
revoke all on public.break_waves_progress from public, anon, authenticated;
revoke all on public.break_waves_actions from public, anon, authenticated;
grant select on public.break_waves_progress to authenticated;

create policy "Members read their break waves progress"
  on public.break_waves_progress for select to authenticated
  using (exists (
    select 1
    from public.trail_sessions s
    join public.matches m on m.id = s.match_id
    where s.id = session_id and auth.uid() in (m.participant_a, m.participant_b)
  ));

-- The four corners are returned as x1,z1,x2,z2,x3,z3,x4,z4 in 2D marker coordinates.
-- The long axis runs along local x. A positive rotation turns it towards positive z.
create function public.break_waves_corners(p_x numeric, p_z numeric, p_rotation numeric)
returns numeric[]
language sql
immutable
set search_path = ''
as $$
  select array[
    p_x - 0.09 * cos(radians(p_rotation)) + 0.015 * sin(radians(p_rotation)),
    p_z - 0.09 * sin(radians(p_rotation)) - 0.015 * cos(radians(p_rotation)),
    p_x + 0.09 * cos(radians(p_rotation)) + 0.015 * sin(radians(p_rotation)),
    p_z + 0.09 * sin(radians(p_rotation)) - 0.015 * cos(radians(p_rotation)),
    p_x + 0.09 * cos(radians(p_rotation)) - 0.015 * sin(radians(p_rotation)),
    p_z + 0.09 * sin(radians(p_rotation)) + 0.015 * cos(radians(p_rotation)),
    p_x - 0.09 * cos(radians(p_rotation)) - 0.015 * sin(radians(p_rotation)),
    p_z - 0.09 * sin(radians(p_rotation)) + 0.015 * cos(radians(p_rotation))
  ]::numeric[];
$$;

-- Separating-axis test for two convex rectangles. Touching edges are allowed; a real overlap is not.
create function public.break_waves_rectangles_overlap(p_a numeric[], p_b numeric[])
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  i integer;
  j integer;
  a1x numeric;
  a1z numeric;
  a2x numeric;
  a2z numeric;
  axis_x numeric;
  axis_z numeric;
  min_a numeric;
  max_a numeric;
  min_b numeric;
  max_b numeric;
  projection numeric;
begin
  -- Axes from rectangle A.
  for i in 0..3 loop
    a1x := p_a[i * 2 + 1];
    a1z := p_a[i * 2 + 2];
    a2x := p_a[((i + 1) % 4) * 2 + 1];
    a2z := p_a[((i + 1) % 4) * 2 + 2];
    axis_x := -(a2z - a1z);
    axis_z := a2x - a1x;
    if axis_x = 0 and axis_z = 0 then
      continue;
    end if;
    min_a := null;
    max_a := null;
    min_b := null;
    max_b := null;
    for j in 0..3 loop
      projection := p_a[j * 2 + 1] * axis_x + p_a[j * 2 + 2] * axis_z;
      min_a := least(coalesce(min_a, projection), projection);
      max_a := greatest(coalesce(max_a, projection), projection);
      projection := p_b[j * 2 + 1] * axis_x + p_b[j * 2 + 2] * axis_z;
      min_b := least(coalesce(min_b, projection), projection);
      max_b := greatest(coalesce(max_b, projection), projection);
    end loop;
    if max_a <= min_b or max_b <= min_a then
      return false;
    end if;
  end loop;

  -- Axes from rectangle B.
  for i in 0..3 loop
    a1x := p_b[i * 2 + 1];
    a1z := p_b[i * 2 + 2];
    a2x := p_b[((i + 1) % 4) * 2 + 1];
    a2z := p_b[((i + 1) % 4) * 2 + 2];
    axis_x := -(a2z - a1z);
    axis_z := a2x - a1x;
    if axis_x = 0 and axis_z = 0 then
      continue;
    end if;
    min_a := null;
    max_a := null;
    min_b := null;
    max_b := null;
    for j in 0..3 loop
      projection := p_a[j * 2 + 1] * axis_x + p_a[j * 2 + 2] * axis_z;
      min_a := least(coalesce(min_a, projection), projection);
      max_a := greatest(coalesce(max_a, projection), projection);
      projection := p_b[j * 2 + 1] * axis_x + p_b[j * 2 + 2] * axis_z;
      min_b := least(coalesce(min_b, projection), projection);
      max_b := greatest(coalesce(max_b, projection), projection);
    end loop;
    if max_a <= min_b or max_b <= min_a then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

-- A target is sheltered when the upstream ray (towards positive z) meets the piece's long centreline.
-- A piece rotated parallel to the wave direction has no horizontal span, so it cannot shelter a target.
create function public.break_waves_piece_shelters(p_target_x numeric, p_target_z numeric, p_piece jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_x numeric;
  v_z numeric;
  v_rotation numeric;
  v_theta numeric;
  v_p1x numeric;
  v_p1z numeric;
  v_dx numeric;
  v_dz numeric;
  v_t numeric;
begin
  if not coalesce((p_piece ->> 'placed')::boolean, false) then
    return false;
  end if;

  v_x := (p_piece ->> 'x')::numeric;
  v_z := (p_piece ->> 'z')::numeric;
  v_rotation := (p_piece ->> 'rotation')::numeric;
  if v_x is null or v_z is null or v_rotation is null then
    return false;
  end if;

  v_theta := radians(v_rotation);
  v_p1x := v_x - 0.09 * cos(v_theta);
  v_p1z := v_z - 0.09 * sin(v_theta);
  v_dx := 0.18 * cos(v_theta);
  v_dz := 0.18 * sin(v_theta);

  -- Parallel to the wave direction: no useful broadside span.
  if abs(v_dx) < 0.000001 then
    return false;
  end if;

  v_t := (p_target_x - v_p1x) / v_dx;
  if v_t < 0 or v_t > 1 then
    return false;
  end if;

  return v_p1z + v_t * v_dz >= p_target_z;
end;
$$;

-- The single authoritative construction check. It returns both the pass/fail booleans and the target
-- flags used by the client's lens so the displayed challenge cannot drift from the saved result.
create function public.break_waves_evaluate(p_pieces jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_count integer;
  v_i integer;
  v_j integer;
  v_piece jsonb;
  v_other jsonb;
  v_corners numeric[];
  v_other_corners numeric[];
  v_corner integer;
  v_valid boolean := true;
  v_errors text[] := array[]::text[];
  v_west integer := 0;
  v_east integer := 0;
  v_west_targets boolean[] := array[]::boolean[];
  v_east_targets boolean[] := array[]::boolean[];
  v_west_sheltered boolean;
  v_east_sheltered boolean;
  v_corridor_clear boolean := true;
  v_corridor numeric[] := array[-0.075, -0.08, 0.075, -0.08, 0.075, 0.28, -0.075, 0.28];
  v_placed_a integer := 0;
  v_placed_b integer := 0;
  v_failures text[] := array[]::text[];
  v_passed boolean;
  v_target_x numeric;
begin
  if p_pieces is null or jsonb_typeof(p_pieces) <> 'array' then
    return jsonb_build_object(
      'passed', false,
      'valid', false,
      'west_sheltered', 0,
      'east_sheltered', 0,
      'west_targets', '[]'::jsonb,
      'east_targets', '[]'::jsonb,
      'corridor_clear', false,
      'placed_a', 0,
      'placed_b', 0,
      'both_contribute', false,
      'errors', jsonb_build_array('invalid_pieces'),
      'failures', jsonb_build_array('invalid_layout')
    );
  end if;

  v_count := jsonb_array_length(p_pieces);

  -- Footprint validity and overlap. Only placed pieces participate.
  for v_i in 0..v_count - 1 loop
    v_piece := p_pieces -> v_i;
    if not coalesce((v_piece ->> 'placed')::boolean, false) then
      continue;
    end if;

    if v_piece ->> 'owner' = 'a' then
      v_placed_a := v_placed_a + 1;
    elsif v_piece ->> 'owner' = 'b' then
      v_placed_b := v_placed_b + 1;
    else
      v_valid := false;
      v_errors := array_append(v_errors, 'unknown_owner');
    end if;

    v_corners := public.break_waves_corners(
      (v_piece ->> 'x')::numeric,
      (v_piece ->> 'z')::numeric,
      (v_piece ->> 'rotation')::numeric
    );
    for v_corner in 0..3 loop
      if v_corners[v_corner * 2 + 1] < -0.44
        or v_corners[v_corner * 2 + 1] > 0.44
        or v_corners[v_corner * 2 + 2] < -0.08
        or v_corners[v_corner * 2 + 2] > 0.28 then
        v_valid := false;
        v_errors := array_append(v_errors, 'out_of_water');
      end if;
    end loop;

    if public.break_waves_rectangles_overlap(v_corners, v_corridor) then
      v_corridor_clear := false;
    end if;

    for v_j in (v_i + 1)..(v_count - 1) loop
      v_other := p_pieces -> v_j;
      if not coalesce((v_other ->> 'placed')::boolean, false) then
        continue;
      end if;
      v_other_corners := public.break_waves_corners(
        (v_other ->> 'x')::numeric,
        (v_other ->> 'z')::numeric,
        (v_other ->> 'rotation')::numeric
      );
      if public.break_waves_rectangles_overlap(v_corners, v_other_corners) then
        v_valid := false;
        v_errors := array_append(v_errors, 'piece_overlap');
      end if;
    end loop;
  end loop;

  if v_placed_a > 2 or v_placed_b > 2 then
    v_valid := false;
    v_errors := array_append(v_errors, 'too_many_pieces');
  end if;

  -- The seven west samples and their mirrored east samples.
  for v_i in 0..6 loop
    v_target_x := -0.38 + v_i * 0.04;
    v_west_sheltered := false;
    for v_j in 0..v_count - 1 loop
      if public.break_waves_piece_shelters(v_target_x, -0.20, p_pieces -> v_j) then
        v_west_sheltered := true;
        exit;
      end if;
    end loop;
    v_west_targets := array_append(v_west_targets, v_west_sheltered);
    if v_west_sheltered then
      v_west := v_west + 1;
    end if;

    v_target_x := 0.14 + v_i * 0.04;
    v_east_sheltered := false;
    for v_j in 0..v_count - 1 loop
      if public.break_waves_piece_shelters(v_target_x, -0.20, p_pieces -> v_j) then
        v_east_sheltered := true;
        exit;
      end if;
    end loop;
    v_east_targets := array_append(v_east_targets, v_east_sheltered);
    if v_east_sheltered then
      v_east := v_east + 1;
    end if;
  end loop;

  if not v_valid then
    v_failures := array_append(v_failures, 'invalid_layout');
  end if;
  if v_west < 7 then
    v_failures := array_append(v_failures, 'west_unprotected');
  end if;
  if v_east < 7 then
    v_failures := array_append(v_failures, 'east_unprotected');
  end if;
  if not v_corridor_clear then
    v_failures := array_append(v_failures, 'boat_route_blocked');
  end if;
  if v_placed_a = 0 or v_placed_b = 0 then
    v_failures := array_append(v_failures, 'both_players_needed');
  end if;

  v_passed := v_valid and v_west = 7 and v_east = 7 and v_corridor_clear
    and v_placed_a > 0 and v_placed_b > 0;

  return jsonb_build_object(
    'passed', v_passed,
    'valid', v_valid,
    'west_sheltered', v_west,
    'east_sheltered', v_east,
    'west_targets', to_jsonb(v_west_targets),
    'east_targets', to_jsonb(v_east_targets),
    'corridor_clear', v_corridor_clear,
    'placed_a', v_placed_a,
    'placed_b', v_placed_b,
    'both_contribute', v_placed_a > 0 and v_placed_b > 0,
    'errors', to_jsonb(v_errors),
    'failures', to_jsonb(v_failures)
  );
end;
$$;

-- Shared membership/ownership lock for every mutation. The session row is locked first, then the
-- progress row, so two phones act one after another. It returns the current row plus duplicate/stale
-- flags; callers must not write when either flag is true.
create function public.lock_break_waves(
  p_session_id uuid,
  p_action_id uuid,
  p_expected_revision integer
)
returns table (
  status text,
  current_stop integer,
  side text,
  revision integer,
  pieces jsonb,
  ready_a boolean,
  ready_b boolean,
  attempts integer,
  last_test_revision integer,
  last_test_layout jsonb,
  last_test_result jsonb,
  solved_revision integer,
  solved_at timestamptz,
  ack_a_at timestamptz,
  ack_b_at timestamptz,
  clue_unlocked_at timestamptz,
  opened_at timestamptz,
  duplicate boolean,
  stale boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.trail_sessions%rowtype;
  v_progress public.break_waves_progress%rowtype;
  v_match public.matches%rowtype;
  v_side text;
  v_duplicate boolean;
  v_stale boolean;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if p_action_id is null then
    raise exception 'Missing action' using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Missing revision' using errcode = '22023';
  end if;

  select s.* into v_session
  from public.trail_sessions s
  join public.trail_members m on m.session_id = s.id
  where s.id = p_session_id and m.user_id = v_user
  for update of s;
  if not found then
    raise exception 'Trail not found' using errcode = '42501';
  end if;
  if v_session.game_version <> 'hunt-v1' then
    raise exception 'This trail is not the hunt version' using errcode = '22023';
  end if;

  select * into v_progress
  from public.break_waves_progress
  where session_id = p_session_id
  for update;
  if not found then
    raise exception 'Stop not found' using errcode = '42501';
  end if;

  select * into v_match from public.matches where id = v_session.match_id;
  if v_user = v_match.participant_a then
    v_side := 'a';
  elsif v_user = v_match.participant_b then
    v_side := 'b';
  else
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.break_waves_actions a
    where a.session_id = p_session_id and a.action_id = p_action_id
  ) into v_duplicate;
  v_stale := v_progress.revision <> p_expected_revision;

  return query select
    v_session.status,
    v_session.current_stop,
    v_side,
    v_progress.revision,
    v_progress.pieces,
    v_progress.ready_a,
    v_progress.ready_b,
    v_progress.attempts,
    v_progress.last_test_revision,
    v_progress.last_test_layout,
    v_progress.last_test_result,
    v_progress.solved_revision,
    v_progress.solved_at,
    v_progress.ack_a_at,
    v_progress.ack_b_at,
    v_progress.clue_unlocked_at,
    v_progress.opened_at,
    v_duplicate,
    v_stale;
end;
$$;

-- The card has been scanned. This is idempotent and does not touch an already opened stop.
create function public.open_break_waves_stop(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.trail_sessions%rowtype;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select s.* into v_session
  from public.trail_sessions s
  join public.trail_members m on m.session_id = s.id
  where s.id = p_session_id and m.user_id = v_user
  for update of s;
  if not found then
    raise exception 'Trail not found' using errcode = '42501';
  end if;
  if v_session.game_version <> 'hunt-v1' then
    raise exception 'This trail is not the hunt version' using errcode = '22023';
  end if;
  if v_session.status <> 'active' or v_session.current_stop is distinct from 1 then
    return false;
  end if;

  insert into public.break_waves_progress (session_id) values (p_session_id)
  on conflict (session_id) do nothing;

  update public.break_waves_progress
  set opened_at = coalesce(opened_at, now())
  where session_id = p_session_id;

  return true;
end;
$$;

-- Saves the caller's readiness for the current revision. The second ready call runs exactly one test
-- under the shared lock, saves the tested layout/result and clears both ready flags. A duplicate action
-- id returns before any test or attempt increment.
create function public.set_break_waves_ready(
  p_session_id uuid,
  p_action_id uuid,
  p_expected_revision integer,
  p_ready boolean
)
returns table (revision integer, stale boolean, duplicate boolean, test_ran boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lock record;
  v_ready_a boolean;
  v_ready_b boolean;
  v_result jsonb;
  v_passed boolean;
  v_test_ran boolean := false;
  v_kind text := 'ready';
begin
  select * into v_lock
  from public.lock_break_waves(p_session_id, p_action_id, p_expected_revision);

  if v_lock.duplicate then
    return query select v_lock.revision, false, true, false;
    return;
  end if;
  if v_lock.stale then
    return query select v_lock.revision, true, false, false;
    return;
  end if;
  if v_lock.status <> 'active' or v_lock.current_stop is distinct from 1 then
    raise exception 'This stop is not open' using errcode = '22023';
  end if;
  if v_lock.opened_at is null then
    raise exception 'Scan the stop card first' using errcode = '22023';
  end if;
  if v_lock.solved_at is not null then
    raise exception 'This stop is already solved' using errcode = '22023';
  end if;
  if p_ready is null then
    raise exception 'Missing readiness' using errcode = '22023';
  end if;

  v_ready_a := case when v_lock.side = 'a' then p_ready else v_lock.ready_a end;
  v_ready_b := case when v_lock.side = 'b' then p_ready else v_lock.ready_b end;

  if v_ready_a and v_ready_b then
    v_result := public.break_waves_evaluate(v_lock.pieces);
    v_passed := coalesce((v_result ->> 'passed')::boolean, false);
    v_test_ran := true;
    v_kind := 'test';

    update public.break_waves_progress
    set ready_a = false,
        ready_b = false,
        attempts = attempts + 1,
        last_test_revision = v_lock.revision,
        last_test_layout = v_lock.pieces,
        last_test_result = v_result,
        last_test_action_id = p_action_id,
        solved_revision = case when v_passed then v_lock.revision else null end,
        solved_at = case when v_passed then now() else null end,
        ack_a_at = null,
        ack_b_at = null,
        clue_unlocked_at = null,
        updated_at = now()
    where session_id = p_session_id;
  else
    update public.break_waves_progress
    set ready_a = v_ready_a,
        ready_b = v_ready_b,
        updated_at = now()
    where session_id = p_session_id;
  end if;

  insert into public.break_waves_actions (session_id, action_id, kind, revision)
  values (p_session_id, p_action_id, v_kind, v_lock.revision);

  return query select v_lock.revision, false, false, v_test_ran;
end;
$$;

-- Places or moves a piece, or changes its rotation. The caller can only write their own two piece ids.
-- Coordinates snap to 0.01 and rotations to 15 degrees. Out-of-water and overlapping placements are
-- rejected before they become accepted state; obstructing the boat corridor is allowed.
create function public.edit_break_waves_piece(
  p_session_id uuid,
  p_action_id uuid,
  p_expected_revision integer,
  p_piece_id text,
  p_x numeric,
  p_z numeric,
  p_rotation integer
)
returns table (revision integer, stale boolean, duplicate boolean, changed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lock record;
  v_x numeric;
  v_z numeric;
  v_rotation integer;
  v_candidate jsonb;
  v_check jsonb;
  v_revision integer;
begin
  select * into v_lock
  from public.lock_break_waves(p_session_id, p_action_id, p_expected_revision);

  if v_lock.duplicate then
    return query select v_lock.revision, false, true, false;
    return;
  end if;
  if v_lock.stale then
    return query select v_lock.revision, true, false, false;
    return;
  end if;
  if v_lock.status <> 'active' or v_lock.current_stop is distinct from 1 then
    raise exception 'This stop is not open' using errcode = '22023';
  end if;
  if v_lock.opened_at is null then
    raise exception 'Scan the stop card first' using errcode = '22023';
  end if;
  if v_lock.solved_at is not null then
    raise exception 'This stop is already solved' using errcode = '22023';
  end if;
  if p_piece_id is null or p_piece_id not in (v_lock.side || '1', v_lock.side || '2') then
    raise exception 'That is not your piece' using errcode = '42501';
  end if;
  if p_x is null or p_z is null or p_rotation is null then
    raise exception 'Missing placement' using errcode = '22023';
  end if;
  if p_x::text in ('NaN', 'Infinity', '-Infinity') or p_z::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Invalid placement' using errcode = '22023';
  end if;

  v_x := round(p_x::numeric, 2);
  v_z := round(p_z::numeric, 2);
  v_rotation := ((round(p_rotation::numeric / 15)::integer * 15) % 180 + 180) % 180;

  select jsonb_agg(
    case
      when item ->> 'id' = p_piece_id then
        item || jsonb_build_object('placed', true, 'x', v_x, 'z', v_z, 'rotation', v_rotation)
      else item
    end
    order by position
  ) into v_candidate
  from jsonb_array_elements(v_lock.pieces) with ordinality as items(item, position);

  v_check := public.break_waves_evaluate(v_candidate);
  if jsonb_array_length(v_check -> 'errors') > 0 then
    raise exception 'That placement does not fit the water' using errcode = '22023';
  end if;

  update public.break_waves_progress as progress_row
  set pieces = v_candidate,
      revision = progress_row.revision + 1,
      ready_a = false,
      ready_b = false,
      updated_at = now()
  where progress_row.session_id = p_session_id
  returning progress_row.revision into v_revision;

  insert into public.break_waves_actions (session_id, action_id, kind, revision)
  values (p_session_id, p_action_id, 'edit', v_revision);

  return query select v_revision, false, false, true;
end;
$$;

-- Returns one of the caller's own pieces to the toolbox. A repeated action does not change newer state.
create function public.return_break_waves_piece(
  p_session_id uuid,
  p_action_id uuid,
  p_expected_revision integer,
  p_piece_id text
)
returns table (revision integer, stale boolean, duplicate boolean, changed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lock record;
  v_candidate jsonb;
  v_was_placed boolean;
  v_revision integer;
begin
  select * into v_lock
  from public.lock_break_waves(p_session_id, p_action_id, p_expected_revision);

  if v_lock.duplicate then
    return query select v_lock.revision, false, true, false;
    return;
  end if;
  if v_lock.stale then
    return query select v_lock.revision, true, false, false;
    return;
  end if;
  if v_lock.status <> 'active' or v_lock.current_stop is distinct from 1 then
    raise exception 'This stop is not open' using errcode = '22023';
  end if;
  if v_lock.opened_at is null then
    raise exception 'Scan the stop card first' using errcode = '22023';
  end if;
  if v_lock.solved_at is not null then
    raise exception 'This stop is already solved' using errcode = '22023';
  end if;
  if p_piece_id is null or p_piece_id not in (v_lock.side || '1', v_lock.side || '2') then
    raise exception 'That is not your piece' using errcode = '42501';
  end if;

  select coalesce((item ->> 'placed')::boolean, false) into v_was_placed
  from jsonb_array_elements(v_lock.pieces) as items(item)
  where item ->> 'id' = p_piece_id;
  if not found then
    raise exception 'Unknown piece' using errcode = '22023';
  end if;

  if v_was_placed then
    select jsonb_agg(
      case
        when item ->> 'id' = p_piece_id then item || '{"placed":false}'::jsonb
        else item
      end
      order by position
    ) into v_candidate
    from jsonb_array_elements(v_lock.pieces) with ordinality as items(item, position);

    update public.break_waves_progress as progress_row
    set pieces = v_candidate,
        revision = progress_row.revision + 1,
        ready_a = false,
        ready_b = false,
        updated_at = now()
    where progress_row.session_id = p_session_id
    returning progress_row.revision into v_revision;
  else
    v_revision := v_lock.revision;
  end if;

  insert into public.break_waves_actions (session_id, action_id, kind, revision)
  values (p_session_id, p_action_id, 'return', v_revision);

  return query select v_revision, false, false, v_was_placed;
end;
$$;

-- Both players acknowledge the same successful result revision. A stale result revision cannot progress
-- another result. The clue appears only after both acknowledgements, and the trail then pauses because
-- stop 2 is not built yet.
create function public.acknowledge_break_waves(
  p_session_id uuid,
  p_action_id uuid,
  p_result_revision integer
)
returns table (revision integer, stale boolean, duplicate boolean, accepted boolean, clue_unlocked boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lock record;
  v_acked_a boolean;
  v_acked_b boolean;
  v_clue boolean;
begin
  select * into v_lock
  from public.lock_break_waves(p_session_id, p_action_id, p_result_revision);

  if v_lock.duplicate then
    return query select v_lock.revision, false, true, false, v_lock.clue_unlocked_at is not null;
    return;
  end if;
  if v_lock.stale
    or v_lock.solved_at is null
    or v_lock.solved_revision is distinct from p_result_revision
    or v_lock.last_test_revision is distinct from p_result_revision then
    return query select v_lock.revision, true, false, false, v_lock.clue_unlocked_at is not null;
    return;
  end if;

  if v_lock.side = 'a' then
    update public.break_waves_progress
    set ack_a_at = coalesce(ack_a_at, now()), updated_at = now()
    where session_id = p_session_id;
  else
    update public.break_waves_progress
    set ack_b_at = coalesce(ack_b_at, now()), updated_at = now()
    where session_id = p_session_id;
  end if;

  select ack_a_at is not null, ack_b_at is not null
  into v_acked_a, v_acked_b
  from public.break_waves_progress
  where session_id = p_session_id;

  v_clue := v_acked_a and v_acked_b;
  if v_clue then
    update public.break_waves_progress
    set clue_unlocked_at = coalesce(clue_unlocked_at, now()), updated_at = now()
    where session_id = p_session_id;

    update public.trail_sessions
    set status = 'paused', current_stop = null
    where id = p_session_id and game_version = 'hunt-v1';
  end if;

  insert into public.break_waves_actions (session_id, action_id, kind, revision)
  values (p_session_id, p_action_id, 'ack', v_lock.revision);

  return query select v_lock.revision, false, false, true, v_clue;
end;
$$;

-- The lobby's existing ready function. New sessions are hunt-v1 and get a hunt progress row when they
-- start; existing legacy sessions keep their old start path and current_stop value. The one-active-trail
-- and one-session-per-match rules are unchanged.
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

  insert into public.trail_sessions (match_id, game_version)
  values (p_match_id, 'hunt-v1')
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
  update public.trail_sessions
  set status = 'active',
      started_at = now(),
      current_stop = case when game_version = 'hunt-v1' then 1 else current_stop end
  where id = v_session.id;

  if v_session.game_version = 'hunt-v1' then
    insert into public.break_waves_progress (session_id) values (v_session.id)
    on conflict (session_id) do nothing;
  end if;

  return query select true, false;
end;
$$;

-- The old problem-board functions only know how to write legacy progress. The trigger makes that
-- boundary explicit even if an old RPC or an old card route is pointed at a hunt session. New hunt
-- state lives in break_waves_progress and is never touched by the legacy functions.
create function public.stop_progress_legacy_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.trail_sessions
    where id = new.session_id and game_version = 'legacy'
  ) then
    raise exception 'This stop belongs to the legacy trail version' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger stop_progress_legacy_only
before insert or update on public.stop_progress
for each row execute function public.stop_progress_legacy_only();

revoke execute on function public.stop_progress_legacy_only() from public, anon, authenticated;

revoke execute on function public.break_waves_corners(numeric, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.break_waves_rectangles_overlap(numeric[], numeric[]) from public, anon, authenticated;
revoke execute on function public.break_waves_piece_shelters(numeric, numeric, jsonb) from public, anon, authenticated;
revoke execute on function public.break_waves_evaluate(jsonb) from public, anon, authenticated;
revoke execute on function public.lock_break_waves(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.open_break_waves_stop(uuid) from public, anon;
revoke execute on function public.set_break_waves_ready(uuid, uuid, integer, boolean) from public, anon;
revoke execute on function public.edit_break_waves_piece(uuid, uuid, integer, text, numeric, numeric, integer) from public, anon;
revoke execute on function public.return_break_waves_piece(uuid, uuid, integer, text) from public, anon;
revoke execute on function public.acknowledge_break_waves(uuid, uuid, integer) from public, anon;
revoke execute on function public.set_trail_ready(uuid, boolean) from public, anon;

grant execute on function public.open_break_waves_stop(uuid) to authenticated;
grant execute on function public.set_break_waves_ready(uuid, uuid, integer, boolean) to authenticated;
grant execute on function public.edit_break_waves_piece(uuid, uuid, integer, text, numeric, numeric, integer) to authenticated;
grant execute on function public.return_break_waves_piece(uuid, uuid, integer, text) to authenticated;
grant execute on function public.acknowledge_break_waves(uuid, uuid, integer) to authenticated;
grant execute on function public.set_trail_ready(uuid, boolean) to authenticated;

alter table public.break_waves_progress replica identity full;
alter publication supabase_realtime add table public.break_waves_progress;
