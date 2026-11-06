# Coastal AR feasibility experiment

A standalone, local image-tracking experiment for the coastal protection activity. A printed card
shows an illustrated coast and a separate QR code. The QR opens `ar.html`; the rear camera tracks
the illustration and places an animated miniature sea, beach and breakwater on it. A tap places a
breakwater section; broadside sections add a local wave shadow behind them, and rotating one by 90°
turns it edge-on so its added shelter drops away. Reset restores the baseline wave field.

This is **not** the paired trail game. It has no Supabase, database, authentication, pairing,
persistence or deployment changes. It is a feasibility check for the AR and interaction idea.

## Try it locally

```bash
npm run dev
```

| Page | URL |
| --- | --- |
| Experiment | http://localhost:5173/ar.html |
| Print card / QR | http://localhost:5173/card.html |
| Local target compiler | http://localhost:5173/ar/compile.html |

Open the card page, print the A5 card (or show it on another screen), open the experiment and tap
**Start rear camera**. On a desktop, a webcam can show a preliminary result but it does not prove
Safari behaviour on a phone.

The compiled target is committed at `public/ar/targets/coastal-target.mind`, so a visitor never
needs to compile anything. The source artwork is `public/ar/targets/coastal-target.svg`; the
compiled raster is `public/ar/targets/coastal-target.png`.

## Print the card and set the QR link

The QR is generated in the browser with the existing `qr` dependency. It is deliberately separate
from the tracking illustration: changing the URL changes only the QR, not the image MindAR follows.

1. Open `/card.html`.
2. Enter a URL the **phone** can reach. The page starts with this page's `/ar.html`, which is
   honest local state but will usually be `localhost`.
3. If the URL is `localhost`, `http://` or a private IP, the page explains why it may not work on a
   phone. Do not print a phone card while that warning says the phone cannot open it. If a
   localhost/HTTP card is printed anyway, a red warning is printed next to the QR as well.
4. Use **Print the card**. A5 at 100%, or A4 with "fit to page", in colour. The illustration should
   be roughly 110–125 mm square. Matte paper reduces glare.

The card's QR was decoded back to the exact URL during the checks below.

## Real-iPhone test instructions

The user authorised a branch-only preview after the local experiment checks. The preview branch is
`ar-scavenger-demo`, not `main`. After Cloudflare finishes building, use
`https://ar-scavenger-demo.sip-coastaldatingapp.pages.dev/card.html` to print the card and
`https://ar-scavenger-demo.sip-coastaldatingapp.pages.dev/ar.html` to open the experiment.

Use one of these HTTPS paths:

### A. Approved HTTPS preview

If the project's normal branch-preview process is approved for this experiment, publish the built
`dist/` to an HTTPS preview host (for example the existing Cloudflare Pages branch preview). Then:

1. Open `https://<preview-host>/card.html` on a computer.
2. Put `https://<preview-host>/ar.html` in the URL field and print the card.
3. On the iPhone, scan the printed QR, tap **Start rear camera**, allow the camera, and point the
   rear camera at the illustration.
4. Check tracking, tap a glowing ring, use **Rotate 90°**, stop and start again, and put the phone
   to sleep / switch apps to check the paused state.

Do not reuse a localhost QR on the phone. A phone cannot resolve the computer's `localhost`.

### B. Trusted local HTTPS

A phone on the same Wi-Fi can use a local HTTPS address only if Safari trusts the certificate.
Serve the built `dist/` through an approved TLS-terminating local server or tunnel, open
`https://<reachable-host>/card.html` on the computer, put `https://<reachable-host>/ar.html` in the
URL field and print. Plain `http://192.168.x.x` will not give Safari camera access.

**Build and desktop checks do not prove Safari camera, tracking or performance behaviour.** Record
the real-iPhone result separately.

## Compile the target again (only when the artwork changes)

The compiler is the vendored MindAR 1.2.5 browser compiler; no image or camera data is uploaded.

1. `npm run dev`
2. Open `http://localhost:5173/ar/compile.html`.
3. Click **Compile target**, wait for the progress to finish, and download `coastal-target.mind`.
4. Replace `public/ar/targets/coastal-target.mind`.
5. Run `npm run build` and re-test tracking.

The source raster is square (1024 × 1024) and the .mind file is 460,776 bytes. The illustration was
designed with high-contrast, asymmetric features spread across the card.

### Wave-shadow approximation

