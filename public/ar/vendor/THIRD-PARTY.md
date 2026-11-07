# Third-party browser assets

These files are unmodified published distributions, served from this repository. The configured
loader paths below use only same-origin requests. That observation covers loading, not requests a
running engine or camera loop might make; post-camera network behaviour has not been verified.
The versions and hashes below are the files that are actually served.

## Runtime graph used by `ar.html`

| Asset | Version | Upstream | Local file | Bytes | SHA-256 | Licence |
| --- | --- | --- | --- | ---: | --- | --- |
| MindAR image/three entry | 1.2.5 | https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js | `mind-ar-1.2.5/mindar-image-three.prod.js` | 385,065 | `29c8bd077a2b3777ee48a07575004acd947f18f03bf054ce28a21d454ea26f4f` | MIT |
| MindAR image controller/compiler chunk | 1.2.5 | https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/controller-mGt1s8dJ.js | `mind-ar-1.2.5/controller-mGt1s8dJ.js` | 2,199,370 | `98a90806c01077a46fc5a3daddc6441ac9d61c5b85b3cc09d3f0b2087d228713` | MIT, plus bundled third-party notices below |
| MindAR UI chunk | 1.2.5 | https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/ui-fBadYuor.js | `mind-ar-1.2.5/ui-fBadYuor.js` | 4,552 | `aed9538fec28fecfb0a564da48fbf053ac2549d3314746e67182d381b3a24c31` | MIT |
| three.js module (minified) | 0.160.0 | https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js | `three-0.160.0/build/three.module.min.js` | 670,681 | `3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6` | MIT |
| CSS3DRenderer addon | 0.160.0 | https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/renderers/CSS3DRenderer.js | `three-0.160.0/examples/jsm/renderers/CSS3DRenderer.js` | 7,804 | `e776aad62e4988c78e684a40804cf1c61ccd0a04c9162afaeef5fd1b5f36fded` | MIT |

MindAR's entry statically imports `three`, `three/addons/renderers/CSS3DRenderer.js`,
`./controller-mGt1s8dJ.js` and `./ui-fBadYuor.js`. The controller statically imports only
`./ui-fBadYuor.js` and inlines its workers as data/blob URLs. There are no further JavaScript
chunks or remote model downloads in the image-tracking graph.

## Compiler-only asset

`mind-ar-1.2.5/mindar-image.prod.js` (266 bytes, SHA-256
`a21eef9a98ed73aee589a219b35e580c50b501c6f50f88d6eed16dcef9b8dec2`) is used only by the local
authoring page `ar/compile.html`. It reuses the same controller and UI chunks. The visitor
experiment does not request it.

## Bundled inside the MindAR controller chunk

MindAR 1.2.5's published image-target chunk contains these libraries. Versions are from MindAR's
v1.2.5 lockfile; the published chunk is served unmodified.

| Package | Version | Licence |
| --- | --- | --- |
| TensorFlow.js (tfjs, tfjs-core, tfjs-backend-webgl, tfjs-backend-cpu) | 4.16.0 | Apache-2.0 |
| mathjs | 11.6.0 | Apache-2.0 |
| ml-matrix | 6.10.4 | MIT |
| svd-js | 1.1.1 | MIT |
| tinyqueue | 2.0.3 | ISC |
| @msgpack/msgpack | 2.8.0 | ISC |

The controller chunk contains TensorFlow.js licence markers (`/** @license See the LICENSE file. */`)
and the string `4.16.0`. TensorFlow.js itself bundles further transitive packages; the controller chunk
is the unmodified upstream MindAR artifact and its retained notices apply. The upstream MindAR build is
the source of truth for the bundled code; do not edit the vendored chunks.

## Licence texts

- MindAR: `mind-ar-1.2.5/LICENSE` (MIT)
- three.js: `three-0.160.0/LICENSE` (MIT)
- TensorFlow.js / Apache-2.0: `tensorflow-apache-2.0-LICENSE.txt`
- mathjs / Apache-2.0: `licenses/mathjs-11.6.0-Apache-2.0.txt`
- ml-matrix / MIT: `licenses/ml-matrix-6.10.4-MIT.txt`
- svd-js / MIT: `licenses/svd-js-1.1.1-MIT.txt`
- msgpack / ISC: `licenses/msgpack-2.8.0-ISC.txt`
- tinyqueue / ISC: `licenses/tinyqueue-2.0.3-ISC.txt`

No third-party artwork is included. The coastal illustration, its raster target and the compiled
`.mind` target were created for this experiment.

## 8th Wall engine binary (world-tracking experiment)

These files are the unmodified published distribution of `@8thwall/engine-binary` 1.0.0, served
from this repository. The isolated `/world.html` experiment uses this same-origin loader. Only
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
