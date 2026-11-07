# Break the waves

Break the waves is stop 1 of the paired hunt. It is separate from the earlier standalone AR
experiment and from the legacy problem-board trail. Two matched players mark ready in the existing
lobby, scan the same printed card, place the shared coast on a textured floor with world tracking on
their own phones, place and rotate only their own two breakwater pieces, and test the shared
accepted layout. The database evaluates the layout. Both players acknowledge the same successful
revision to reveal the next clue. Higher ground is shown as **not built yet**; no later stop is
simulated or unlocked.

## Entry points and routes

| Path | Purpose |
| --- | --- |
| `/chats/:matchId/trail` | Existing lobby. Both ready starts a newly created hunt trail. |
| `/trail/:sessionId` | Routes `game_version = 'hunt-v1'` to the new stop; legacy rows stay on the old board/stop screens. |
| `/scan/break-the-waves` | Canonical hunt card link. It only opens stop 1 in the caller's active new-hunt trail. |
| `/scan/storm-waves` | Legacy stop 1 card. Its old behaviour is unchanged. |
| `/card.html` | Print helper. The card type selector keeps the standalone experiment as the default and adds a Break the waves hunt variant. |
| `/ar.html` | Standalone experiment, unchanged and still usable. |
| `/diorama.html` | Standalone diorama preview. It is presentation-only and is not the paired stop or a debug route into it. |
| `/world.html` | Isolated world-tracking feasibility experiment. It shows the approved lighthouse island, places it by explicit tap on 8th Wall's estimated floor, and keeps local exposed/protected examples. It is not the paired stop and has no account, save, sync or progression. |

Unknown or future QR names do not call a hunt mutation. The hunt scanner accepts only the exact
`/scan/break-the-waves` path. The legacy scan and in-app scanner do not accept the hunt card. The
reverse is refused too: a legacy card opened from a hunt trail shows a wrong-card message, and a
database trigger prevents the old problem-board functions from writing `stop_progress` for a hunt
session.

Entry is local to each phone. A successful in-app scan or canonical `/scan/break-the-waves` link
calls `open_break_waves_stop` and grants entry only to that page view; the external link passes a
one-shot router-state receipt bound to the session id. Shared `opened_at` alone, a direct trail
visit or a reload always shows the scan/testing choice. The separate **Place without QR (testing)**
button calls the same active-stop/ownership RPC, marks only this phone's entry as testing and resets
no layout, result, readiness or progression. Neither path starts the camera; **Start camera** remains
a separate explicit action.

## Challenge rules

The model is an illustrative teaching model, not engineering advice. Breakwaters reduce wave
energy; they do not stop flooding from higher sea levels.

- Scene-local water is `x = -0.44..0.44`, `z = -0.08..0.28`. The coast front is at `z = -0.20`.
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

The paired stop now uses the local vendored 8th Wall 1.0.0 engine and Three.js 0.160 module through
`src/features/trail/breakWavesWorldAr.ts`. It does not use MindAR or `coastal-target.mind`. The
earlier standalone experiment (`/ar.html`), diorama and card helper still use the pinned local
MindAR 1.2.5 and Three.js 0.160.0 files under `public/ar/vendor/`, plus the compiled
`public/ar/targets/coastal-target.mind`; those assets and the import map are unchanged. No CDN or
additional engine is used by the paired page.

- Entry is gated per page. A direct trail visit, reload or previous shared `opened_at` does not
  authorise this phone; it must scan the card or use the separate testing entry. The external card
  route passes its one-shot receipt only after `open_break_waves_stop` succeeds, and the page
  compares the receipt's session id before consuming it. The testing button uses the same RPC as a
  real scan (so active-stop and ownership checks still apply) but is tracked as an explicit testing
  bypass, not a successful scan. A failed RPC, a closed scanner or a stale session response does not
  grant entry.
- The QR scanner is not the AR camera. Before the page opens the scanner it stops and releases the
  world-tracking controller; the scanner unmounts and releases its own tracks before Start is
  available again. The controller owns the rear camera while it runs. Navigation, page hide,
  backgrounding, Stop, cancel and startup failure release the stream, scene and engine session.
- Tracking loss hides the coast, disables construction and shows a recovery message. Saved
  construction is fetched from the database and is not lost when the camera stops. Normal tracking
  recovery deliberately restores the same valid anchor, yaw and accepted pieces; it does **not**
  require a fresh placement. The page offers Re-place and Stop while tracking is limited; Re-place
  clears only the local anchor and ghost, and a fresh placement is required only after that explicit
  local reset, Stop/restart or a new session.
- Both phones show the same shared lighthouse-island diorama on the estimated floor: the
  lighthouse, coast, surf, boats and breakwater rock ridges. The shared model is scaled by
  `1 / PUZZLE_SCALE` (1/2.7) so puzzle coordinates stay the scene's local coordinates; the caller's
  floor anchor then owns translation, yaw, physical scale and floor lift. Puzzle coordinates,
  pointer-to-local conversion and saved layouts are unchanged.