The miniature is illustrative, not an engineering wave model. The dominant visible swell travels
from the open sea at the upper right toward the island at the lower left. The island's own lee is a
baseline that exists with no sections placed.

Each placed section adds a separate, soft, bounded shadow only in the water downstream of its broad
face. The shadow strength uses the section's guide orientation and its current 90° turn: 0° and 180°
are broadside and add shelter; 90° and 270° are edge-on and add none. The shadow width follows the
section's projected width across the wave front. Multiple sections use the strongest local shadow,
not an unbounded stack. Reset removes every section, so only the baseline returns.

| Target artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `coastal-target.svg` (source) | 25,154 | `bfbdf272f3aec9c42ff15617203069db663ba8f478d83698d57dee0fe6c69d50` |
| `coastal-target.png` (compiled raster) | 804,785 | `96e58832ce8b644f2be89b0aeb38410ec371c8f2814312e50ebba56947f9d248` |
| `coastal-target.mind` (committed target) | 460,776 | `63872abd24c6dc4a3c6b80242bdcaa30da4d90b29c3f26c1c5613781bf295d22` |

## Checks run (desktop, synthetic camera where stated)

Commands:

| Command | Result |
| --- | --- |
| `npm run build` (`tsc -b && vite build`) | Exit 0. Built `index.html`, `spike.html`, `ar.html`, `card.html`; no type or bundle errors. |
| `npm run preview -- --port 4173` | Served the built `dist/` for the built-page checks. |
| Compile check in Chromium via `/ar/compile.html` | Exit 0; wrote a 460,776-byte .mind file. |

Manual/scripted browser checks, using Chromium 155 (Playwright bundled) and a synthetic Y4M camera
feed made from the target artwork. Earlier tracking/placement checks used a perspective feed; the
causal shelter check below used a front-facing feed so the miniature was visible top-down:

| Check | Result | Label |
| --- | --- | --- |
| Intro page loads, controls are present and the start action is visible | Pass | Desktop |
| Card page renders both QR views; print CSS hides the controls and fills A5 | Pass | Desktop / print emulation |
| Rendered preview and printed-card QR decode to the exact test URL | Pass (315 × 315 and 339 × 339 screenshots) | Desktop |
| MindAR finds the synthetic target and shows **Tracking live** | Pass | Synthetic camera |
| Miniature scene renders registered to the target with perspective | Pass | Synthetic camera |
| Placed broadside section reduces wave height behind that section | Pass; RMS behind the section fell 0.029261 → 0.018047 (38.32%) | Synthetic camera |
| Water in front of the section stays rough | Pass; ahead RMS unchanged at 0.021256 (0.00%) | Synthetic camera |
| Rotating the section 90° removes its added shelter | Pass; behind RMS returned to 0.029261 (0.00% delta) | Synthetic camera |
| Reset restores the baseline wave field | Pass; behind RMS returned to 0.029261 (0.00% delta) | Synthetic camera |
| Tap a glowing ring to place a section | Pass | Synthetic camera |
| Rotate the selected section by 90° | Pass | Synthetic camera |
| Controls are disabled and taps are ignored while target is lost | Pass | Synthetic camera |
| Tracking lost and reacquired; placed section survives | Pass | Synthetic camera |
| Stop releases the video track/worker, then Start again tracks again | Pass | Synthetic camera |
| Denied camera state | Pass with a synthetic `NotAllowedError` | Synthetic permission |
| Unavailable camera state | Pass with a synthetic `NotFoundError` | Synthetic permission |
| Cancel while a camera permission request is pending; late resolution is cleaned up | Pass with a 4.5 s delayed `getUserMedia` | Synthetic permission |
| Built page requests only local assets | Pass; six unique local `/ar/` assets, no external hosts, no failed requests | Built preview |
| Real iPhone Safari camera, tracking, lighting and orientation | **Not run** | Real phone |
| Real printed card, real phone QR scan, real camera | **Not run** | Real phone |
| Background/foreground on a real iPhone | **Not run** | Real phone |

### Causal shelter check details

A temporary local Chromium/Playwright check ran against `npm run dev -- --port 5173` with a
synthetic front-facing Y4M camera feed. It froze `performance.now()` and rendered the scene at the
same animation time (500.5 s) for every condition, so only the placed section changed between
screenshots. It read the actual sea vertex heights from the scene.

- Region behind the section: 90 sea vertices within 0.04–0.20 units downstream of the section and
  ±0.08 units laterally.
