# Break the waves

Break the waves is stop 1 of the paired hunt. It is separate from the earlier standalone AR
experiment and from the legacy problem-board trail. Two matched players mark ready in the existing
lobby, scan the same printed card, enter marker AR on their own phones, place and rotate only their
own two breakwater pieces, and test the shared accepted layout. The database evaluates the layout.
Both players acknowledge the same successful revision to reveal the next clue. Higher ground is
shown as **not built yet**; no later stop is simulated or unlocked.

## Entry points and routes

| Path | Purpose |
| --- | --- |
| `/chats/:matchId/trail` | Existing lobby. Both ready starts a newly created hunt trail. |
| `/trail/:sessionId` | Routes `game_version = 'hunt-v1'` to the new stop; legacy rows stay on the old board/stop screens. |
| `/scan/break-the-waves` | Canonical hunt card link. It only opens stop 1 in the caller's active new-hunt trail. |
| `/scan/storm-waves` | Legacy stop 1 card. Its old behaviour is unchanged. |
| `/card.html` | Print helper. The card type selector keeps the standalone experiment as the default and adds a Break the waves hunt variant. |
| `/ar.html` | Standalone experiment, unchanged and still usable. |

Unknown or future QR names do not call a hunt mutation. The hunt scanner accepts only the exact
`/scan/break-the-waves` path. The legacy scan and in-app scanner do not accept the hunt card. The
reverse is refused too: a legacy card opened from a hunt trail shows a wrong-card message, and a
database trigger prevents the old problem-board functions from writing `stop_progress` for a hunt
session.

## Challenge rules

The model is an illustrative teaching model, not engineering advice. Breakwaters reduce wave
energy; they do not stop flooding from higher sea levels.

- Marker-local water is `x = -0.44..0.44`, `z = -0.08..0.28`. The coast front is at `z = -0.20`.
  Waves travel towards negative z.
- Each player owns two pieces, `A1/A2` or `B1/B2` by stable match participant. Each piece is
  `0.18` long and `0.03` wide. Centres snap to `0.01`; rotations snap to 15°.
- A piece's whole rotated footprint must fit the water. Accepted pieces may not overlap. Touching
  edges are allowed.
- The boat corridor is `|x| <= 0.075` across the water. A piece may be placed there for
  experimentation, but the layout cannot pass while the corridor is blocked.
- West target x positions are `-0.38, -0.34, -0.30, -0.26, -0.22, -0.18, -0.14`; east targets are
  mirrored as `0.14..0.38`. A target is sheltered when the upstream ray at that x meets a piece's
  long centreline. A piece rotated parallel to the wave direction has no useful horizontal span.
- All seven targets on both beaches must be sheltered. The boat corridor must be clear. The layout
  must be valid and both owners must have at least one accepted placed piece.
- One piece's maximum useful span is `0.18`, but each beach spans `0.24`, so a beach needs at least
  two pieces. One player's two pieces cannot solve both beaches.
- A verified passing example is horizontal pieces at `(-0.32, 0.22)`, `(-0.20, 0.14)`,
  `(0.32, 0.22)`, `(0.20, 0.14)`. Another passing example uses 15° rotations and changed positions.
  These are verification examples, not answer markers in the UI.

## Shared state and authority

The additive migration is
[`20261026170000_break_the_waves_hunt.sql`](../supabase/migrations/20261026170000_break_the_waves_hunt.sql).

- `trail_sessions.game_version` is `legacy` on every existing row. New sessions created by the
  lobby default to `hunt-v1`. No old row is deleted, migrated or silently converted.
- `break_waves_progress` is one row per trail session. It stores all four pieces, a layout revision,
  ready flags, test attempts, the tested layout/result and its revision, the solved revision,
  acknowledgements and the clue timestamp. Camera frames and poses are never stored.
- Every mutation locks the session and progress rows, checks membership and ownership, and writes
  through a `security definer` function with `search_path = ''`. Clients have only SELECT on the
  progress row; they cannot insert, update or delete it. `break_waves_actions` also has RLS enabled
  with no client policy and no grants, so the idempotency log stays database-only.