- `createBreakWavesScene` keeps `registration: 'marker'` for the standalone marker experiment and
  uses the opt-in `registration: 'floor'` mode for the paired page. Floor registration leaves the
  logical scene root at unit scale with zero rotation. A parent scale of `0.24 × PUZZLE_SCALE`
  therefore produces the accepted 0.24 model scale through the same single inverse
  `PUZZLE_SCALE` model transform. `setView` remains a marker presentation tilt and cannot pitch a
  floor-registered scene. Three.js light positions follow the parent transform, but point-light
  distance and directional-shadow camera extent are world-space values; the floor mode updates
  those (and the shadow normal bias) from the parent's uniform world scale so lighting and shadow
  coverage follow live size changes.
- `src/features/trail/breakWavesWorldAr.ts` is the paired page's live world-tracking controller.
  The controller prepares the local Three.js/8th Wall SDK without requesting the camera, caches the
  real `xrloaded` readiness across controller and route replacement, and calls `XR8.run()`
  synchronously from Start. Unsupported desktop devices show an unavailable state without opening
  the camera. Its state callback reports `preparing`, `ready`, `starting`, `placing`, `tracking`,
  `tracking-lost`, `paused`, `stopped`, `denied`, `unavailable` or `failed`, with `canStart`,
  `reloadRequired`, `message` and `sizePercent`; only `tracking` (normal tracking plus placement) is
  playable. It queues pieces, wave layout, selection, ghost, lens and evaluation on creation and on
  updates. The game scene is interactive only after normal tracking and a successful floor
  placement. That placement tap is consumed in capture phase so the same tap cannot also select or
  build. Size keeps the anchor X/Z, yaw and floor lift, and a completed stop can restart with the
  size retained but needs fresh placement. A completed stop applies the accepted 450 ms shared SDK
  settle guard before Start is enabled again; the guard is page-global so a replacement controller
  waits too, while the timer never clears the permanent reload gate for an interrupted startup.
  Startup interrupted before `onStart` requires a page reload, and that gate plus the SDK-ready cache
  survives controller replacement. The controller adds no sample Exposed/Protected state and no
  independent render loop; the 8th Wall Three.js pipeline owns drawing, projection and camera
  cropping.
- The paired page mounts that controller once for the active side/stop and session id. Ordinary
  partner, piece, result, lens and pending-action updates are queued into the live controller, not
  used to recreate it. A clue/session transition disposes it, and opening the QR scanner first stops
  the AR session. Edit and Ready handlers also check the live controller phase, so a same-event
  tracking loss or Re-place cannot let React's older phase permit a mutation.
- The page replaces marker view controls with a native **Island size** slider (50–200% in 5% steps,
  with a percentage output) and **Re-place coast**. Both are local presentation/placement controls:
  they make no RPC, do not reload, and do not change accepted pieces, readiness or the saved
  revision. Size is retained across Stop/Start; a new controller or page starts at 100%. Re-place
  clears the local anchor and any draft ghost only. The phone's motion supplies perspective; there
  is no Oblique/Top fixed-view mode in the paired page.
- The camera UI shows engine preparation (Start disabled), an explicit Start when prepared,
  Cancel start/Stop camera, floor-placement instructions before the coast is placed, tracking-loss
  recovery, and denied/unavailable/failed diagnostics. Reload is surfaced whenever the controller
  requires it. Start is shown only after this phone has scanned or chosen the testing entry. While a
  saved result is on screen, the result keeps local camera controls and the 8th Wall attribution
  visible, but the same entry gate replaces Start until this phone enters; the result and both
  players' acknowledgement remain available. When already tracking it shows compact Stop/Re-place/
  size controls; when not tracking it shows the appropriate Start/Reload/recovery controls. The
  tracking-limited recovery card also keeps the attribution/licence available. Acknowledging a
  successful result remains available with the camera off.
- The tracking build sheet is height-bounded on portrait phones so the authoritative water,
  targets and placed pieces remain above it at 390×844 and 320×568. In short landscape the build,
  placement and result sheets become a bounded, scrollable right-side dock; the camera/puzzle
  region on the left stays unobscured instead of being reduced to a thin strip. The build sheet
  keeps its ~43dvh default framing and adds a 44 px pull handle above the lens. While a pointer is
  held, the sheet height follows the pointer one-to-one inside the collapsed/expanded bounds, with
  its height transition disabled, so the top and handle move before pointerup. A full down-drag
  clamps to the handle plus bottom safe-area strip only: the controls body is hidden, `inert` and
  `aria-hidden`, not left partly visible. A full up-drag clamps at 82dvh on portrait or below the
  header in the short-landscape dock. Releasing settles to the nearest current/collapsed/expanded
  snap from the live height, so one long gesture can cross the whole range. The handle stays
  outside the scrolling body and remains reachable after the controls scroll. Tapping the handle,
  Enter/Space or ArrowUp/ArrowDown gives a non-drag alternative; `aria-expanded`, `aria-controls`
  and a state-dependent accessible label describe it. Pointer capture, handle-only `touch-action`,
  cancellation, lost-capture and resize recovery, and trailing-click suppression keep the drag from
  becoming a puzzle tap. Moving or resizing the sheet is local UI only: it makes no RPC and changes
  no revision, readiness, island size or saved anchor.
