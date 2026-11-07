// Render-only lighthouse-island model shared by the standalone visual preview and the marker AR
// scene. All geometry is authored in diorama units; the caller places the returned root and owns
// the renderer, camera, lights and animation loop. Puzzle positions map through PUZZLE_SCALE, so a
// caller can recover exact game coordinates with one inverse transform.
import {
  PIECE_LENGTH,
  PIECE_WIDTH,
  type BreakWavesPiece,
  type Side,
} from '../features/trail/breakWaves'

type Three = any
type Object3D = any

export type DioramaBreakwaterMode = 'sculpted' | 'footprint'

export interface DioramaBoatPlacement {
  x: number
  z: number
  rotation: number
  scale: number
}

interface Options {
  pieces: BreakWavesPiece[]
  compact: boolean
  shelterAt(puzzleX: number, puzzleZ: number): boolean
  shadows?: boolean
  groundShadow?: boolean
  maxAnisotropy?: number
  zOffset?: number
  breakwaterMode?: DioramaBreakwaterMode
  ownerAccents?: boolean
  boats?: DioramaBoatPlacement[]
}

export interface LighthouseDiorama {
  root: Object3D
  breakwaters: Object3D
  update(timeSeconds: number, waveMix: number): void
  setPieces(pieces: BreakWavesPiece[]): void
  setBreakwaterMood(mix: number): void
  setShoreMood(west: number, east: number): void
  dispose(): void
}

export const PUZZLE_SCALE = 2.7
export const PUZZLE_Z_OFFSET = -0.01
export const OWNER_COLOR: Record<Side, number> = { a: 0xc23a4f, b: 0xb98a2e }

const SEA_CENTER_Z = 0.55
const WATER_Y = 0.075
const SHORE_Y = 0.075
const GRASS_TOP = 0.33
const SEA_WAVE_NUMBER = 4.3
const SEA_WAVE_RATE = 1.15
const FOAM_LINE_COUNT = 4
const FOAM_WAVELENGTH = (Math.PI * 2) / SEA_WAVE_NUMBER
// A line has fully cleared the shore when its curved crest is below z = -0.2. The extra
// margin covers the +/-0.14 z variation from the crest curve and the +/-0.1 crest search.
const FOAM_WRAP_LOW = -0.45
const FOAM_WRAP_SPAN = FOAM_WAVELENGTH * FOAM_LINE_COUNT

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function mulberry32(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function standard(THREE: Three, color: number, options: Record<string, unknown> = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.01,
    flatShading: true,
    ...options,
  })
}

function disposeObject(root: Object3D) {
  const geometries = new Set<any>()
  const materials = new Set<any>()
  const textures = new Set<any>()
  root.traverse((child: any) => {
    if (child.geometry) geometries.add(child.geometry)
    const material = child.material
    const items = Array.isArray(material) ? material : material ? [material] : []
    for (const item of items) {
      materials.add(item)
      for (const key of ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'roughnessMap'] as const) {
        if (item[key]) textures.add(item[key])
      }
    }
  })
  for (const geometry of geometries) geometry.dispose?.()
  for (const texture of textures) texture.dispose?.()
  for (const material of materials) material.dispose?.()
}

function shapeFromWorldPoints(THREE: Three, points: Array<[number, number]>) {
  const shape = new THREE.Shape()
  shape.moveTo(points[0][0], -points[0][1])
  shape.splineThru(points.slice(1).map(([x, z]) => new THREE.Vector2(x, -z)))
  shape.closePath()
  return shape
}