- Every mutating call takes an action UUID and expected layout revision. A repeated action is a
  no-op through `break_waves_actions`. A stale edit or ready call returns `stale` and changes
  nothing. Any accepted edit bumps the revision and clears both ready checks.
- The edit and return statements alias the progress table (`progress_row`) and qualify the revision
  column on both sides of the update. This avoids PostgreSQL's plpgsql output-variable conflict with
  the `RETURNS TABLE (revision ...)` output; no global `variable_conflict` override is used.
- The second ready call on a revision runs exactly one test under the shared lock. It saves
  `last_test_layout`, `last_test_result`, `last_test_revision` and `attempts`. The layout stays
  editable after a failure. A success locks the layout until both players acknowledge the same
  result revision; then the clue timestamp is set and the trail pauses because stop 2 is not built.
- Realtime is used only as a change signal. The client fetches `break_waves_progress` again on
  initial load, immediately after subscribe, on reconnect/foreground return, and after every RPC.
  A tagged request sequence prevents late responses or an unmounted component from overwriting
  newer state.
- The exported trail route keys the inner session page by `sessionId`. A route session change
  therefore unmounts the previous `useTrailSession`, `BreakWavesPage`, local action state and AR
  controller instead of reusing them. Async action handlers additionally check both mounted state
  and the captured session id before refreshing or writing UI state, and the mutating guard is reset
  with the session boundary. A delayed parent load or action refresh from the previous session cannot
  overwrite, clear or lock the new one; the old camera is released by the unmount cleanup.

## AR and UI

The app still uses the pinned local MindAR 1.2.5 and Three.js 0.160.0 files under
`public/ar/vendor/`, and the compiled `public/ar/targets/coastal-target.mind`. `index.html` now has
the import map those vendor modules need. No CDN or new engine is used.

- The QR scanner is unmounted before the AR controller starts. The AR controller owns the rear
  camera while it runs. Navigation, page hide, backgrounding, cancel and startup failure release
  the stream, MindAR worker/controller and renderer.
- Tracking loss disables construction and shows a recovery message. Saved construction is fetched
  from the database and is not lost when the camera stops.
- Both phones show the same marker-relative coast and all accepted pieces, coloured and labelled by
  owner. Player A can toggle a wave/risk lens; player B can toggle a seabed/boat-corridor lens. Both
  can inspect and build.
- The reliable baseline is: select one of your own piece cards, tap the water, then use Rotate 15°
  or Return. A tapped draft ghost and a "saving" note are unconfirmed; only the database-returned
  accepted revision is shown as placed.
- The animated water uses the same piece-centreline shelter geometry as the server result. After a
  test, the saved tested layout for that revision drives the wave field and target/boat feedback, so
  the animation cannot disagree with the stored result.
- The result sheet shows west/east target counts, boat-route status, the attempt number and the
  tested revision. It names the specific failure and preserves accepted pieces. Success shows the
  coastal takeaway. Both players press Continue to unlock the clue.
- The clue screen names Higher ground and says clearly that stop 2 is not built yet.

## Migration and legacy limitations

- The migration was verified in an isolated, disposable local PostgreSQL 17.11 container
  (`postgres:17-alpine`, image digest
  `sha256:3540c0362c809df084ffac0ae69fe794515f9de92692f02178bcdce0ef0302ac`) with `--network none`,
  no published ports, tmpfs PGDATA and local trust auth.
- The additive migration is now applied to the existing shared development Supabase project
  (`ukshfrnhqhvqmrmrqutd`) through the linked CLI. Migration history contains
  `20261026170000`, and a read-only hosted schema check showed one legacy trail session, no hunt
  sessions, no hunt progress rows, both new tables with RLS enabled, and
  `break_waves_progress` in the realtime publication. No reset, row deletion, fixture write, account
  creation or artificial completion was performed on the shared data. Existing legacy rows remain
  legacy. The same shared development backend intentionally serves both site versions; this is a
  development trade-off, not a production compatibility gate.