- The app stores no camera frames or poses and adds no recording, upload or analytics service of
  its own. The local 8th Wall engine processes camera frames for tracking. Its post-camera network
  behaviour has **not** been verified, so the paired page makes no zero-telemetry or no-transfer
  claim. A real phone/network check is still required. The visible attribution links to the local,
  unmodified 8th Wall `LICENSE` and states that the engine is proprietary, provided AS IS, without
  warranties and without endorsement. This is not a legal-compliance conclusion.
- Scene breakwaters are rock ridges kept inside the exact authoritative piece footprint. Accepted
  pieces use quieter owner-tinted accents and a selected-piece outline rather than text labels in
  the scene. The piece cards, owner swatches and sheet text still identify `A1`, `A2`, `B1` and `B2`
  explicitly. There are no large circles or owner labels around scene pieces.
- Player A can toggle a wave/risk lens; player B can toggle a seabed/boat-corridor lens. The seabed
  lens shows the exact buildable-water rectangle and a distinct central boat corridor, so the
  buildable area is not confused with the larger decorative sea. Both can inspect and build.
- The reliable baseline is: place the coast on the floor with the first tap, then select one of
  your own piece cards, tap the water, then use Rotate 15° or Return. A tapped draft ghost and a
  "saving" note are unconfirmed; only the database-returned accepted revision is shown as placed.
  Island size and Re-place never count as puzzle edits.
- The animated water uses the same piece-centreline shelter geometry as the server result. After a
  test, the saved tested layout for that revision drives the wave field and target/boat feedback, so
  the animation cannot disagree with the stored result.
- The result sheet shows west/east target counts, boat-route status, the attempt number and the
  tested revision. It names the specific failure and preserves accepted pieces. Success shows the
  coastal takeaway. Both players press Continue to unlock the clue.
- The clue screen names Higher ground and says clearly that stop 2 is not built yet.

### Historical marker tracking-stability experiment

The paired page no longer mounts MindAR, so this is no longer the live hunt path. It is retained as
a record of the previous marker controller experiment: the paired hunt temporarily set MindAR's
`filterBeta` to `10` instead of the pinned default `1000`, while the minimum cutoff (`0.001`) and
warmup/miss tolerances remained unchanged. It tuned the pose filter only and did not freeze the
miniature, change the camera or keep construction enabled after tracking loss. The standalone
experiment remains unchanged and does not use this paired-page setting.

This was never a proven jitter fix. Do not infer current world-tracking quality from that filter
output. Marker jitter/lag and close-view clipping were separate historical issues and are not part
of the paired world-tracking acceptance.

## World-tracking feasibility experiment

`/world.html` is a separate feasibility experiment, not a migration of the paired game. The paired
stop now uses the related `BreakWavesWorldAr` controller, but `/world.html` remains isolated. It is
not linked from the hunt card, does not use MindAR or `coastal-target.mind`, and does not call the
app, Supabase or the backend. The approved lighthouse-island model comes from
`createLighthouseDiorama` in `src/diorama/dioramaModel.ts`; the page owns only the AR lifecycle,
floor placement, status UI and local example state. There is no account, save, sync, page-level
analytics call, real puzzle progression or authoritative layout write.

Placement uses 8th Wall's single dynamically estimated floor plane (`Y = 0`). It is **not** ARKit
or ARCore tabletop surface detection. 8th Wall's world-tracking troubleshooting page says the
engine continuously recalculates one horizontal plane and that multiple horizontal surfaces in
view, such as a table and floor together, can confuse tracking. Start on a textured floor; a table
is exploratory only and is not guaranteed. The experiment is opened directly by URL or OS QR
launcher, so the printed card can stay out of view. There is no target file or recognition of the
card illustration.

The page loads the local Three.js 0.160 module first, assigns `window.THREE`, then loads the local
vendored `xr.js` with `data-preload-chunks="slam"`. GlTextureRenderer, Threejs, XrController and
the page module are installed in that order. The island root stays horizontal in the scene. The
engine drives a real perspective camera; the page sets only an initial floor-facing pose to
establish the tracking origin. On a valid tap the island is placed once on the estimated floor and
yawed once so its seaward `+Z` side faces the camera. Later phone motion changes the real
perspective; there is no fixed camera, orbit, artificial model tilt or per-frame camera-facing
transform. The Island size slider changes the model live from 50% to 200% in 5% steps. The smaller
default is 100%, a responsive-tracker scale of 0.24, half the preceding enlarged trial. It changes
only model size and the corresponding floor offset, light rig and shadow coverage. Anchor X/Z,
facing direction, tracked camera and example state do not change. The selection survives Stop and
Start on this page, and a page reload restores 100%. The percentage is relative size, not metres.
Step back or reduce the slider if the island does not fit the camera view.

