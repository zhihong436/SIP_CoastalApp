# Third-party browser assets

These files are unmodified published distributions, served from this repository so the experiment
makes no runtime CDN requests. The versions and hashes below are the files that are actually served.

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