- Hosted JWT verification, PostgREST request handling, Realtime delivery and iPhone camera/marker
  behaviour are not proven by the local PostgreSQL role checks. A branch preview is produced from
  the `ar-scavenger-demo` branch only; `main` is not merged or changed.
- The local verification used a minimal auth/role shim, not production GoTrue: `anon` and
  `authenticated` roles, `auth.users(id)`, `auth.uid()` reading
  `request.jwt.claim.sub`, and the `supabase_realtime` publication. This proves PostgreSQL function,
  RLS, privilege and lock behaviour. It does not prove Supabase JWT verification, PostgREST request
  handling, Realtime delivery, or phone behaviour.
- Existing matched pairs already have a legacy `trail_sessions` row. They keep the old game and will
  not see the hunt. Testing the new stop requires a newly matched pair, or a separately approved
  migration/reset later. Do not silently delete their old rows or reuse their one-active-trail claim.
- A match has one trail session forever, so an old pair cannot create a hunt session without that
  approved reset/migration.
- The old `open_stop` RPC can return true when called on a hunt session whose `current_stop` is
  already 1, but it performs no write; the trigger refuses any legacy `stop_progress` insert on a
  hunt session and the buy/answer/ack legacy functions fail from the missing legacy row. The app's
  card and trail-version guards prevent that route from being used for progression.
- No debug bypass is shipped. Direct database helper calls are revoked from client roles.

## Verification run in this pass

Local, repository and browser checks (not paired acceptance):

| Command / check | Result |
| --- | --- |
| `npm run build` (`tsc -b && vite build`) | Exit 0 after the review corrections; type check and production build pass. |
| Challenge helper probes against `src/features/trail/breakWaves.ts` | Pass for failing one-sided layout, two genuinely different four-piece passing layouts, rotated vertical exposure, boat blockage, out-of-water, overlap and two-piece insufficiency. |
| `git diff --check` on authored files | See final work report; vendor files unchanged. |
| Chromium on `dist/` via `npm run preview` | Card variant, pinned import map, local vendor imports and phone-width layout checked. |
| Synthetic camera lifecycle smoke | Delayed `getUserMedia` cancel released the late track; two start/background cycles ended both tracks, removed video/canvas and removed 2 of 2 captured MindAR resize listeners. SPA navigation ended the live track. Synthetic camera, **not** a phone or paired acceptance. |
| Focused mocked route-lifecycle check | A delayed session-A parent load was superseded by a session-B legacy page and did not restore the A hunt page after 1.8 s. Starting the synthetic AR camera on A, then making the same in-app route change to B, left the B board visible and showed A's captured track as `ended` with no video/canvas left. Mocked REST/browser evidence, **not** real paired networking or RLS. |
| Mocked REST render of the hunt screen | Start, scanning, failure result, success result and not-built clue layouts checked at 390×844; start and live build layouts also checked at 320×568, with no horizontal overflow. **Not** an RLS, database, realtime or two-account pass. |
| Local PostgreSQL 17 migration and legacy preservation | **Pass.** Fresh PG 17.11 database; existing migrations through `160000` applied; realistic legacy active and lobby fixtures created with the old RPCs; `170000` applied with `ON_ERROR_STOP=1`. Existing session/member/progress JSON was unchanged apart from `game_version = 'legacy'`; row counts unchanged; new lobby sessions were `hunt-v1`. |
| Local PostgreSQL authoritative actions and geometry | **Pass.** Real authenticated-role calls exercised open, place/rotate/return, shared revisions, ownership denial, invalid/out-of-water/overlap/NaN/missing-input rejection, boat-blocking failure, horizontal pass, rotated pass, vertical exposure and two-piece insufficiency. |
| Local PostgreSQL RLS, privileges and publication | **Pass.** Progress and action-log RLS enabled; only member SELECT on progress; no client writes or action-log reads; new public RPC grants present; internal helper execute revoked; outsider read count 0; anon denied; `break_waves_progress` present in `supabase_realtime`. |
| Local PostgreSQL stale/idempotency/progression | **Pass.** Stale edit/ready/ack rejected; repeated action IDs did not duplicate revisions or attempts; failure preserved pieces/revision; exactly one saved test result per two-ready test; success locked the layout; one ack did not unlock; both acks paused and unlocked once; duplicate ack left the clue timestamp unchanged; reopen/legacy operations did not change completion. |
| Concurrent two-connection PostgreSQL checks | **Pass.** Two simultaneous ready calls produced one test/attempt; competing same-revision edits produced one accepted and one stale result; ready-versus-edit tested only the pre-edit revision; concurrent acknowledgements completed both sides and unlocked the clue once without deadlock. All used `statement_timeout`/`lock_timeout`. |
| Hosted shared migration application | **Pass.** `npx supabase migration list --linked` showed exactly `20261026170000` pending; `npx supabase db push --linked --dry-run` predicted exactly that one migration; `npx supabase db push --linked --yes --skip-vault` exited 0; a second migration-list check showed local = remote = `20261026170000`. A read-only hosted query showed one legacy session, zero hunt sessions, zero hunt progress rows, both new tables RLS-enabled and progress in `supabase_realtime`. |
| Hosted branch preview | Cloudflare Pages build for branch `ar-scavenger-demo` only; expected host `https://ar-scavenger-demo.sip-coastaldatingapp.pages.dev`. Deployment/entry/asset verification is recorded in the rollout return, not assumed here. |
| Supabase JWT/PostgREST/Realtime delivery | **NOT RUN.** The PostgreSQL checks used direct SQL role claims, not the hosted stack. |
| Real two-iPhone marker tracking and paired game | **NOT RUN**. |