- Region ahead of the section: 77 vertices in the matching upstream band.
- Before placement: behind RMS 0.029261.
- After broadside placement: behind RMS 0.018047, a 38.32% drop; ahead RMS unchanged at 0.021256.
- After 90° rotation: behind RMS 0.029261, exactly the baseline (0.00% delta).
- After reset: behind RMS 0.029261, exactly the baseline (0.00% delta).
- No page or console errors. Exit status 0. Screenshots of the four states were inspected locally
  but are not committed.

This is still a synthetic check. It proves the causal water-field change in this scene, not iPhone
frame rate, real-camera tracking or perceived shelter on a phone.

## Bundle footprint

Vendor files are unmodified published distributions. Sizes are bytes; gzip values are `gzip -9` for
reference, not a server guarantee.

| Runtime asset | Raw | Gzip |
| --- | ---: | ---: |
| three.module.min.js 0.160.0 | 670,681 | 166,182 |
| CSS3DRenderer.js 0.160.0 | 7,804 | 2,121 |
| mindar-image-three.prod.js 1.2.5 | 385,065 | 59,746 |
| controller-mGt1s8dJ.js 1.2.5 | 2,199,370 | 369,688 |
| ui-fBadYuor.js 1.2.5 | 4,552 | 1,573 |
| coastal-target.mind | 460,776 | 252,401 |
| Experiment JS/CSS/HTML from build | ≈ 34,900 | ≈ 12,600 |
| **Approximate runtime total** | **≈ 3.76 MB** | **≈ 0.86 MB** |

The card page loads the SVG illustration (25,154 bytes) and the QR encoder chunk (14,400 bytes raw;
6,350 gzip); it does not load MindAR or Three.js. The compiler-only `mindar-image.prod.js` (266
bytes) is not loaded by the experiment.

The 2.2 MB MindAR controller chunk is the dominant cost. It bundles TensorFlow.js 4.16.0 and the
other libraries listed in `public/ar/vendor/THIRD-PARTY.md`. Exact upstream URLs, versions, sizes
and SHA-256 hashes are recorded there.

## Limitations and deliberate choices

- One image target only. The target is the illustration, not the whole card. The QR is separate.
- The wave shelter is a directional, vertex-amplitude approximation, not an engineering simulation.
  The island's natural lee is baseline; player-built shelter is a local shadow behind broadside
  sections and disappears when they are turned edge-on or reset. Breakwaters reduce wave energy; they
  do not prevent higher sea levels from flooding land.
- Interactions are accepted only while MindAR reports the target as tracked. When tracking is lost,
  the placement/rotate/reset controls are disabled and pointer taps are ignored.
- The experiment reuses one `MindARThree` instance per page and tears down the controller, worker,
  video tracks and render loop itself. This works around `MindARThree.stop()` assuming a successful
  start and avoids the unremovable resize listener multiplying across retries. The listener remains
  but becomes a no-op after the video is cleared.
- MindAR 1.2.5 logs a Three.js warning about the removed `outputEncoding` property. Three 0.160.0
  still exports `sRGBEncoding`, and the scene renders; the versions are pinned intentionally.
- Camera errors are captured by briefly wrapping `getUserMedia` around MindAR's start. This is
  limited to the start attempt and is restored in a `finally` block.
- No A-Frame, React Three Fiber, physics engine, extra dependency, CDN request, authentication,
  database table, Supabase action or main dating-screen change. The original local checks preceded
  the separately authorised branch-only preview deployment. Do not merge this experiment into `main`.
- The card page is a local print helper, not a hosted service. A real phone test still needs an
  approved HTTPS host (or trusted local HTTPS) and a real iPhone result.

## Files

| Path | Purpose |
| --- | --- |
| `ar.html`, `src/experiment/ar.ts`, `ar.css` | Standalone experiment page, camera lifecycle, states |
| `src/experiment/coastalScene.ts` | Three.js miniature, wave/shelter animation, slots, rotate/reset |
| `card.html`, `src/experiment/card.ts`, `card.css` | Print-ready A5 card with URL-driven QR |
| `public/ar/targets/coastal-target.svg` | Original vector artwork |
| `public/ar/targets/coastal-target.png` | 1024 × 1024 raster used for compilation |
| `public/ar/targets/coastal-target.mind` | Committed compiled MindAR target |
| `public/ar/compile.html` | Local browser compiler page |
| `public/ar/vendor/` | Pinned MindAR/Three modules, licences and third-party notices |