Lifecycle and UX:

- The camera starts only from the explicit **Start AR** button. Engine and Three load while the
  page is idle without requesting camera permission; the idle canvas stays hidden. Engine readiness
  is exclusively the documented `xrloaded` event (registered before the local `xr.js` is inserted).
  A script load or an existing `window.XR8` global is not treated as ready, because the preloaded
  SLAM chunk may still be loading.
- The canvas fills the app's dynamic-height viewport even when Three.js writes inline pixel sizes.
  Before `XR8.run()` and on startup/size callbacks, its drawing-buffer width and height are set from
  the app's CSS dimensions times device pixel ratio. A ResizeObserver handles rotation and browser
  toolbar height changes while active, and disconnects on page hide. XR8 retains ownership of
  camera-feed cropping and tracked projection. This fixes the default 300×150 canvas rectangle,
  rather than trying to compensate by enlarging the island again.
- `XrController.pipelineModule()` publishes `camera`, `deviceorientation` and `devicemotion` as
  required permissions. `XR8.run()` is called synchronously in the Start gesture so the engine's
  permission framework can request them. The page does not add a second
  `DeviceOrientationEvent`/`DeviceMotionEvent` request. `disableWorldTracking` is explicitly
  `false`, the rear camera is requested, and `allowedDevices` is `MOBILE` (no `ANY` bypass).
- Statuses distinguish preparing, starting, ready to place, placed, tracking limited and stopped or
  error. Tracking limited and initialising hide the island and disable placement instead of
  freezing a successful-looking pose. Recovery shows the same anchor again. Normal tracking is not
  a stability guarantee.
- **Re-place** clears the old anchor and needs a fresh tap; it does not call
  `XR8.XrController.recenter()` automatically. Stop, page hide and background/visibility release
  the camera and scene. After a completed running session, Start can begin a fresh session and
  requires a fresh placement. Cancelling a startup, a camera/engine failure reported before
  `onStart`, or a rejected `XR8.run()` before `onStart` requires an explicit page reload before
  another Start. Once `onStart` has fired, failures can retry with Start or reload. The 450 ms UI
  settle is not restart synchronization.
- Stale `onStart`/run completions and stale `onUpdate`/status/exception callbacks cannot stop,
  clear, tear down or change the UI of a newer generation. A delayed start abandoned before
  `onStart` is released and reload-gated, so a retry cannot overlap the old run. Repeated starts
  after a completed session clear the previous modules first. Load failure always offers reload;
  failures after `onStart` can retry with Start or reload.
- The exposed/protected buttons are illustrative local examples only. Protected uses the proven
  local pieces at `(-0.32, 0.22)`, `(-0.20, 0.14)`, `(0.32, 0.22)`, `(0.20, 0.14)` with owners
  `a1`, `a2`, `b1`, `b2` and rotation `0`; exposed uses no pieces. Switching them does not move the
  island or save anything.
- This page stores no camera frames or poses. The pre-camera loader was observed using same-origin
  files only. Post-camera engine network behaviour has **not** been verified, so the page does not
  claim zero telemetry or no camera transfer. The engine is provided by Niantic Spatial under the
  proprietary XR Engine License Agreement, not the MIT engine package. Visible attribution links to
  the local unmodified `LICENSE` and says it is provided AS IS, without warranties and without
  endorsement. This is not a legal-compliance conclusion.

### Two-iPhone acceptance checklist

Record the actual devices before testing. Fill in the table on each phone. This checklist has not
been run yet; the desktop fallback and synthetic lifecycle checks below are not phone evidence.

| Phone | Model | iOS version | Safari version |
| --- | --- | --- | --- |
| A |  |  |  |
| B |  |  |  |

Open `/world.html` directly on the branch preview host or from an OS QR launcher URL. Do not use
the hunt card. Use the same branch build on both phones. This pass did not commit, push or deploy,
so publish the branch through the normal owner process before phone testing; the expected
branch-preview path is `/world.html` on the existing preview host.

1. [ ] Keep the printed card out of view. Stand over a textured floor with cracks, gravel, grass
   or a patterned rug; keep tables and other horizontal surfaces out of view. Confirm no camera
   prompt appears before pressing Start AR.
2. [ ] Press **Start AR** and allow camera access plus Motion & Orientation Access (and any second
   motion prompt the engine shows). Confirm there is no uncaught error and the status moves through
   starting to ready.
3. [ ] Move the phone slowly. Confirm the island is hidden while tracking is limited or
   initialising, and appears only after **Ready to place**.
4. [ ] Tap a floor patch in the visible camera area above the controls. Confirm the island sits on
   the estimated floor, its seaward side faces the phone, and it does not follow the camera.
   Sidestep slowly, then walk around the island for 60 s. Note jitter, drift, loss/recovery and
   whether recovery reuses the same anchor.
