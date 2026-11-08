# Third-party browser assets

These files are unmodified published distributions, served from this repository. The configured
loader paths below use only same-origin requests. That observation covers loading, not requests a
running engine or camera loop might make; post-camera network behaviour has not been verified.
Only the retained Three.js and 8th Wall assets are listed. The versions and hashes below are the
files that are actually served.

## Runtime graph used by the live hunt

| Asset | Version | Upstream | Local file | Bytes | SHA-256 | Licence |
| --- | --- | --- | --- | ---: | --- | --- |
| three.js module (minified) | 0.160.0 | https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js | `three-0.160.0/build/three.module.min.js` | 670,681 | `3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6` | MIT |

The live hunt imports this module dynamically from the same-origin path in
`src/features/trail/breakWavesWorldAr.ts` and supplies it to the shared scene. The module is a
single file with no additional JavaScript chunks or remote model downloads.

## Licence texts

- three.js: `three-0.160.0/LICENSE` (MIT)
- 8th Wall: the two licence files in `8thwall-engine-1.0.0/` listed below

No third-party artwork is included. The decorative coastal card illustration at
`../targets/coastal-target.svg` was created for this project and is not a tracking target.

## 8th Wall engine binary (live world-tracking runtime)

These files are the unmodified published distribution of `@8thwall/engine-binary` 1.0.0, served
from this repository. The paired Break the waves stop uses this same-origin loader through
`src/features/trail/breakWavesWorldAr.ts`. Only
pre-camera loading has been observed; no claim is made about requests after the camera loop starts.
This is a proprietary binary distribution under the XR Engine License Agreement, **not** the
MIT-licensed open-source `@8thwall/engine` package; no engine source is included. The MIT package
has no SLAM and is not used here.

| Asset | Upstream | Local file | Bytes | SHA-256 | Licence |
| --- | --- | --- | ---: | --- | --- |
| Engine core | https://registry.npmjs.org/@8thwall/engine-binary/-/engine-binary-1.0.0.tgz → `package/dist/xr.js` | `8thwall-engine-1.0.0/xr.js` | 1,036,695 | `b3973936862f4cb77ae32d24f253d8a0e8b1de4fa2a0cf688833742889ee829d` | XR Engine License Agreement (proprietary) |
| SLAM chunk | same package → `package/dist/xr-slam.js` | `8thwall-engine-1.0.0/xr-slam.js` | 5,538,007 | `398f675c920892afd4521d5196df2b6b8a1b8a90b6a5c749cf5ad1a6e0a85270` | XR Engine License Agreement (proprietary) |
| Licence (package root) | same package → `package/LICENSE` | `8thwall-engine-1.0.0/LICENSE` | 16,010 | `a2b3be43396a2554a4ab5fefd85086e593e5103f6b1160df4bb3ebb49b033750` | XR Engine License Agreement (proprietary) |
| Licence (dist copy) | same package → `package/dist/LICENSE` | `8thwall-engine-1.0.0/LICENSE-dist.txt` | 15,994 | `ed166ff1e5002cd7557f2c595a2398b092e76481070e6bc3b253e51517f3ae61` | XR Engine License Agreement (proprietary) |

Provenance:

- Obtained with `npm pack @8thwall/engine-binary@1.0.0` in a scratch directory. No application
dependency was installed, upgraded or changed.
- Registry metadata: https://registry.npmjs.org/@8thwall/engine-binary/1.0.0. Tarball
  https://registry.npmjs.org/@8thwall/engine-binary/-/engine-binary-1.0.0.tgz, 13,948,985 bytes,
  sha1 `d459785dd82773459dcd86a32635132697b9690e`, integrity
  `sha512-qH0WH7+HHQFtwzKL+TDEg8RT+RadC2eR3c2v+GcJW3Z+7ZedJYadHmA0lZcOXwntBbcQZkeKkj1HYuUKcZanrA==`.
- The tarball's computed sha512 matched the registry integrity, and a second `npm pack` was
  byte-identical (sha256 `31e916d871a1b9046bbe055a79bc173aa6244d120116a1337d3ada7ef96112ff`).
  The registry records 17 files / 30,986,202 unpacked bytes; the four retained files total
  6,606,706 bytes and are byte-identical to the extracted package.
- The package's `dist/` files are stored at the top level of the local directory because this
  repository's `.gitignore` ignores every directory named `dist`. File contents are unchanged;
  `dist/LICENSE` is kept as `LICENSE-dist.txt` to avoid two files named `LICENSE` in one
  directory, and the two runtime files keep their published names.
- Largest retained file: `xr-slam.js` at 5,538,007 bytes (5.28 MiB). No retained file reaches
  the 25 MiB (26,214,400-byte) Cloudflare per-file review threshold.

Runtime loading:

- `xr.js` is included with `data-preload-chunks="slam"`, which requests `xr-slam.js` from
  the same directory. Both are served same-origin; there are no CDN or third-party runtime hosts
  in the validated loader path. This covers the observed pre-camera loader only. Post-camera
  requests were not exercised, and the running engine's network behaviour is not claimed here.
- Face, semantics, media-worker, tablet-frame and powered-by assets (`xr-face.js`, `*.tflite`,
  `media-worker.js`, `semantics-worker.js`, `*.glb`, `powered-by.svg`) were not retained because the
  validated pre-camera core + SLAM loader path did not request them. Add them only if a later
  approved experiment shows they are required.
- Loader smoke (2026-11-07, headless Chromium 155 via Playwright, local static server): the
  existing r160 three.js module was assigned to `window.THREE`, then `xr.js` was loaded and the
  `xrloaded` event fired. Core and SLAM both returned HTTP 200; `XR8.Threejs.pipelineModule()`
  returned module `threejsrenderer` and `XR8.XrController.pipelineModule()` returned module
  `reality`. No camera permission was requested (`cameraRequested: false`, camera permission state
  still `prompt`). Evidence: `Evidence/2026-11-07_World_Tracking_Runtime/`.
- Compatibility limits: this only proves pre-camera loading and pipeline factory availability in
  one desktop headless browser. It does not prove rendering under the camera loop, iPhone or SLAM
  tracking behaviour, privacy/camera-transfer behaviour, or supported-device behaviour. Pre-camera
  `XR8.XrDevice.isDeviceBrowserCompatible()` returned `false` on the desktop test host.

Licence summary (not legal advice):

- The shipped `LICENSE` files are the XR Engine License Agreement (Niantic Spatial, Inc.), included
  unmodified. `LICENSE` (package root) and `LICENSE-dist.txt` (the package's `dist/LICENSE`) carry
  the same agreement in different shipped formatting, so both are preserved exactly as published.
- Grants a limited, non-exclusive, non-transferable, non-sublicensable, revocable licence to
  install, execute and distribute the Software in original form in connection with applications
  that use its functionality.
- Restrictions include no reverse engineering, decompilation or disassembly; no modification or
  derivative works; restrictions on distributing, selling, sublicensing or transferring the
  Software outside the grant; no use with a product or service that is both offered for a fee or
  other consideration and derives its value entirely or substantially from the Software's
  functionality; and attribution/notice obligations.
- Provided "as is" without warranties. Niantic Spatial has no obligation to update, patch or
  maintain the Software and may abandon it; the licence is revocable.
- Full text: https://github.com/8thwall/engine/blob/main/LICENSE. Attribution guidance:
  https://8thwall.org/docs/open-source. Legal compliance is for the project owner to confirm.