export function createLighthouseDiorama(THREE: Three, options: Options): LighthouseDiorama {
  const compact = options.compact
  const zOffset = options.zOffset ?? PUZZLE_Z_OFFSET
  const shadows = options.shadows ?? false
  const random = mulberry32(20261107)
  const rand = (min: number, max: number) => min + (max - min) * random()
  const root = new THREE.Group()

  const worldX = (puzzleX: number) => puzzleX * PUZZLE_SCALE
  const worldZ = (puzzleZ: number) => puzzleZ * PUZZLE_SCALE + zOffset
  const setShadow = (mesh: Object3D, cast = true, receive = true) => {
    if (shadows) {
      mesh.castShadow = cast
      mesh.receiveShadow = receive
    }
    return mesh
  }

  const palette = {
    deep: 0x125461,
    sea: 0x1f6d77,
    midSea: 0x2b858a,
    seaLight: 0x6fd0c5,
    shallow: 0x46aaa2,
    foam: 0xf4fff7,
    sand: 0xdfb97a,
    sandLight: 0xf2d99c,
    wetSand: 0xa9794a,
    sediment: 0xb99261,
    grass: 0x6f9862,
    grassDark: 0x4c7654,
    grassLight: 0x91b77c,
    rock: 0x5f6f72,
    rockLight: 0x929b90,
    rockDark: 0x3b4e55,
    cream: 0xf4e6c7,
    creamLight: 0xfff3d7,
    coral: 0xd56048,
    coralDark: 0xad4939,
    roof: 0xc95841,
    wood: 0x74513a,
    brass: 0xd2a25a,
    window: 0xf7c76a,
  }

  const foamCanvas = document.createElement('canvas')
  foamCanvas.width = 256
  foamCanvas.height = 32
  const foamContext = foamCanvas.getContext('2d')
  if (foamContext) {
    foamContext.clearRect(0, 0, 256, 32)
    for (let index = 0; index < 90; index += 1) {
      const x = random() * 256
      const y = 4 + random() * 24
      const radius = 1 + random() * 4.5
      foamContext.fillStyle = `rgba(255, 255, 255, ${0.25 + random() * 0.6})`
      foamContext.beginPath()
      foamContext.ellipse(x, y, radius * (1 + random()), radius, random() * Math.PI, 0, Math.PI * 2)
      foamContext.fill()
    }
    foamContext.strokeStyle = 'rgba(255, 255, 255, 0.6)'
    foamContext.lineWidth = 1.2
    for (let index = 0; index < 5; index += 1) {
      const y = 6 + random() * 20
      foamContext.beginPath()
      foamContext.moveTo(0, y)
      for (let x = 0; x <= 256; x += 16) {
        foamContext.lineTo(x, y + Math.sin(x * 0.08 + index) * 2)
      }
      foamContext.stroke()
    }
  }
  const foamTexture = new THREE.CanvasTexture(foamCanvas)
  foamTexture.wrapS = THREE.RepeatWrapping
  foamTexture.wrapT = THREE.ClampToEdgeWrapping
  foamTexture.colorSpace = THREE.SRGBColorSpace
  foamTexture.repeat.set(4, 1)
  foamTexture.anisotropy = Math.min(4, options.maxAnisotropy ?? 4)

  const materials = {
    plinth: standard(THREE, 0xe9d8b7, { roughness: 0.88, flatShading: false }),
    plinthFoot: standard(THREE, 0xb99b73, { roughness: 0.95 }),
    waterBody: standard(THREE, palette.deep, { roughness: 0.42, flatShading: false }),
    islandRock: standard(THREE, palette.rock, { roughness: 0.98 }),
    islandTop: standard(THREE, 0x7d816f, { roughness: 0.98 }),
    grassTop: standard(THREE, palette.grass, { roughness: 0.96 }),
    grassSide: standard(THREE, palette.grassDark, { roughness: 0.98 }),
    rockDark: standard(THREE, palette.rockDark, { roughness: 0.98 }),
    rock: standard(THREE, palette.rock, { roughness: 0.98 }),
    rockLight: standard(THREE, palette.rockLight, { roughness: 0.96 }),
    cream: standard(THREE, palette.cream, { roughness: 0.72 }),
    creamLight: standard(THREE, palette.creamLight, { roughness: 0.8 }),
    coral: standard(THREE, palette.coral, { roughness: 0.7 }),
    coralDark: standard(THREE, palette.coralDark, { roughness: 0.82 }),
    roof: standard(THREE, palette.roof, { roughness: 0.82 }),
    wood: standard(THREE, palette.wood, { roughness: 0.95 }),
    brass: standard(THREE, palette.brass, { roughness: 0.46, metalness: 0.28 }),
    window: new THREE.MeshBasicMaterial({ color: palette.window }),
    dark: standard(THREE, 0x263b42, { roughness: 0.8 }),
    foam: new THREE.MeshBasicMaterial({
      color: palette.foam,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    breakwaterFoam: new THREE.MeshBasicMaterial({
      color: palette.foam,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    beachRipple: standard(THREE, 0xbc8d57, { roughness: 1 }),
    edge: new THREE.LineBasicMaterial({
      color: 0x203f46,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
  }

  // Each beach keeps its own wash so a one-sided layout cannot calm the opposite shore.
  function shoreMaterial(color: number, opacity: number, map?: any) {
    return new THREE.MeshBasicMaterial({
      color,
      ...(map ? { map } : {}),
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  }
  const shoreMaterials = {
    west: {
      foam: shoreMaterial(palette.foam, 0.95, foamTexture),
      exposed: shoreMaterial(0xffffff, 0.75),
      sediment: shoreMaterial(palette.sediment, 0.22),
    },
    east: {
      foam: shoreMaterial(palette.foam, 0.95, foamTexture),
      exposed: shoreMaterial(0xffffff, 0.75),
      sediment: shoreMaterial(palette.sediment, 0.22),
    },
  }

  // ----- Grounding ----------------------------------------------------------------
  let shadowTexture: any = null
  if (options.groundShadow) {
    const shadowCanvas = document.createElement('canvas')
    shadowCanvas.width = 256
    shadowCanvas.height = 256
    const shadowContext = shadowCanvas.getContext('2d')
    if (shadowContext) {
      const gradient = shadowContext.createRadialGradient(128, 128, 20, 128, 128, 126)
      gradient.addColorStop(0, 'rgba(24, 50, 48, 0.42)')
      gradient.addColorStop(0.55, 'rgba(24, 50, 48, 0.18)')
      gradient.addColorStop(1, 'rgba(24, 50, 48, 0)')
      shadowContext.fillStyle = gradient
      shadowContext.fillRect(0, 0, 256, 256)
    }
    shadowTexture = new THREE.CanvasTexture(shadowCanvas)
    shadowTexture.needsUpdate = true
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(8.4, 7.2),
      new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    shadowPlane.rotation.x = -Math.PI / 2
    shadowPlane.position.set(0, -0.5, SEA_CENTER_Z)
    root.add(shadowPlane)
  }

  // ----- Base plinth and water body ------------------------------------------------
  const plinthFoot = setShadow(
    new THREE.Mesh(new THREE.CylinderGeometry(3.14, 3.24, 0.16, 72), materials.plinthFoot),
  )
  plinthFoot.scale.z = 0.85
  plinthFoot.position.set(0, -0.4, SEA_CENTER_Z)
  root.add(plinthFoot)

  const plinth = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(3.08, 3.18, 0.34, 72), materials.plinth))
  plinth.scale.z = 0.85
  plinth.position.set(0, -0.2, SEA_CENTER_Z)
  root.add(plinth)

  const waterBody = setShadow(
    new THREE.Mesh(new THREE.CylinderGeometry(2.87, 2.94, 0.17, 72), materials.waterBody),
    false,
    true,
  )
  waterBody.scale.z = 0.85
  waterBody.position.set(0, -0.015, SEA_CENTER_Z)
  root.add(waterBody)

  // ----- Island ------------------------------------------------------------------
  const islandPoints: Array<[number, number]> = [
    [-2.18, -0.32],
    [-2.05, -0.78],
    [-1.82, -1.25],
    [-1.32, -1.58],
    [-0.7, -1.72],
    [0, -1.76],
    [0.7, -1.72],
    [1.32, -1.58],
    [1.82, -1.25],
    [2.05, -0.78],
    [2.18, -0.32],
    [1.78, -0.43],
    [1.34, -0.59],
    [0.78, -0.61],
    [0.43, -0.51],
    [0.28, -0.74],
    [0.12, -0.87],
    [0, -0.91],
    [-0.12, -0.87],
    [-0.28, -0.74],
    [-0.43, -0.51],
    [-0.78, -0.61],
    [-1.34, -0.59],
    [-1.78, -0.43],
  ]
  const islandShape = shapeFromWorldPoints(THREE, islandPoints)
  const islandGeometry = new THREE.ExtrudeGeometry(islandShape, {
    depth: 0.3,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.045,
    bevelThickness: 0.04,
    curveSegments: compact ? 12 : 20,
  })
  islandGeometry.rotateX(-Math.PI / 2)
  const island = setShadow(new THREE.Mesh(islandGeometry, [materials.islandTop, materials.islandRock]))
  island.position.y = -0.065
  root.add(island)

  const grassPoints: Array<[number, number]> = [
    [-2.02, -0.78],
    [-1.91, -1.16],
    [-1.44, -1.5],
    [-0.79, -1.64],
    [0, -1.67],
    [0.79, -1.64],
    [1.44, -1.5],
    [1.91, -1.16],
    [2.02, -0.78],
    [1.56, -0.8],
    [1.16, -0.84],
    [0.56, -0.86],
    [0.31, -0.8],
    [0.18, -0.99],
    [0, -1.03],
    [-0.18, -0.99],
    [-0.31, -0.78],
    [-0.56, -0.85],
    [-1.16, -0.84],
    [-1.56, -0.8],
  ]
  const grassShape = shapeFromWorldPoints(THREE, grassPoints)
  const grassGeometry = new THREE.ExtrudeGeometry(grassShape, {
    depth: 0.095,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.035,
    bevelThickness: 0.025,
    curveSegments: compact ? 12 : 20,
  })
  grassGeometry.rotateX(-Math.PI / 2)
  const grass = setShadow(new THREE.Mesh(grassGeometry, [materials.grassTop, materials.grassSide]))
  grass.position.y = GRASS_TOP - 0.095
  root.add(grass)

  // A couple of low meadow mounds keep the plateau from reading as a flat extrusion.
  for (const [x, z, sx, sz, color] of [
    [-1.48, -1.28, 0.44, 0.3, palette.grassDark],
    [1.25, -1.16, 0.52, 0.33, palette.grassDark],
    [0.46, -1.35, 0.3, 0.22, palette.grass],
  ] as const) {
    const mound = setShadow(
      new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), standard(THREE, color, { roughness: 0.98 })),
    )
    mound.scale.set(sx, 0.06, sz)
    mound.position.set(x, GRASS_TOP + 0.02, z)
    root.add(mound)
  }

  // ----- Curved beach shelves -----------------------------------------------------
  const westOuter = (x: number) =>
    -0.475 + 0.03 * Math.sin((x + 1.1) * 2.6) + 0.014 * Math.sin((x + 0.8) * 5.1)
  const westInner = (x: number) => -0.735 + 0.02 * Math.cos((x + 1.0) * 2.1)
  const eastOuter = (x: number) =>
    -0.475 + 0.03 * Math.sin((x - 1.1) * 2.6) + 0.014 * Math.sin((x - 0.8) * 5.1)
  const eastInner = (x: number) => -0.735 + 0.02 * Math.cos((x - 1.0) * 2.1)

  function createBeachRamp(xMin: number, xMax: number, outer: (x: number) => number, inner: (x: number) => number) {
    const columns = compact ? 18 : 30
    const rows = 4
    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []
    const sandLight = new THREE.Color(palette.sandLight)
    const sand = new THREE.Color(palette.sand)
    const wet = new THREE.Color(palette.wetSand)
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns
      const x = lerp(xMin, xMax, u)
      const zOuter = outer(x)
      const zInner = inner(x)
      for (let row = 0; row <= rows; row += 1) {
        const t = row / rows
        const eased = smoothstep(0, 1, t)
        const z = lerp(zOuter, zInner, eased)
        const y = lerp(SHORE_Y + 0.015, GRASS_TOP - 0.015, eased) + 0.014 * Math.sin(t * Math.PI)
        positions.push(x, y, z)
        const color = sandLight.clone().lerp(sand, t * 0.7).lerp(wet, Math.max(0, 0.52 - t * 1.15))
        colors.push(color.r, color.g, color.b)
      }
    }
    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        const a = column * (rows + 1) + row
        const b = (column + 1) * (rows + 1) + row
        const c = a + 1
        const d = b + 1
        indices.push(a, b, c, b, d, c)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return setShadow(
      new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.95,
          metalness: 0,
          side: THREE.DoubleSide,
        }),
      ),
    )
  }

  root.add(createBeachRamp(-1.6, -0.42, westOuter, westInner))
  root.add(createBeachRamp(0.42, 1.6, eastOuter, eastInner))

  function addBeachRipples(xMin: number, xMax: number, outer: (x: number) => number, inner: (x: number) => number) {
    const group = new THREE.Group()
    for (const t of [0.25, 0.5, 0.75]) {
      const points: any[] = []
      for (let index = 0; index <= 18; index += 1) {
        const u = index / 18
        const x = lerp(xMin, xMax, u)
        const z = lerp(outer(x), inner(x), t)
        const y =
          lerp(SHORE_Y + 0.015, GRASS_TOP - 0.015, smoothstep(0, 1, t)) + 0.014 * Math.sin(t * Math.PI) + 0.012
        points.push(new THREE.Vector3(x, y, z))
      }
      const curve = new THREE.CatmullRomCurve3(points)
      const geometry = new THREE.TubeGeometry(curve, compact ? 18 : 28, 0.0045, 4, false)
      const mesh = new THREE.Mesh(geometry, materials.beachRipple)
      mesh.receiveShadow = true
      group.add(mesh)
    }
    root.add(group)
  }
  addBeachRipples(-1.6, -0.42, westOuter, westInner)
  addBeachRipples(0.42, 1.6, eastOuter, eastInner)

  // ----- Harbour pier and boats ---------------------------------------------------
  function addBox(
    parent: Object3D,
    width: number,
    height: number,
    depth: number,
    material: any,
    x: number,
    y: number,
    z: number,
    rotationY = 0,
  ) {
    const mesh = setShadow(new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material))
    mesh.position.set(x, y, z)
    mesh.rotation.y = rotationY
    parent.add(mesh)
    return mesh
  }

  const harbour = new THREE.Group()
  addBox(harbour, 0.46, 0.035, 0.11, materials.wood, 0.2, 0.155, -0.62)
  for (const x of [0.02, 0.38]) {
    addBox(harbour, 0.025, 0.16, 0.025, materials.wood, x, 0.08, -0.58)
    addBox(harbour, 0.025, 0.16, 0.025, materials.wood, x, 0.08, -0.68)
  }
  addBox(harbour, 0.08, 0.03, 0.25, materials.wood, 0.41, 0.155, -0.7)
  root.add(harbour)

  function createBoat(x: number, z: number, rotation: number, scale: number) {
    const boat = new THREE.Group()
    boat.position.set(x, WATER_Y + 0.035, z)
    boat.rotation.y = rotation
    boat.scale.setScalar(scale)
    const hull = setShadow(
      new THREE.Mesh(
        new THREE.CapsuleGeometry(0.045, 0.13, 4, 10),
        standard(THREE, 0xf1dfbd, { roughness: 0.78, flatShading: false }),
      ),
    )
    hull.rotation.z = Math.PI / 2
    hull.scale.y = 0.48
    boat.add(hull)
    addBox(boat, 0.17, 0.02, 0.07, materials.coralDark, 0, 0.035, 0)
    const mast = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.2, 6), materials.wood))
    mast.position.set(0, 0.12, 0)
    boat.add(mast)
    const sailGeometry = new THREE.BufferGeometry()
    sailGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0.045, 0, 0.055, 0.17, 0, 0, 0.17, 0], 3),
    )
    sailGeometry.computeVertexNormals()
    const sail = new THREE.Mesh(sailGeometry, materials.creamLight)
    sail.position.set(0.005, 0.02, 0)
    sail.rotation.y = -0.2
    boat.add(sail)
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.055, 4), materials.coral)
    flag.rotation.z = -Math.PI / 2
    flag.position.set(0.045, 0.22, 0)
    boat.add(flag)
    root.add(boat)
  }
  const boats = options.boats ?? [
    { x: 0.02, z: 0.5, rotation: 0.25, scale: 1 },
    { x: -0.03, z: -0.53, rotation: -0.35, scale: 0.82 },
  ]
  for (const boat of boats) createBoat(boat.x, boat.z, boat.rotation, boat.scale)

  // ----- Lighthouse headland ------------------------------------------------------
  const rockGeometry = new THREE.DodecahedronGeometry(1, 0)
  const rockMaterials = [materials.rockDark, materials.rock, materials.rockLight]
  function addRock(
    x: number,
    y: number,
    z: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
    rotationY: number,
    materialIndex = 1,
    outline = false,
  ) {
    const mesh = setShadow(
      new THREE.Mesh(rockGeometry, rockMaterials[materialIndex % rockMaterials.length]),
    )
    mesh.position.set(x, y, z)
    mesh.scale.set(scaleX, scaleY, scaleZ)
    mesh.rotation.set(rand(-0.15, 0.15), rotationY, rand(-0.1, 0.1))
    if (outline) {
      const outlineMesh = new THREE.LineSegments(new THREE.EdgesGeometry(rockGeometry, 26), materials.edge)
      outlineMesh.renderOrder = 1
      mesh.add(outlineMesh)
    }
    root.add(mesh)
    return mesh
  }

  const lighthouseX = -1.55
  const lighthouseZ = -0.95
  addRock(lighthouseX - 0.12, 0.24, lighthouseZ + 0.02, 0.58, 0.3, 0.5, 0.4, 1, true)
  addRock(lighthouseX - 0.3, 0.31, lighthouseZ - 0.12, 0.4, 0.4, 0.38, -0.3, 0, true)
  addRock(lighthouseX + 0.22, 0.28, lighthouseZ + 0.09, 0.34, 0.26, 0.32, 0.8, 2, true)
  addRock(lighthouseX + 0.05, 0.43, lighthouseZ - 0.04, 0.3, 0.22, 0.27, -0.7, 1, true)
  addRock(lighthouseX - 0.08, 0.56, lighthouseZ + 0.02, 0.22, 0.13, 0.2, 0.2, 2)
  addRock(lighthouseX - 0.22, 0.22, lighthouseZ + 0.22, 0.24, 0.18, 0.22, 1.2, 0, false)
  addRock(lighthouseX + 0.28, 0.2, lighthouseZ + 0.23, 0.2, 0.16, 0.2, -0.4, 1, false)

  // Coastline rocks break up the extruded edge and give the island thickness.
  for (const [x, z, sx, sy, sz, mat] of [
    [-2.05, -0.48, 0.26, 0.2, 0.23, 1],
    [-1.89, -0.7, 0.19, 0.18, 0.2, 0],
    [-0.42, -0.5, 0.15, 0.14, 0.13, 2],
    [0.42, -0.5, 0.16, 0.14, 0.14, 1],
    [1.89, -0.7, 0.2, 0.2, 0.19, 0],
    [2.05, -0.48, 0.25, 0.19, 0.23, 2],
    [0, -0.91, 0.18, 0.18, 0.14, 1],
    [-0.32, -0.77, 0.12, 0.13, 0.11, 0],
    [0.32, -0.77, 0.12, 0.13, 0.11, 2],
  ] as const) {
    addRock(x, 0.18, z, sx, sy, sz, rand(-Math.PI, Math.PI), mat, sx > 0.2)
  }

  for (const [x, z, sx, sy, sz, mat] of [
    [-2.1, -1.26, 0.24, 0.22, 0.21, 0],
    [2.08, -1.22, 0.21, 0.2, 0.2, 1],
    [-1.56, -1.62, 0.18, 0.18, 0.16, 2],
    [1.54, -1.6, 0.18, 0.16, 0.17, 0],
    [-0.82, -1.72, 0.15, 0.14, 0.13, 1],
    [0.82, -1.72, 0.14, 0.15, 0.13, 2],
  ] as const) {
    addRock(x, 0.18, z, sx, sy, sz, rand(0, Math.PI), mat, true)
  }

  const lighthouse = new THREE.Group()
  lighthouse.position.set(lighthouseX, 0.66, lighthouseZ)
  lighthouse.scale.setScalar(compact ? 1.08 : 1.16)
  const tower = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.15, 0.76, 12), materials.cream))
  tower.position.y = 0.38
  lighthouse.add(tower)
  const band = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.125, 0.075, 12), materials.coral))
  band.position.y = 0.38
  lighthouse.add(band)
  const door = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.02), materials.coralDark))
  door.position.set(0, 0.12, 0.145)
  lighthouse.add(door)
  const gallery = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 12), materials.dark))
  gallery.position.y = 0.78
  lighthouse.add(gallery)
  const railing = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.009, 5, 16), materials.dark)
  railing.rotation.x = Math.PI / 2
  railing.position.y = 0.84
  lighthouse.add(railing)
  const lantern = setShadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.105, 0.16, 8), materials.window),
  )
  lantern.position.y = 0.88
  lighthouse.add(lantern)
  const roof = setShadow(new THREE.Mesh(new THREE.ConeGeometry(0.145, 0.18, 12), materials.coral))
  roof.position.y = 1.05
  lighthouse.add(roof)
  const finial = setShadow(new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), materials.brass))
  finial.position.y = 1.16
  lighthouse.add(finial)
  root.add(lighthouse)

  // ----- Cottages, path and planting ----------------------------------------------
  function createCottage(
    x: number,
    z: number,
    rotation: number,
    scale: number,
    roofMaterial: any,
  ) {
    const cottage = new THREE.Group()
    cottage.position.set(x, GRASS_TOP - 0.01, z)
    cottage.rotation.y = rotation
    cottage.scale.setScalar(scale)
    const walls = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.17, 0.23), materials.cream))
    walls.position.y = 0.085
    cottage.add(walls)
    const roof = setShadow(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.14, 4), roofMaterial))
    roof.position.y = 0.245
    roof.rotation.y = Math.PI / 4
    cottage.add(roof)
    const door = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.01), materials.coralDark))
    door.position.set(0, 0.05, 0.116)
    cottage.add(door)
    for (const windowX of [-0.085, 0.085]) {
      const window = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.038, 0.014), materials.window)
      window.position.set(windowX, 0.1, 0.117)
      cottage.add(window)
    }
    const chimney = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.08, 0.035), materials.rockDark))
    chimney.position.set(0.08, 0.27, -0.035)
    cottage.add(chimney)
    root.add(cottage)
  }

  createCottage(-0.53, -1.1, 0.15, 0.92, materials.roof)
  createCottage(0.52, -1.06, -0.18, 0.96, materials.roof)
  createCottage(0.98, -1.2, 0.34, 0.8, materials.coral)
  createCottage(-0.98, -1.24, -0.28, 0.78, materials.coral)

  function createPathRibbon(points: Array<[number, number]>, width: number, y: number) {
    const curve = new THREE.CatmullRomCurve3(
      points.map(([x, z]) => new THREE.Vector3(x, y, z)),
      false,
      'catmullrom',
      0.2,
    )
    const samples = compact ? 18 : 30
    const positions: number[] = []
    const indices: number[] = []
    for (let index = 0; index <= samples; index += 1) {
      const t = index / samples
      const point = curve.getPointAt(t)
      const tangent = curve.getTangentAt(t)
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(width / 2)
      positions.push(point.x + side.x, point.y, point.z + side.z)
      positions.push(point.x - side.x, point.y, point.z - side.z)
      if (index < samples) {
        const a = index * 2
        indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return setShadow(new THREE.Mesh(geometry, materials.creamLight))
  }
  root.add(createPathRibbon([[0.1, -0.93], [-0.35, -1.03], [-0.92, -1.02], [-1.32, -0.98]], 0.075, GRASS_TOP + 0.012))
  root.add(createPathRibbon([[0.1, -0.93], [0.38, -1.02], [0.72, -1.03]], 0.06, GRASS_TOP + 0.012))

  function createTree(x: number, z: number, scale: number) {
    const tree = new THREE.Group()
    tree.position.set(x, GRASS_TOP - 0.02, z)
    tree.scale.setScalar(scale)
    const trunk = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.15, 6), materials.wood))
    trunk.position.y = 0.075
    tree.add(trunk)
    for (const [y, radius, color] of [
      [0.18, 0.12, palette.grassDark],
      [0.25, 0.09, palette.grass],
      [0.3, 0.06, palette.grassLight],
    ] as const) {
      const canopy = setShadow(
        new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), standard(THREE, color, { roughness: 0.98 })),
      )
      canopy.position.set((random() - 0.5) * 0.03, y, (random() - 0.5) * 0.03)
      canopy.scale.y = 0.8
      tree.add(canopy)
    }
    root.add(tree)
  }
  createTree(-1.82, -1.38, 0.95)
  createTree(1.72, -1.33, 0.88)
  createTree(1.16, -1.48, 0.72)
  createTree(-1.27, -1.55, 0.68)

  const bushGeometry = new THREE.IcosahedronGeometry(1, 1)
  for (let index = 0; index < 12; index += 1) {
    const x = rand(-1.75, 1.75)
    const z = rand(-1.45, -0.92)
    if (Math.abs(x) < 0.42 && z > -1.25) continue
    if (Math.hypot(x - lighthouseX, z - lighthouseZ) < 0.55) continue
    const bush = setShadow(
      new THREE.Mesh(
        bushGeometry,
        standard(THREE, index % 3 === 0 ? palette.grassLight : palette.grassDark, { roughness: 0.98 }),
      ),
    )
    bush.position.set(x, GRASS_TOP + 0.045, z)
    bush.scale.set(rand(0.08, 0.14), rand(0.055, 0.09), rand(0.08, 0.14))
    bush.rotation.y = rand(0, Math.PI)
    root.add(bush)
  }

  // ----- Offshore rocks -----------------------------------------------------------
  for (const [x, z, sx, sy, sz, mat] of [
    [-2.23, 0.95, 0.3, 0.28, 0.27, 0],
    [-2.05, 1.2, 0.18, 0.19, 0.17, 1],
    [2.2, 0.72, 0.27, 0.24, 0.25, 1],
    [2.04, 0.96, 0.16, 0.15, 0.15, 2],
  ] as const) {
    const rock = addRock(x, 0.08, z, sx, sy, sz, rand(0, Math.PI), mat, true)
    rock.receiveShadow = true
  }

  // ----- Water surface ------------------------------------------------------------
  const waterRings = compact ? 34 : 50
  const waterSegments = compact ? 88 : 112
  const waterRadiusX = 2.82
  const waterRadiusZ = 2.42
  const waterPositions: number[] = [0, WATER_Y, SEA_CENTER_Z]
  const waterBaseX: number[] = [0]
  const waterBaseZ: number[] = [SEA_CENTER_Z]
  const waterIndices: number[] = []
  for (let ring = 1; ring <= waterRings; ring += 1) {
    const radial = ring / waterRings
    for (let segment = 0; segment < waterSegments; segment += 1) {
      const theta = (segment / waterSegments) * Math.PI * 2
      const wobble =
        1 +
        0.016 * Math.sin(theta * 5 + 1.4) +
        0.009 * Math.sin(theta * 9 - 0.7) +
        0.006 * Math.sin(theta * 13 + 2.2)
      const x = Math.cos(theta) * waterRadiusX * radial * wobble
      const z = SEA_CENTER_Z + Math.sin(theta) * waterRadiusZ * radial * wobble
      waterPositions.push(x, WATER_Y, z)
      waterBaseX.push(x)
      waterBaseZ.push(z)
    }
  }
  for (let segment = 0; segment < waterSegments; segment += 1) {
    const current = 1 + segment
    const next = 1 + ((segment + 1) % waterSegments)
    waterIndices.push(0, next, current)
  }
  for (let ring = 1; ring < waterRings; ring += 1) {
    const innerStart = 1 + (ring - 1) * waterSegments
    const outerStart = 1 + ring * waterSegments
    for (let segment = 0; segment < waterSegments; segment += 1) {
      const next = (segment + 1) % waterSegments
      const inner = innerStart + segment
      const innerNext = innerStart + next
      const outer = outerStart + segment
      const outerNext = outerStart + next
      waterIndices.push(inner, innerNext, outer, innerNext, outerNext, outer)
    }
  }
  const waterGeometry = new THREE.BufferGeometry()
  waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3))
  waterGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(new Float32Array(waterPositions.length), 3),
  )
  waterGeometry.setIndex(waterIndices)
  waterGeometry.computeVertexNormals()
  const waterMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.32,
    metalness: 0.06,
    flatShading: false,
    side: THREE.DoubleSide,
  })
  const water = new THREE.Mesh(waterGeometry, waterMaterial)
  water.name = 'water-surface'
  water.receiveShadow = false
  root.add(water)

  const deepColor = new THREE.Color(palette.deep)
  const midColor = new THREE.Color(palette.midSea)
  const crestColor = new THREE.Color(palette.seaLight)
  const shallowColor = new THREE.Color(palette.shallow)
  const waterFrontColor = new THREE.Color(0x0b3f50)
  const calmColor = new THREE.Color(0x3d8f92)
  const foamColor = new THREE.Color(0xe9fff5)
  const waterColor = new THREE.Color()

  function isSheltered(x: number, z: number) {
    const px = x / PUZZLE_SCALE
    const pz = (z - zOffset) / PUZZLE_SCALE
    return options.shelterAt(px, pz)
  }

  function seaHeightAt(x: number, z: number, time: number, waveMix: number) {
    const radius = Math.sqrt(
      Math.pow(x / waterRadiusX, 2) + Math.pow((z - SEA_CENTER_Z) / waterRadiusZ, 2),
    )
    const outerFade = 1 - smoothstep(0.8, 0.98, radius)
    const sheltered = isSheltered(x, z)
    const amp = (1 - waveMix * (sheltered ? 0.92 : 0)) * outerFade
    const shoal = 0.72 + 0.48 * smoothstep(2.2, 0.1, z)
    const curve =
      0.45 * Math.sin(x * 1.25 + time * 0.22) + 0.15 * Math.sin(x * 2.8 - time * 0.15)
    const phase = z * SEA_WAVE_NUMBER + time * SEA_WAVE_RATE + curve
    const swell = 0.5 + 0.5 * Math.sin(phase)
    const crest = Math.pow(swell, 3.8)
    const trough = Math.pow(1 - swell, 2)
    const secondary = Math.sin(z * 6.9 + time * 1.8 - x * 1.3 + 1.2)
    const ripple =
      Math.sin(x * 9.2 + z * 3.1 + time * 1.7) * 0.5 +
      Math.sin(x * 5.1 - z * 5.4 + time * 2.1) * 0.5
    const height =
      (0.16 * crest - 0.045 * trough + 0.022 * Math.sin(phase) + 0.018 * secondary + 0.006 * ripple) *
      amp *
      shoal
    return { height, phase, swell, amp, sheltered }
  }

  function updateWater(time: number, waveMix: number) {
    const positions = waterGeometry.attributes.position as any
    const colors = waterGeometry.attributes.color as any
    for (let index = 0; index < waterBaseX.length; index += 1) {
      const x = waterBaseX[index]
      const z = waterBaseZ[index]
      const profile = seaHeightAt(x, z, time, waveMix)
      positions.setY(index, WATER_Y + profile.height)
      const normalized = clamp((profile.height + 0.09) / 0.25, 0, 1)
      const crestLight = smoothstep(0.45, 1, profile.swell)
      const frontFace = clamp(Math.cos(profile.phase), 0, 1) * (0.35 + 0.65 * crestLight)
      waterColor.copy(deepColor).lerp(midColor, 0.28 + normalized * 0.62)
      waterColor.lerp(crestColor, Math.pow(crestLight, 1.8) * 0.68)
      waterColor.lerp(waterFrontColor, frontFace * 0.45)
      waterColor.lerp(foamColor, smoothstep(0.9, 1, profile.swell) * 0.35)
      if (profile.sheltered) waterColor.lerp(calmColor, waveMix * 0.12)
      const shallow = (1 - smoothstep(-0.4, 0.6, z)) * 0.22
      waterColor.lerp(shallowColor, shallow * 0.7)
      colors.setXYZ(index, waterColor.r, waterColor.g, waterColor.b)
    }
    positions.needsUpdate = true
    colors.needsUpdate = true
    waterGeometry.computeVertexNormals()
  }

  // Foam lips follow the dominant crest train. The strip is deliberately broken and tapered so it
  // reads as lace on the water rather than a continuous painted line.
  const foamLines: Array<{ positions: any; samples: Array<{ x: number; z: number }> }> = []
  const foamSamples = compact ? 48 : 66
  for (let line = 0; line < FOAM_LINE_COUNT; line += 1) {
    const positions = new Float32Array(foamSamples * 2 * 3)
    const indices: number[] = []
    const samples: Array<{ x: number; z: number }> = []
    for (let index = 0; index < foamSamples; index += 1) {
      const x = lerp(-waterRadiusX * 0.96, waterRadiusX * 0.96, index / (foamSamples - 1))
      samples.push({ x, z: 0 })
      if (index < foamSamples - 1) {
        const a = index * 2
        indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1)
      }
    }
    const uvs = new Float32Array(foamSamples * 2 * 2)
    for (let index = 0; index < foamSamples; index += 1) {
      const u = (index / (foamSamples - 1)) * 6
      uvs[index * 4] = u
      uvs[index * 4 + 1] = 0
      uvs[index * 4 + 2] = u
      uvs[index * 4 + 3] = 1
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    const mesh = new THREE.Mesh(geometry, materials.foam)
    mesh.name = 'surf-foam-line'
    mesh.renderOrder = 3
    // The strips travel far outside their initial bounds as the train recycles.
    mesh.frustumCulled = false
    root.add(mesh)
    foamLines.push({ positions: geometry.attributes.position, samples })
  }

  function updateFoam(time: number, waveMix: number) {
    for (let line = 0; line < foamLines.length; line += 1) {
      const foam = foamLines[line]
      for (let index = 0; index < foam.samples.length; index += 1) {
        const sample = foam.samples[index]
        const curve =
          0.45 * Math.sin(sample.x * 1.25 + time * 0.22) +
          0.15 * Math.sin(sample.x * 2.8 - time * 0.15)
        // Successive foam lines follow successive crests. Wrap a line only after the whole
        // curved crest has passed below the shore, then place it a full train (four crests)
        // offshore. The phase is unchanged modulo 2pi, but the jump itself is outside the
        // visible water, so the train recycles without a visible reset or a gap in the surf.
        const rawBaseZ =
          (Math.PI / 2 + Math.PI * 2 * line - time * SEA_WAVE_RATE) / SEA_WAVE_NUMBER
        const baseZ =
          FOAM_WRAP_LOW +
          ((((rawBaseZ - FOAM_WRAP_LOW) % FOAM_WRAP_SPAN) + FOAM_WRAP_SPAN) % FOAM_WRAP_SPAN)
        const provisionalZ = baseZ - curve / SEA_WAVE_NUMBER
        let z = provisionalZ
        let crestHeight = seaHeightAt(sample.x, z, time, waveMix).height
        for (let offset = -0.1; offset <= 0.1; offset += 0.025) {
          const candidate = provisionalZ + offset
          const candidateHeight = seaHeightAt(sample.x, candidate, time, waveMix).height
          if (candidateHeight > crestHeight) {
            crestHeight = candidateHeight
            z = candidate
          }
        }
        sample.z = z
        const radius = Math.sqrt(
          Math.pow(sample.x / waterRadiusX, 2) + Math.pow((z - SEA_CENTER_Z) / waterRadiusZ, 2),
        )
        const valid = radius < 0.94 && z > -0.2 && z < 2.8
        const sheltered = valid && isSheltered(sample.x, z)
        const u = index / (foam.samples.length - 1)
        const edge = smoothstep(0, 0.13, u) * smoothstep(1, 0.87, u)
        const broken = 0.7 + 0.3 * Math.sin(sample.x * 5.7 + line * 1.9 + time * 0.7)
        const gap = Math.sin(sample.x * 11.3 + line * 2.1 + time * 1.1) > 0.9 ? 0 : 1
        const strength =
          valid ? (1 - waveMix * (sheltered ? 0.9 : 0)) * edge * (1 - smoothstep(0.86, 0.98, radius)) : 0
        const width = 0.05 * strength * broken * gap
        const y = valid ? WATER_Y + crestHeight + 0.022 : WATER_Y
        const offset = index * 6
        foam.positions.array[offset] = sample.x
        foam.positions.array[offset + 1] = y
        foam.positions.array[offset + 2] = z - width
        foam.positions.array[offset + 3] = sample.x
        foam.positions.array[offset + 4] = y
        foam.positions.array[offset + 5] = z + width
      }
      foam.positions.needsUpdate = true
    }
  }

  // ----- Shore foam and sediment wash --------------------------------------------
  const exposedSurf = new THREE.Group()
  root.add(exposedSurf)
  function addShoreFoam(
    side: 'west' | 'east',
    xMin: number,
    xMax: number,
    outer: (x: number) => number,
  ) {
    const group = new THREE.Group()
    const addFoamTube = (
      target: any,
      start: number,
      end: number,
      offset: number,
      radius: number,
      material: any,
    ) => {
      const points: any[] = []
      for (let index = 0; index <= 12; index += 1) {
        const x = lerp(xMin, xMax, lerp(start, end, index / 12))
        const z = outer(x) + offset + (random() - 0.5) * 0.018
        points.push(new THREE.Vector3(x, WATER_Y + 0.02 + (random() - 0.5) * 0.008, z))
      }
      const curve = new THREE.CatmullRomCurve3(points)
      const geometry = new THREE.TubeGeometry(curve, compact ? 12 : 18, radius, 4, false)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.renderOrder = 4
      target.add(mesh)
    }
    addFoamTube(group, 0.02, 0.98, 0.018, 0.0065, shoreMaterials[side].foam)
    const exposedPatches = [
      [0.03, 0.18, 0.04],
      [0.14, 0.31, 0.11],
      [0.3, 0.46, 0.05],
      [0.45, 0.61, 0.15],
      [0.59, 0.74, 0.08],
      [0.73, 0.88, 0.13],
      [0.86, 0.98, 0.04],
    ] as const
    for (const [start, end, offset] of exposedPatches) {
      addFoamTube(exposedSurf, start, end, offset, 0.012, shoreMaterials[side].exposed)
    }
    const patches = [
      [0.02, 0.2, 0.04],
      [0.15, 0.34, 0.1],
      [0.29, 0.48, 0.06],
      [0.43, 0.63, 0.11],
      [0.57, 0.76, 0.07],
      [0.7, 0.88, 0.12],
      [0.84, 0.98, 0.05],
    ] as const
    for (const [start, end, offset] of patches) addFoamTube(group, start, end, offset, 0.008, shoreMaterials[side].foam)
    root.add(group)
  }
  addShoreFoam('west', -1.6, -0.42, westOuter)
  addShoreFoam('east', 0.42, 1.6, eastOuter)

  function addSedimentWash(
    side: 'west' | 'east',
    xMin: number,
    xMax: number,
    outer: (x: number) => number,
  ) {
    const columns = compact ? 18 : 28
    const positions: number[] = []
    const indices: number[] = []
    for (let index = 0; index <= columns; index += 1) {
      const x = lerp(xMin, xMax, index / columns)
      const edge = outer(x)
      positions.push(x, WATER_Y + 0.012, edge + 0.02)
      positions.push(x, WATER_Y + 0.012, edge + 0.24)
      if (index < columns) {
        const a = index * 2
        indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    const mesh = new THREE.Mesh(geometry, shoreMaterials[side].sediment)
    mesh.renderOrder = 2
    root.add(mesh)
  }
  addSedimentWash('west', -1.6, -0.42, westOuter)
  addSedimentWash('east', 0.42, 1.6, eastOuter)

  // ----- Breakwater rocks ---------------------------------------------------------
  const breakwaters = new THREE.Group()
  breakwaters.name = 'breakwaters'
  root.add(breakwaters)
  const breakwaterFoamGeometry = new THREE.RingGeometry(0.075, 0.102, 14)
  const boulderGeometry = new THREE.DodecahedronGeometry(1, 0)
  const capGeometry = new THREE.IcosahedronGeometry(1, 0)
  const breakwaterLength = PIECE_LENGTH * PUZZLE_SCALE
  const breakwaterHalfWidth = (PIECE_WIDTH * PUZZLE_SCALE) / 2
  const breakwaterCrestGeometry = new THREE.PlaneGeometry(
    breakwaterLength * 0.86,
    Math.min(breakwaterHalfWidth * 0.55, 0.022),
  )
  const sculptedSpillGeometry = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-breakwaterLength * 0.44, WATER_Y + 0.018, 0.08),
      new THREE.Vector3(0, WATER_Y + 0.022, 0.11),
      new THREE.Vector3(breakwaterLength * 0.44, WATER_Y + 0.018, 0.08),
    ]),
    compact ? 10 : 16,
    0.009,
    4,
    false,
  )
  const breakwaterMode = options.breakwaterMode ?? 'sculpted'
  const ownerMaterials: Record<Side, any> | null = options.ownerAccents
    ? {
        a: standard(THREE, OWNER_COLOR.a, {
          emissive: OWNER_COLOR.a,
          emissiveIntensity: 0.3,
          roughness: 0.55,
        }),
        b: standard(THREE, OWNER_COLOR.b, {
          emissive: OWNER_COLOR.b,
          emissiveIntensity: 0.3,
          roughness: 0.55,
        }),
      }
    : null
  let breakwaterMood = 1
  let piecesSignature = ''

  function pieceSeed(id: string) {
    let seed = 20261107
    for (let index = 0; index < id.length; index += 1) seed = (seed * 31 + id.charCodeAt(index)) >>> 0
    return seed
  }

  function addSculptedBreakwater(pieceGroup: Object3D) {
    const length = breakwaterLength
    const count = compact ? 6 : 8
    for (let index = 0; index < count; index += 1) {
      const t = index / (count - 1)
      const localX = lerp(-length * 0.46, length * 0.46, t)
      const localZ = (random() - 0.5) * PIECE_WIDTH * PUZZLE_SCALE * 1.15
      const size = rand(0.11, 0.16)
      const boulder = setShadow(new THREE.Mesh(boulderGeometry, rockMaterials[index % rockMaterials.length]))
      boulder.position.set(localX, WATER_Y + size * 0.36, localZ)
      boulder.scale.set(size * rand(0.9, 1.2), size * rand(0.72, 1.0), size * rand(0.88, 1.16))
      boulder.rotation.set(rand(-0.2, 0.2), rand(-Math.PI, Math.PI), rand(-0.14, 0.14))
      pieceGroup.add(boulder)
      if (index % 2 === 0 || index === count - 1) {
        const cap = setShadow(new THREE.Mesh(capGeometry, materials.rockLight))
        cap.position.set(localX + rand(-0.02, 0.02), WATER_Y + size * 0.82, localZ + rand(-0.02, 0.02))
        cap.scale.set(size * 0.58, size * 0.34, size * 0.58)
        cap.rotation.y = rand(0, Math.PI)
        pieceGroup.add(cap)
      }
      const collar = new THREE.Mesh(breakwaterFoamGeometry, materials.breakwaterFoam)
      collar.rotation.x = -Math.PI / 2
      collar.position.set(localX, WATER_Y + 0.02, localZ)
      collar.scale.setScalar(size * 1.7)
      collar.renderOrder = 4
      pieceGroup.add(collar)
    }
    const spill = new THREE.Mesh(sculptedSpillGeometry, materials.breakwaterFoam)
    spill.renderOrder = 4
    pieceGroup.add(spill)
  }

  // The game variant keeps every visible rock inside the authoritative piece footprint. The
  // centreline shelter rule is what the water reads, so the art must not widen that claim.
  function addFootprintBreakwater(pieceGroup: Object3D, piece: BreakWavesPiece) {
    const length = breakwaterLength
    const halfLength = length / 2
    const halfWidth = breakwaterHalfWidth
    const pieceRandom = mulberry32(pieceSeed(piece.id))
    const prand = (min: number, max: number) => min + (max - min) * pieceRandom()
    const count = compact ? 7 : 9
    for (let index = 0; index < count; index += 1) {
      const t = index / (count - 1)
      const size = prand(0.033, 0.042)
      const scaleX = size * prand(0.95, 1.05)
      const scaleY = size * prand(1.15, 1.45)
      const scaleZ = size * prand(0.6, 0.7)
      const rotationY = prand(-0.16, 0.16)
      // Y-only rotation keeps the bounding box predictable, so every rock can be clamped inside
      // the exact 0.18 x 0.03 game footprint even at the ends of the ridge.
      const extentX = Math.abs(scaleX * Math.cos(rotationY)) + Math.abs(scaleZ * Math.sin(rotationY))
      const extentZ = Math.abs(scaleX * Math.sin(rotationY)) + Math.abs(scaleZ * Math.cos(rotationY))
      const xLimit = Math.max(0, halfLength - extentX - 0.002)
      const zLimit = Math.max(0, halfWidth - extentZ - 0.002)
      const localX = clamp(lerp(-length * 0.44, length * 0.44, t) + prand(-0.003, 0.003), -xLimit, xLimit)
      const localZ = clamp(prand(-0.006, 0.006), -zLimit, zLimit)
      const boulder = setShadow(new THREE.Mesh(boulderGeometry, rockMaterials[index % rockMaterials.length]))
      boulder.position.set(localX, WATER_Y + scaleY * 0.38, localZ)
      boulder.scale.set(scaleX, scaleY, scaleZ)
      boulder.rotation.set(0, rotationY, 0)
      pieceGroup.add(boulder)
      if (index % 2 === 0 || index === count - 1) {
        const cap = setShadow(new THREE.Mesh(capGeometry, materials.rockLight))
        cap.position.set(localX, WATER_Y + scaleY * 0.95, localZ)
        cap.scale.set(scaleX * 0.52, scaleY * 0.3, scaleZ * 0.52)
        cap.rotation.y = prand(0, Math.PI)
        pieceGroup.add(cap)
      }
    }
    if (ownerMaterials) {
      const marker = setShadow(new THREE.Mesh(capGeometry, ownerMaterials[piece.owner]))
      marker.position.set(0, WATER_Y + 0.075, 0)
      marker.scale.set(0.036, 0.014, 0.026)
      pieceGroup.add(marker)
    }
    const crest = new THREE.Mesh(breakwaterCrestGeometry, materials.breakwaterFoam)
    crest.rotation.x = -Math.PI / 2
    crest.position.set(0, WATER_Y + 0.012, halfWidth * 0.42)
    crest.renderOrder = 4
    pieceGroup.add(crest)
  }

  function applyBreakwaterMood() {
    breakwaters.visible = breakwaterMood > 0.02
    breakwaters.scale.setScalar(0.76 + breakwaterMood * 0.24)
  }

  function rebuildBreakwaters(pieces: BreakWavesPiece[]) {
    breakwaters.clear()
    for (const piece of pieces) {
      if (!piece.placed) continue
      const pieceGroup = new THREE.Group()
      pieceGroup.position.set(worldX(piece.x), 0, worldZ(piece.z))
      pieceGroup.rotation.y = -(piece.rotation * Math.PI) / 180
      pieceGroup.userData.pieceId = piece.id
      if (breakwaterMode === 'footprint') addFootprintBreakwater(pieceGroup, piece)
      else addSculptedBreakwater(pieceGroup)
      breakwaters.add(pieceGroup)
    }
    applyBreakwaterMood()
  }

  function setPieces(pieces: BreakWavesPiece[]) {
    const signature = JSON.stringify(pieces)
    if (signature === piecesSignature) return
    piecesSignature = signature
    rebuildBreakwaters(pieces)
  }

  function setBreakwaterMood(mix: number) {
    breakwaterMood = clamp(mix, 0, 1)
    applyBreakwaterMood()
  }

  setPieces(options.pieces)

  // ----- Shared presentation ------------------------------------------------------
  let disposed = false

  function setShoreMood(west: number, east: number) {
    const values = { west: clamp(west, 0, 1), east: clamp(east, 0, 1) }
    for (const side of ['west', 'east'] as const) {
      const mix = values[side]
      shoreMaterials[side].foam.opacity = lerp(0.95, 0.35, mix)
      shoreMaterials[side].exposed.opacity = lerp(0.75, 0, mix)
      shoreMaterials[side].sediment.opacity = lerp(0.22, 0.015, mix)
    }
  }

  function update(timeSeconds: number, waveMix: number) {
    if (disposed) return
    const mix = clamp(waveMix, 0, 1)
    updateWater(timeSeconds, mix)
    updateFoam(timeSeconds, mix)
  }

  function dispose() {
    if (disposed) return
    disposed = true
    disposeObject(root)
    // Shared breakwater geometry may not be attached when every piece has been returned.
    breakwaterCrestGeometry.dispose()
    sculptedSpillGeometry.dispose()
    boulderGeometry.dispose()
    capGeometry.dispose()
    breakwaterFoamGeometry.dispose()
    foamTexture.dispose()
    shadowTexture?.dispose?.()
    if (ownerMaterials) {
      for (const material of Object.values(ownerMaterials)) material.dispose?.()
    }
  }

  setShoreMood(0, 0)
  setBreakwaterMood(1)

  return {
    root,
    breakwaters,
    update,
    setPieces,
    setBreakwaterMood,
    setShoreMood,
    dispose,
  }
}