5. [ ] Move Island size through 50%, 100% and 200%. Confirm size updates immediately, the island
   stays on the floor at the same location and facing, and tracking does not restart. Switch Exposed
   and Protected and confirm the selected size stays unchanged. Stop and Start should keep the size
   selection but require fresh placement. Reload should restore the smaller 100% default.
6. [ ] Press **Re-place**. Confirm the old anchor disappears, the next tap sets a new one, and the
   page says recalibration may be needed. Do not expect an automatic recenter.
7. [ ] Background the browser or press **Stop camera**. Confirm the camera indicator stops and the
   page asks for Start AR again. Return, Start AR, and confirm a fresh placement is required with
   no duplicate camera loop, canvas or scene.
8. [ ] Deny camera once (or reset Safari camera permission). Confirm a helpful error, no uncaught
   exception, and that the page follows its retry/reload instruction. Startup cancellation,
   `XR8.run` rejection before `onStart`, and camera failure before `onStart` are reload-gated;
   failures after `onStart` can retry with Start or Reload. If motion/orientation is denied, record
   the engine's message and whether a reload + Start recovers.
9. [ ] Repeat placement on a table as exploratory only. Record whether tracking is lost or
   confused. Do not treat table placement as guaranteed.
10. [ ] If Safari Web Inspector is available on either phone, record the hosts and requests observed
    after Start AR and camera use. Report them separately from the pre-camera same-origin loader
    observation; do not infer zero telemetry from the idle check.

### Experiment checks in this pass

The real desktop rows below were recorded before the loader/lifecycle correction. Per the planner's
instruction they were not rerun; the correction pass reran only the affected loader-readiness and
lifecycle probes.

| Check | Result |
| --- | --- |
| `npm run build` (`tsc -b && vite build`) | Exit 0 with `world.html` as an additional production entry; the Vite chunk-size warning is existing and non-fatal. |
| `git diff --check` | Exit 0. Existing prerequisite vendor changes remain untouched by this experiment. |
| Real Chromium 155 headless on the built `dist/` entry at 390×844 and 320×568 | Idle page made no camera request (`getUserMedia` calls 0, camera permission `prompt`, no video); canvas hidden; Start, state buttons, visible licence link and layout were accessible; no horizontal overflow. All observed requests used `localhost`: page/CSS/JS, Three r160, `xr.js`, `xr-slam.js`, all HTTP 200. |
| Unsupported desktop **Start AR** | Showed the unsupported OS/browser fallback, made 0 `getUserMedia` calls, left camera permission `prompt`, and raised no page exception. `XR8.XrDevice.isDeviceBrowserCompatible({allowedDevices: MOBILE})` returned false with reasons `[1, 2]`. |
| Built-page engine load failure | A blocked `xr.js` showed the local-engine error and a visible reload action; no uncaught page error. The browser still logged the failed resource request. |
| Public permission declarations (pre-camera) | Adding the same pipeline modules exposed `camera`, `deviceorientation` and `devicemotion` via `XR8.requiredPermissions()` on the desktop host. This is permission declaration evidence, not proof that iOS prompts or SLAM works. |
| Simulated loader readiness (clearly labelled simulated) | With a fake `XR8` global present before a delayed `xrloaded`, the page stayed in `loading` with Start disabled until the event, then became idle/enabled. With the event never delivered (engine timeout shortened to 600 ms for the probe), it stayed loading until the timeout, then showed the SLAM-readiness error, kept Start disabled and exposed Reload. Real Three r160/page; readiness timing simulated. |
| Synthetic fake-XR8 lifecycle (clearly labelled synthetic) | Earlier placement/yaw/anchor/recovery/exposed/re-place checks remain as recorded. The correction probe additionally verified normal stop→new start; stale old `onStart`, `onException` and camera-failed callbacks plus a delayed old run completion leave the new camera/scene/status/modules intact; cancelling a delayed start, `XR8.run` rejection before `onStart`, or camera failure before `onStart` requires reload; retry cannot start before reload; cancelled attempts do not reopen the camera. Fake-engine evidence only. |
| Focused `XR8.run` rejection before `onStart` (clearly labelled synthetic) | A fake `XR8.run` rejection before `onStart` produced the camera-open error, Start disabled, Reload visible, one rejected run and no retry run; late old `onStart`/`onException`/camera-failed callbacks did not resurrect UI, camera, modules or scene. This does not prove the real engine cancels hardware camera acquisition or release. |