Captured counters:

- Main hunt: revision `25`, attempts `7`; the final result revision was `25`, both acknowledgements
  landed, the clue timestamp was set once, and the session ended `paused` with `current_stop = null`.
- Rotated-pass hunt: revision `4`, attempts `1`; both concurrent acknowledgements completed and the
  clue was set once.
- Concurrent ready: one `test_ran = true`; attempts advanced `4 → 5` exactly once.
- Competing edits: one returned revision `20, stale = false`; the other returned revision `20,
  stale = true`; final state was revision `20`.
- Ready versus edit: the test ran at revision `20`; the accepted edit then made revision `21`, so
  `last_test_revision (20) < revision (21)`; the test did not observe the revised layout.
- Final database had `5` trail sessions, `10` members, `2` legacy `stop_progress` rows, `2` hunt
  progress rows and `50` idempotency actions. The preserved legacy active fixture still had its one
  progress row and attempts advanced only through its legacy RPC (`2`).

The temporary verification scripts themselves needed four assertion fixes:

1. The post-170 assertion mixed `jsonb_agg(...)` with an ungrouped `b.rows_json`; this produced
   `POST170_ASSERT_EXIT:3`. The assertion was rewritten with a scalar subquery and passed.
2. `check_fixture.expect_error` used `ILIKE` without substring wildcards, so a valid expected error
   did not match. Fixed to `%pattern%`; the database was recreated from the clean bootstrap and the
   affected checks rerun.
3. The placement script referenced `placed_a`/`placed_b` as progress columns; those counts exist
   only in the saved result JSON. The assertion was corrected to derive counts from `pieces`.
4. A continuation assertion referenced `pieces` without a progress-row scope. Fixed with a scalar
   subquery; no mutating statement had run before that failure.

Those were test-harness corrections; the migration/function execution did not expose an application
SQL defect. The remaining checks after the later assertion fixes were run from the then-current
committed fixture state.

### Hosted shared migration

Commands used against the existing linked development project (no credentials printed):

```bash
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked --yes --skip-vault
npx supabase migration list --linked
```

The dry run listed exactly `20261026170000_break_the_waves_hunt.sql`; the push applied that one
migration and exited 0; the final list shows it applied locally and remotely. No `db reset` or
hosted fixture write was run.

### Local PostgreSQL reproduction

The check scripts were temporary files under `%TEMP%/agents/break-waves-db-check/` and were removed
after capturing the results. The core command pattern was:

```bash
docker pull postgres:17-alpine
docker run -d --name sip-bw-dbcheck-20261106a --network none   --tmpfs /var/lib/postgresql/data:rw,noexec,nosuid,size=1g   -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=checkdb   postgres:17-alpine -c wal_level=logical

# Bootstrap the documented auth/role shim, then apply all historical migrations.
for f in supabase/migrations/20261026100000_profiles.sql          supabase/migrations/20261026110000_decisions_and_matches.sql          supabase/migrations/20261026120000_messages.sql          supabase/migrations/20261026130000_trail.sql          supabase/migrations/20261026140000_problem_board.sql          supabase/migrations/20261026150000_buy_and_build.sql          supabase/migrations/20261026160000_opener_is_investigator.sql; do
  docker exec -i sip-bw-dbcheck-20261106a     psql -U postgres -d checkdb -v ON_ERROR_STOP=1 -f - < "$f"
done

# Create legacy fixture rows with the old lobby/board RPCs, snapshot them,
# then apply the new migration:
docker exec -i sip-bw-dbcheck-20261106a   psql -U postgres -d checkdb -v ON_ERROR_STOP=1 -f -   < supabase/migrations/20261026170000_break_the_waves_hunt.sql
```

Authenticated checks used the real roles and a session-local claim:

```sql
begin;
select set_config('request.jwt.claim.sub', '<test-user-uuid>', true);
set local role authenticated;
-- call the stored function or read the RLS-protected table
reset role;
commit;
```

The local fixture used test UUIDs only. It did not use any hosted credentials, `.env.local`,
service-role key, linked project, real account or production data. No migration or reset was run
against a hosted/shared database.

Rebuild and preview commands:

```bash
npm run build
npm run preview -- --port 4173
```

Open `http://localhost:4173/card.html`, choose **Break the waves hunt · stop 1**, check the proposed
`/scan/break-the-waves` URL, and print. The standalone experiment stays the default card type.

## Manual two-iPhone acceptance checklist

Use two real iPhones on an approved HTTPS host, each signed into a different account in a **newly
matched pair**. Do not use an existing legacy pair for this test.

1. Both open the conversation, enter the trail lobby, and mark ready. Confirm both arrive at the
   Break the waves scan screen, not the old problem board.
2. Print the hunt card from the card page. Both scan it (phone camera or in-app scanner). Confirm
   each sees the stop and the same goal. Confirm the scanner camera closes before AR starts.
3. Tap **Start AR camera** on both. Allow the rear camera. Point at the printed illustration.
   Confirm real marker tracking on both phones, a visible coast above the bottom sheet, and at least
   44 px touch controls.
4. Confirm A sees the wave/risk lens and B sees the seabed/boat-corridor lens. Toggle each. Confirm
   both can still inspect and select only their own two piece cards.
5. Place one of A's pieces, then rotate it and move it. Confirm B sees the accepted piece, owner
   label and revision change. Repeat from B. Confirm tapping a piece does nothing while the card is
   lost, and returning to the card restores the saved layout.
6. Mark both ready with a deliberately one-sided or boat-blocking layout. Confirm exactly one
   authoritative result appears on both phones, with specific west/east/boat counts, and both ready
   checks are cleared. Confirm accepted pieces remain placed.
7. Change the layout after one phone marked ready. Confirm both ready checks clear and a stale ready
   or edit does not test the old revision.
8. Build a passing layout using both players' pieces. Mark both ready. Confirm the success result,
   the coastal takeaway and the tested revision agree on both phones. Confirm neither player can edit
   the locked successful layout.
9. Press Continue on one phone. Confirm the other still needs to continue and the clue does not
   appear yet. Press Continue on the second. Confirm both see the Higher ground clue and the clear
   **not built yet** note, with no third card or completion claim.
10. Lock a phone or switch apps during AR. Confirm the camera indicator turns off and the app shows
    the paused state. Return and start again; confirm the saved revision is still there. Navigate
    away and back; confirm no camera or worker remains active.
11. Third-account denial: with a third signed-in account that is not in the pair, open
    `/trail/<session-id>` and `/scan/break-the-waves`. Confirm neither loads the stop nor writes
    progress. With a legacy active account, scan the hunt card and confirm it is refused as the
    wrong trail version.