Known limits from this pass: actual iPhone world tracking, r160 camera-loop rendering, phone
performance/stability, iOS permission prompts, two-phone repeatability, Safari network calls after
camera start and any privacy/clipboard/telemetry behaviour remain unverified until the checklist is
run. The loader-readiness and lifecycle probes use simulated timing/fake-engine callbacks; they do
not prove real `xrloaded`/SLAM timing or iOS permission behaviour. The run-rejection probe does not
prove the real engine cancels hardware camera acquisition or releases the iPhone camera; retain
the phone camera-release check as unverified. The desktop host is incompatible
and never requested a camera; its failure is not r160 camera-loop evidence. The latest official
8th Wall example uses r183.2; this experiment intentionally stays on the repository's r160 module
for the approved island and does not upgrade.

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
- Hosted JWT verification, PostgREST request handling, Realtime delivery and iPhone camera/world-
  tracking behaviour are not proven by the local PostgreSQL role checks. A branch preview is produced from
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
| `npm run build` (`tsc -b && vite build`) | Exit 0 after the review corrections; type check and production build pass. This was rerun for the view integration and exited 0. |
| Challenge helper probes against `src/features/trail/breakWaves.ts` | Pass for failing one-sided layout, two genuinely different four-piece passing layouts, rotated vertical exposure, boat blockage, out-of-water, overlap and two-piece insufficiency. |
| `git diff --check` on authored files | Exit 0, including the view integration and docs updates. Vendor files unchanged. |
| Chromium on `dist/` via `npm run preview` | Card variant, pinned import map, local vendor imports and phone-width layout checked. |
| Focused controller view queuing/restart check (historical marker page) | **12/12 pass.** Production `BreakWavesAr` and `BreakWavesScene` with a test-only MindAR vendor and synthetic fixed camera/anchor. Top set before first scene creation applied immediately; tracking loss/recovery kept it; pause disposed the anchor scene while retaining the queued view; restarts reapplied Oblique/Top and restored all four saved pieces and the wave lens; no console/page errors. Mocked camera, not phone evidence. |
| Full-page integrated view and framing check (historical marker page) | **20/20 pass.** This recorded the previous marker page before the W3 world-tracking switch. Production React page, controller and scene at 390×844 and 320×568 in both views, with mocked REST/auth and a fixed test camera at anchor +Z 4.5, FOV 50. Oblique was the default; Top/Oblique toggled the world pitch, made zero RPC calls and left readiness/revision unchanged; tracking-lost disabled Rotate/Return but kept the view control safe; restart and ordinary state refresh kept Top; an SPA session change reset to Oblique; no horizontal overflow or console errors. All 14 target positions (28 marker/backing meshes), all four placed pieces and a 5×5 sample of the authoritative water rectangle were inside the canvas and unblocked by UI at both sizes. |
| World-tracking paired page integration (W3) | **87/87 synthetic checks pass.** Actual production `BreakWavesPage`, `BreakWavesWorldAr`, W1 floor scene and real vendored Three.js in Chromium, with mocked existing auth/match/backend records and a fake 8th Wall engine; no real data mutation. Checked QR-open/scanner release and no auto-start, preparing/Start, placing, placed, tracking-lost/paused/stopped, reload-gated cancel, unavailable/denied/failed diagnostics, saved pieces/lens/result recovery, zero RPCs for initial placement, size and Re-place, unchanged edit/Ready payloads and revision/readiness, successful acknowledgement with the camera off, UI taps not becoming puzzle taps, and 390×844, 320×568 and 844×390 layouts with screenshots. This is not real-camera, iPhone, two-phone or post-camera network evidence. |
| W3 review correction: result controls, lost attribution, usable framing | **59/59 focused synthetic checks pass.** Actual page/controller/W1 scene and real Three r160 with fake engine and mocked records. Verified compact Stop/Re-place/size and attribution inside both failed and passed results while tracking, recovery/attribution with the camera off, attribution on the tracking-limited card, single visible size-slider id, zero RPC/revision changes from result local controls, ordinary tracking-loss recovery reusing the same anchor without a fresh placement, and a real unobscured left camera region in the short-landscape side dock. Geometry projections plus tracked screenshots at 100% and a practical floor placement kept the water rectangle, all 14 target points, four saved pieces and lighthouse visible/unblocked at 390×844, 320×568 and 844×390. The screenshot fixture used the accepted initial floor-facing camera pose with a practical farther floor placement, not a forced camera/orbit/puzzle transform; a canvas-frame capture workaround handled headless WebGL compositing. This is not phone tracking. |
| Build-sheet live drag and handle-only collapse | **152/152 synthetic checks pass.** Actual production `dist/` in Chromium 155.0.8059.12 (Playwright) with mocked Supabase REST/auth, a fake 8th Wall engine, real vendored Three.js and live pointer/touch input. Both the canonical card entry and the testing entry reached Start without auto-start, then required an explicit Start, a floor tap and only then showed the build sheet. At 390×844, 320×568 and 844×390, mouse and touch movement was measured while the pointer was still held: multiple intermediate height/top readings moved 1:1 in both directions with `transition: none`, full-range drags clamped at the handle-only and expanded bounds in one gesture, and release settled to the nearest snap. The collapsed 44px-plus-safe-area strip hid the body from layout, focus and assistive technology; drag/tap/Enter/Space/ArrowUp/ArrowDown reopened it. Pointer capture outside the handle, small/cancelled drags, real lost capture, resize during a held drag, body scrolling with a reachable handle and trailing-click suppression were checked. Sheet motion made zero RPCs, leaked no canvas taps, did not restart the scene/controller and left revision, readiness, island size and anchor unchanged; lens, piece cards and slider still worked. Screenshots `01`–`05` per viewport and raw logs/results are in `%TEMP%/agents/break-waves-sheet-live/`. This is synthetic browser evidence, not iPhone/touch-hardware or real-camera tracking. |
| QR-first page-local entry correction | **89/89 synthetic checks pass.** Production `dist/` in Chromium 155.0.8059.12 (Playwright) at 390×844 with mocked Supabase REST/auth, a fake 8th Wall engine and synthetic canvas-camera QR frames. Direct unopened and already-open trails, plus a partner `opened_at` resync, kept Start and AR off; a saved passing result stayed visible and acknowledgeable with Start gated, including after reload. The canonical external link and in-app correct QR each used only `open_break_waves_stop`, granted entry after the explicit action and still required a separate Start click. Wrong QR, a closed scanner with a pending RPC, failed external/scanner RPC, test-button failure and a stale session-A RPC after switching to session B granted nothing. Test-button retry/success worked without a data reset; scanner tracks ended before Start; zero unrelated puzzle RPCs were called. Raw run: `%TEMP%/agents/break-waves-qr-entry/` (`check-entry-preview.log`, `results.json`, screenshots). This is not an iPhone, real camera or real printed-card scan. |
| Synthetic camera lifecycle smoke (historical marker page) | Delayed `getUserMedia` cancel released the late track; two start/background cycles ended both tracks, removed video/canvas and removed 2 of 2 captured MindAR resize listeners. SPA navigation ended the live track. Synthetic camera, **not** a phone or paired acceptance. |
| Focused mocked route-lifecycle check | A delayed session-A parent load was superseded by a session-B legacy page and did not restore the A hunt page after 1.8 s. Starting the synthetic AR camera on A, then making the same in-app route change to B, left the B board visible and showed A's captured track as `ended` with no video/canvas left. Mocked REST/browser evidence, **not** real paired networking or RLS. |
| Mocked REST render of the hunt screen | Start, scanning, failure result, success result and not-built clue layouts checked at 390×844; start and live build layouts also checked at 320×568, with no horizontal overflow. **Not** an RLS, database, realtime or two-account pass. |
| Historical: local presentation-sizing harness (before the shared diorama) | This measured the earlier simplified scene, not the current integrated framing. At a synthetic marker pose, the sea, target line and piece projections were about 1.5× their former size; water taps returned the same local coordinates before and after, and a piece tap selected `a1`. **Not** real marker tracking or phone acceptance and not evidence for the current diorama's outer-art clipping. |
| Local PostgreSQL 17 migration and legacy preservation | **Pass.** Fresh PG 17.11 database; existing migrations through `160000` applied; realistic legacy active and lobby fixtures created with the old RPCs; `170000` applied with `ON_ERROR_STOP=1`. Existing session/member/progress JSON was unchanged apart from `game_version = 'legacy'`; row counts unchanged; new lobby sessions were `hunt-v1`. |
| Local PostgreSQL authoritative actions and geometry | **Pass.** Real authenticated-role calls exercised open, place/rotate/return, shared revisions, ownership denial, invalid/out-of-water/overlap/NaN/missing-input rejection, boat-blocking failure, horizontal pass, rotated pass, vertical exposure and two-piece insufficiency. |
| Local PostgreSQL RLS, privileges and publication | **Pass.** Progress and action-log RLS enabled; only member SELECT on progress; no client writes or action-log reads; new public RPC grants present; internal helper execute revoked; outsider read count 0; anon denied; `break_waves_progress` present in `supabase_realtime`. |
| Local PostgreSQL stale/idempotency/progression | **Pass.** Stale edit/ready/ack rejected; repeated action IDs did not duplicate revisions or attempts; failure preserved pieces/revision; exactly one saved test result per two-ready test; success locked the layout; one ack did not unlock; both acks paused and unlocked once; duplicate ack left the clue timestamp unchanged; reopen/legacy operations did not change completion. |
| Concurrent two-connection PostgreSQL checks | **Pass.** Two simultaneous ready calls produced one test/attempt; competing same-revision edits produced one accepted and one stale result; ready-versus-edit tested only the pre-edit revision; concurrent acknowledgements completed both sides and unlocked the clue once without deadlock. All used `statement_timeout`/`lock_timeout`. |
| Hosted shared migration application | **Pass.** `npx supabase migration list --linked` showed exactly `20261026170000` pending; `npx supabase db push --linked --dry-run` predicted exactly that one migration; `npx supabase db push --linked --yes --skip-vault` exited 0; a second migration-list check showed local = remote = `20261026170000`. A read-only hosted query showed one legacy session, zero hunt sessions, zero hunt progress rows, both new tables RLS-enabled and progress in `supabase_realtime`. |
| Hosted branch preview | Cloudflare Pages build for branch `ar-scavenger-demo` only; expected host `https://ar-scavenger-demo.sip-coastaldatingapp.pages.dev`. Deployment/entry/asset verification is recorded in the rollout return, not assumed here. |
| Supabase JWT/PostgREST/Realtime delivery | **NOT RUN.** The PostgreSQL checks used direct SQL role claims, not the hosted stack. |
| Real two-phone world-tracking paired game | **NOT RUN.** |

Captured counters:

- Framing at the fixed integrated-check pose: the outer diorama model extends to NDC x ±2.115 (Oblique) / ±2.13 (Top)
  on 390×844 and x ±1.735 / ±1.747 on 320×568, with y −1.17..0.585 / −1.31..0.67. The lighthouse/island
  outer art is therefore clipped at the sides and bottom, as expected for a close phone-like aim. The
  authoritative water plane remained inside the canvas at NDC x ±0.641 / ±0.618, y −0.162..0.055 /
  −0.182..0.052 on 390×844, and x ±0.525 / ±0.507 at 320×568. This does **not** prove full-phone framing
  or physical device performance; the compact 320×568 sheet is 229 px high and starts below the water,
  pieces and targets.

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
2. Print the hunt card from the card page. On each phone scan it (phone camera or in-app scanner).
   Before entry, confirm that a direct trail visit or reload still shows the scan/testing choice, and
   that a stop already opened by the partner still shows it too. Confirm each phone needs its own
   entry and that the visible **Place without QR (testing)** option is separate and clearly labelled
   as testing. Confirm each scan opens only that phone and that each sees the stop and the same goal.
   Confirm the scanner closes and releases its camera before the Start camera action is available,
   and that AR does not start automatically.
3. Tap **Start camera** on both and allow camera plus motion access. Stand over a textured floor
   with cracks, gravel, grass or a patterned rug; keep tables out of view. Move slowly until normal
   tracking appears, then tap the floor once. Confirm the first tap places the coast and does not
   place a piece. Judge the authoritative water rectangle, target line and accepted pieces rather
   than the decorative outer island edge. At 390×844 and 320×568 keep an accessible floor-tap area
   above the build sheet. Confirm at least 44 px touch controls. On the build sheet, hold and drag
   the pull handle slowly up and down: the sheet and handle must follow the finger continuously
   while held, without jumping only on release. Drag fully down in one gesture and confirm only the
   handle plus bottom safe-area strip remain; the controls body must not be visible or reachable by
   Tab. Drag fully up in one gesture and confirm it stops at the expanded bound. Scroll the sheet
   body and confirm the handle stays fixed and reachable. Confirm tapping, Enter/Space or
   ArrowUp/ArrowDown reopens or closes it, and that a small or cancelled drag changes nothing.
   Repeat in landscape and confirm the right dock keeps a visible handle and usable controls
   without covering the left camera region.
4. Move Island size through 50%, 100% and 200% on each phone. Confirm the percentage updates, the
   island stays on the floor at the same X/Z and facing, and no RPC/revision/ready change occurs.
   Tap **Re-place coast**; confirm the old anchor and any draft ghost disappear, accepted pieces and
   both ready checks stay unchanged, and the next floor tap places the coast again. Confirm moving
   the phone changes perspective and there is no Oblique/Top fixed-view control. Confirm A sees the
   wave/risk lens and B sees the seabed/boat-corridor lens, including the exact buildable-water
   boundary. Toggle each. Confirm both can still inspect and select only their own two piece cards.
5. Place one of A's pieces, then rotate it and move it. Confirm B sees the accepted piece's quiet
   owner accent, exact footprint and revision change. Repeat from B. Confirm there are no text labels
   on scene pieces. Hide the floor or cover the camera until tracking is limited; confirm the coast
   is hidden, construction is disabled, Re-place/Stop are available, and no tap becomes a game edit.
   Recover normal tracking and confirm the same anchor, yaw, saved layout and construction return;
   ordinary tracking loss must not require a fresh placement. Fresh placement is required only after
   an explicit Re-place, Stop/restart or a new session.
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
10. Press **Stop camera**, or lock a phone or switch apps during AR. Confirm the camera indicator
    turns off and the app shows the stopped/paused state. Return and press Start camera again;
    confirm the saved revision and island size are retained but a fresh floor placement is required.
    Press Stop camera while the saved result is visible and confirm the result offers Start camera
    again rather than hiding recovery while this page's entry remains. Navigate away and back;
    confirm no camera or engine session remains active and direct re-entry asks for the scan/testing
    choice before Start. Start a genuinely new trail session and confirm it begins at 100% rather
    than inheriting the previous size or placement.
11. Third-account denial: with a third signed-in account that is not in the pair, open
    `/trail/<session-id>` and `/scan/break-the-waves`. Confirm neither loads the stop nor writes
    progress. With a legacy active account, scan the hunt card and confirm it is refused as the
    wrong trail version.
