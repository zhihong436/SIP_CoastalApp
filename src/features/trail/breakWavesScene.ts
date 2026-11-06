// The marker-relative Break the waves miniature. It is deliberately a readable, simplified model:
// the same piece-centreline shelter geometry that the database evaluates drives the visible water.
// Three.js is loaded at runtime from the pinned local vendor module, so it is untyped here.
import {
  COAST_Z,
  CORRIDOR_HALF_WIDTH,
  EAST_TARGET_X,
  PIECE_LENGTH,
  PIECE_WIDTH,
  TARGET_Z,
  WATER,
  WEST_TARGET_X,
  pieceSheltersPoint,
  type BreakWavesPiece,
  type BreakWavesResult,
  type PieceId,
  type Side,
} from './breakWaves'

type Three = any
type Object3D = any
type Material = any

export type LensId = 'waves' | 'seabed'

export interface GhostPiece {
  owner: Side
  x: number
  z: number
  rotation: number
}

interface SceneCallbacks {
  onSelectPiece(pieceId: PieceId): void
  onWaterTap(point: { x: number; z: number }): void
}

export interface BreakWavesScene {
  update(timeSeconds: number): void
  setInteractive(live: boolean): void
  setPieces(pieces: BreakWavesPiece[]): void
  setWavePieces(pieces: BreakWavesPiece[]): void
  setSelected(pieceId: PieceId | null): void
  setGhost(ghost: GhostPiece | null): void
  setLens(lens: LensId | null): void
  setEvaluation(result: BreakWavesResult): void
  dispose(): void
}

const OWNER_COLOR: Record<Side, number> = { a: 0xc23a4f, b: 0xb98a2e }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function disposeObject(object: Object3D) {
  object.traverse((child: any) => {
    child.geometry?.dispose()
    const material: Material | Material[] | undefined = child.material
    const materials = Array.isArray(material) ? material : material ? [material] : []
    for (const item of materials) {
      item.map?.dispose()
      item.dispose?.()
    }
  })
}

function standardMaterial(THREE: Three, color: number, options: Record<string, unknown> = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.02,
    flatShading: true,
    ...options,
  })
}

function makeLabel(THREE: Three, text: string, color: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 80
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = 'rgba(255, 250, 239, 0.94)'
    context.fillRect(16, 14, 128, 52)
    context.fillStyle = `#${color.toString(16).padStart(6, '0')}`
    context.font = '700 30px system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, 80, 41)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }),
  )
  sprite.scale.set(0.085, 0.0425, 1)
  return sprite
}

export function createBreakWavesScene(
  THREE: Three,
  anchorGroup: Object3D,
  renderer: any,
  camera: any,
  options: { mySide: Side; callbacks: SceneCallbacks },
): BreakWavesScene {
  const { mySide, callbacks } = options
  const world = new THREE.Group()
  // The anchor's plane is XY with Z coming out of the card. Rotating makes Y up, like the experiment.
  world.rotation.x = Math.PI / 2
  world.scale.setScalar(0.9)
  anchorGroup.add(world)

  const animated: Array<(time: number) => void> = []
  let interactive = false
  let selectedId: PieceId | null = null
  let piecesSignature = ''
  let waveSignature = ''
  let wavePieces: BreakWavesPiece[] = []
  let evaluation: BreakWavesResult | null = null
  let ghost: Object3D | null = null

  // ----- Lighting -----------------------------------------------------------------
  world.add(new THREE.HemisphereLight(0xe8fff8, 0x816743, 4.3))
  const keyLight = new THREE.DirectionalLight(0xfff3d0, 4.1)
  keyLight.position.set(-0.5, 1.15, 0.7)
  world.add(keyLight)
  const rimLight = new THREE.DirectionalLight(0x63d7d0, 2.4)
  rimLight.position.set(0.8, 0.5, -0.6)
  world.add(rimLight)
  const fillLight = new THREE.DirectionalLight(0xe9fff9, 2.1)
  fillLight.position.set(0, 0.65, 1)
  world.add(fillLight)

  // ----- Sea ----------------------------------------------------------------------
  const seaGeometry = new THREE.PlaneGeometry(0.94, 0.7, 48, 36)
  seaGeometry.rotateX(-Math.PI / 2)
  const seaPosition = seaGeometry.attributes.position
  const seaVertexCount = seaPosition.count
  const seaBaseX = new Float32Array(seaVertexCount)
  const seaBaseZ = new Float32Array(seaVertexCount)
  const seaColors = new Float32Array(seaVertexCount * 3)
  const deepColor = new THREE.Color(0x0f657b)
  const shallowColor = new THREE.Color(0x54c6bf)
  const tempColor = new THREE.Color()

  for (let i = 0; i < seaVertexCount; i += 1) {
    const x = seaPosition.getX(i) as number
    const z = seaPosition.getZ(i) as number
    seaBaseX[i] = x
    seaBaseZ[i] = z
    const shallow = 1 - smoothstep(COAST_Z, 0.34, z)
    tempColor.copy(deepColor).lerp(shallowColor, shallow * 0.78)
    seaColors[i * 3] = tempColor.r
    seaColors[i * 3 + 1] = tempColor.g
    seaColors[i * 3 + 2] = tempColor.b
  }
  seaGeometry.setAttribute('color', new THREE.BufferAttribute(seaColors, 3))
  const seaMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.32,
    metalness: 0.04,
    flatShading: true,
    side: THREE.DoubleSide,
  })
  const sea = new THREE.Mesh(seaGeometry, seaMaterial)
  sea.position.y = 0.014
  world.add(sea)

  function shelterAt(x: number, z: number) {
    return wavePieces.some((piece) => pieceSheltersPoint(piece, x, z))
  }

  function waterHeight(x: number, z: number, time: number) {
    const openSea = 0.55 + 0.45 * smoothstep(COAST_Z, 0.3, z)
    const baseline = 0.033 * openSea
    const calm = shelterAt(x, z) ? 0.14 : 1
    const amplitude = baseline * calm
    // The swell travels towards negative z. The same phase runs across the whole miniature.
    const swell =
      Math.sin(z * 34 + time * 1.8 + x * 2.4) * 0.58 +
      Math.sin(z * 51 + time * 2.4 + x * 4.9 + 1.2) * 0.27 +
      Math.sin(z * 23 + time * 1.3 - x * 3.1 + 0.5) * 0.15
    return amplitude * swell
  }

  const foamBase: Array<{ x: number; z: number }> = []
  for (let i = 0; i < 34; i += 1) {
    const x = -0.42 + (i / 33) * 0.84
    foamBase.push({ x, z: TARGET_Z + 0.015 + Math.sin(i * 2.4) * 0.012 })
  }
  for (let i = 0; i < 24; i += 1) {
    const x = -0.4 + ((i * 37) % 100) / 125
    const z = -0.04 + ((i * 53) % 100) / 280
    foamBase.push({ x, z })
  }
  const foamGeometry = new THREE.BufferGeometry()
  foamGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(foamBase.length * 3), 3))
  const foam = new THREE.Points(
    foamGeometry,
    new THREE.PointsMaterial({ color: 0xf2fff8, size: 0.008, transparent: true, opacity: 0.72, depthWrite: false }),
  )
  foam.position.y = 0.021
  world.add(foam)

  animated.push((time) => {
    const position = seaGeometry.attributes.position
    for (let i = 0; i < seaVertexCount; i += 1) {
      position.setY(i, waterHeight(seaBaseX[i], seaBaseZ[i], time))
    }
    position.needsUpdate = true
    seaGeometry.computeVertexNormals()

    const foamPosition = foamGeometry.attributes.position
    for (let i = 0; i < foamBase.length; i += 1) {
      const point = foamBase[i]
      foamPosition.setXYZ(i, point.x, waterHeight(point.x, point.z, time) + 0.009, point.z)
    }
    foamPosition.needsUpdate = true
  })

  // ----- Base, land and beaches ---------------------------------------------------
  const basePlate = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.022, 0.8),
    standardMaterial(THREE, 0xd8bd86, { roughness: 0.97 }),
  )
  basePlate.position.y = -0.012
  world.add(basePlate)
  const baseRim = new THREE.Mesh(
    new THREE.BoxGeometry(1.02, 0.008, 0.82),
    standardMaterial(THREE, 0x0a3c4b, { roughness: 0.9 }),
  )
  baseRim.position.y = -0.028
  world.add(baseRim)

  const land = new THREE.Mesh(
    new THREE.BoxGeometry(0.94, 0.02, 0.18),
    standardMaterial(THREE, 0xe8ca88, { roughness: 0.98 }),
  )
  land.position.set(0, 0.02, -0.29)
  world.add(land)
  const green = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.024, 0.075),
    standardMaterial(THREE, 0x5ca46d, { roughness: 0.96 }),
  )
  green.position.set(0, 0.031, -0.345)
  world.add(green)

  const beachMaterial = standardMaterial(THREE, 0xf1d799, { roughness: 0.98 })
  for (const side of [-1, 1]) {
    const beach = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.012, 0.042), beachMaterial)
    beach.position.set(side * 0.26, 0.034, COAST_Z + 0.005)
    world.add(beach)
  }

  const westLabel = makeLabel(THREE, 'West beach', 0x0b6e70)
  westLabel.position.set(-0.26, 0.085, -0.265)
  westLabel.scale.set(0.12, 0.06, 1)
  world.add(westLabel)
  const eastLabel = makeLabel(THREE, 'East beach', 0x0b6e70)
  eastLabel.position.set(0.26, 0.085, -0.265)
  eastLabel.scale.set(0.12, 0.06, 1)
  world.add(eastLabel)

  // A few land shapes make the coastline read as a place rather than a diagram.
  const shrubMaterial = standardMaterial(THREE, 0x317953, { roughness: 0.98 })
  for (const [x, z, size] of [
    [-0.16, -0.33, 0.022],
    [-0.09, -0.36, 0.017],
    [0.05, -0.34, 0.02],
    [0.17, -0.37, 0.018],
    [0.33, -0.33, 0.016],
  ]) {
    const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), shrubMaterial)
    shrub.position.set(x, 0.043 + size * 0.5, z)
    world.add(shrub)
  }

  // ----- Target marks -------------------------------------------------------------
  const targetRingGeometry = new THREE.RingGeometry(0.006, 0.011, 18)
  for (const values of [WEST_TARGET_X, EAST_TARGET_X]) {
    for (const x of values) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xf6e6b8,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const ring = new THREE.Mesh(targetRingGeometry, material)
      ring.rotation.x = -Math.PI / 2
      ring.position.set(x, 0.038, TARGET_Z)
      world.add(ring)
    }
  }

  // ----- Lenses -------------------------------------------------------------------
  const waveLens = new THREE.Group()
  waveLens.position.y = 0.045
  world.add(waveLens)
  const riskRingGeometry = new THREE.RingGeometry(0.011, 0.018, 22)
  const riskMarkers: Array<{ material: any; side: 'west' | 'east'; index: number }> = []
  for (const [side, values] of [
    ['west', WEST_TARGET_X],
    ['east', EAST_TARGET_X],
  ] as const) {
    values.forEach((x, index) => {
      const material = new THREE.MeshBasicMaterial({
        color: 0xd45a59,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const ring = new THREE.Mesh(riskRingGeometry, material)
      ring.rotation.x = -Math.PI / 2
      ring.position.set(x, 0.002, TARGET_Z)
      waveLens.add(ring)
      riskMarkers.push({ material, side, index })
    })
  }

  const arrowShape = new THREE.Shape()
  arrowShape.moveTo(0, 0.03)
  arrowShape.lineTo(0.018, -0.012)
  arrowShape.lineTo(0, -0.004)
  arrowShape.lineTo(-0.018, -0.012)
  arrowShape.closePath()
  const arrowGeometry = new THREE.ShapeGeometry(arrowShape)
  arrowGeometry.rotateX(-Math.PI / 2)
  const arrowMaterial = new THREE.MeshBasicMaterial({
    color: 0xf7f0d0,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  for (const x of [-0.36, -0.2, 0, 0.2, 0.36]) {
    for (const z of [0.23, 0.11]) {
      const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial)
      arrow.position.set(x, 0.002, z)
      waveLens.add(arrow)
    }
  }

  const seabedLens = new THREE.Group()
  seabedLens.position.y = 0.043
  world.add(seabedLens)
  const corridorMaterial = new THREE.MeshBasicMaterial({
    color: 0x68d8c7,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const corridor = new THREE.Mesh(
    new THREE.PlaneGeometry(CORRIDOR_HALF_WIDTH * 2, WATER.maxZ - WATER.minZ),
    corridorMaterial,
  )
  corridor.rotation.x = -Math.PI / 2
  corridor.position.set(0, 0, (WATER.maxZ + WATER.minZ) / 2)
  seabedLens.add(corridor)
  const corridorEdgeMaterial = new THREE.MeshBasicMaterial({ color: 0xe8fff5, transparent: true, opacity: 0.72 })
  for (const x of [-CORRIDOR_HALF_WIDTH, CORRIDOR_HALF_WIDTH]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.002, WATER.maxZ - WATER.minZ), corridorEdgeMaterial)
    edge.position.set(x, 0.002, (WATER.maxZ + WATER.minZ) / 2)
    seabedLens.add(edge)
  }
  const buildEdgeMaterial = new THREE.MeshBasicMaterial({ color: 0x8fe5d9, transparent: true, opacity: 0.72 })
  for (const x of [WATER.minX, WATER.maxX]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.002, WATER.maxZ - WATER.minZ), buildEdgeMaterial)
    edge.position.set(x, 0.002, (WATER.maxZ + WATER.minZ) / 2)
    seabedLens.add(edge)
  }
  for (const z of [WATER.minZ, WATER.maxZ]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(WATER.maxX - WATER.minX, 0.002, 0.003), buildEdgeMaterial)
    edge.position.set(0, 0.002, z)
    seabedLens.add(edge)
  }
  const corridorLabel = makeLabel(THREE, 'Boat entrance', 0x0b6e70)
  corridorLabel.position.set(0, 0.09, 0.03)
  corridorLabel.scale.set(0.13, 0.065, 1)
  seabedLens.add(corridorLabel)

  // ----- Boat ---------------------------------------------------------------------
  const boat = new THREE.Group()
  boat.position.set(0, 0.048, -0.13)
  world.add(boat)
  const hull = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.018, 0.035, 3, 6),
    standardMaterial(THREE, 0xc23a4f, { roughness: 0.8 }),
  )
  hull.rotation.z = Math.PI / 2
  hull.scale.y = 0.6
  boat.add(hull)
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0025, 0.0025, 0.075, 5),
    standardMaterial(THREE, 0x7d4f2c, { roughness: 1 }),
  )
  mast.position.y = 0.04
  boat.add(mast)
  const sailGeometry = new THREE.BufferGeometry()
  sailGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.018, 0, 0.036, 0.068, 0, 0, 0.068, 0], 3))
  sailGeometry.computeVertexNormals()
  const sail = new THREE.Mesh(
    sailGeometry,
    new THREE.MeshStandardMaterial({ color: 0xf7e7bd, side: THREE.DoubleSide, roughness: 0.9 }),
  )
  sail.position.y = 0.005
  boat.add(sail)
  animated.push((time) => {
    boat.position.y = 0.048 + Math.sin(time * 1.5) * 0.004
    boat.rotation.z = Math.sin(time * 1.2) * 0.025
  })

  // ----- Pieces -------------------------------------------------------------------
  let pieceRoot = new THREE.Group()
  world.add(pieceRoot)
  let piecePickMeshes: Object3D[] = []
  const pieceVisuals = new Map<string, { group: Object3D; ring: Object3D }>()

  function buildPieceVisual(piece: BreakWavesPiece) {
    const group = new THREE.Group()
    group.position.set(piece.x, 0.05, piece.z)
    // Three's Y rotation uses the opposite sense from the 2D marker rotation helper.
    group.rotation.y = -(piece.rotation * Math.PI) / 180

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(PIECE_LENGTH, 0.012, PIECE_WIDTH + 0.01),
      standardMaterial(THREE, 0x4d595d, { roughness: 1 }),
    )
    base.position.y = 0.002
    group.add(base)

    const stoneMaterial = standardMaterial(THREE, 0x939d9b, { roughness: 0.95 })
    const stoneLight = standardMaterial(THREE, 0xb9b6a7, { roughness: 0.95 })
    for (let i = 0; i < 4; i += 1) {
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(0.038, 0.024, i === 1 ? 0.038 : 0.032),
        i % 2 === 0 ? stoneMaterial : stoneLight,
      )
      block.position.set((i - 1.5) * 0.041, 0.015, (i % 2 === 0 ? 1 : -1) * 0.002)
      block.rotation.y = (i - 1.5) * 0.08
      group.add(block)
    }

    const ownerStrip = new THREE.Mesh(
      new THREE.BoxGeometry(PIECE_LENGTH, 0.006, 0.008),
      new THREE.MeshStandardMaterial({
        color: OWNER_COLOR[piece.owner],
        emissive: OWNER_COLOR[piece.owner],
        emissiveIntensity: 0.18,
        roughness: 0.6,
      }),
    )
    ownerStrip.position.set(0, 0.035, 0.014)
    group.add(ownerStrip)

    const label = makeLabel(THREE, piece.id.toUpperCase(), OWNER_COLOR[piece.owner])
    label.position.set(0, 0.095, 0)
    label.scale.set(0.075, 0.0375, 1)
    group.add(label)

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.085, 0.1, 30),
      new THREE.MeshBasicMaterial({
        color: OWNER_COLOR[piece.owner],
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = -0.006
    ring.visible = piece.id === selectedId
    group.add(ring)

    if (piece.owner === mySide) {
      const pick = new THREE.Mesh(
        new THREE.BoxGeometry(PIECE_LENGTH + 0.035, 0.07, PIECE_WIDTH + 0.045),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
      )
      pick.position.y = 0.02
      pick.userData.pieceId = piece.id
      group.add(pick)
      piecePickMeshes.push(pick)
    }

    pieceRoot.add(group)
    pieceVisuals.set(piece.id, { group, ring })
  }

  function rebuildPieces(pieces: BreakWavesPiece[]) {
    world.remove(pieceRoot)
    disposeObject(pieceRoot)
    pieceRoot = new THREE.Group()
    world.add(pieceRoot)
    pieceVisuals.clear()
    piecePickMeshes = []
    for (const piece of pieces) {
      if (piece.placed) buildPieceVisual(piece)
    }
  }

  function setPieces(pieces: BreakWavesPiece[]) {
    const signature = JSON.stringify(pieces)
    if (signature === piecesSignature) return
    piecesSignature = signature
    rebuildPieces(pieces)
  }

  function setWavePieces(pieces: BreakWavesPiece[]) {
    const signature = JSON.stringify(pieces)
    if (signature === waveSignature) return
    waveSignature = signature
    wavePieces = pieces
  }

  function setSelected(pieceId: PieceId | null) {
    selectedId = pieceId
    for (const [id, visual] of pieceVisuals) {
      visual.ring.visible = id === pieceId
    }
  }

  function setGhost(nextGhost: GhostPiece | null) {
    if (!nextGhost) {
      if (ghost) ghost.visible = false
      return
    }
    if (!ghost) {
      const group = new THREE.Group()
      const material = new THREE.MeshBasicMaterial({
        color: 0xffe7a6,
        transparent: true,
        opacity: 0.56,
        wireframe: true,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(PIECE_LENGTH, 0.012, PIECE_WIDTH), material)
      mesh.position.y = 0.012
      group.add(mesh)
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.085, 0.1, 30),
        new THREE.MeshBasicMaterial({
          color: 0xffe7a6,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.004
      group.add(ring)
      ghost = group
      world.add(ghost)
    }
    ghost.visible = true
    ghost.position.set(nextGhost.x, 0.05, nextGhost.z)
    ghost.rotation.y = -(nextGhost.rotation * Math.PI) / 180
  }

  function setLens(nextLens: LensId | null) {
    waveLens.visible = nextLens === 'waves'
    seabedLens.visible = nextLens === 'seabed'
  }

  function setEvaluation(result: BreakWavesResult) {
    evaluation = result
    for (const marker of riskMarkers) {
      const flags = marker.side === 'west' ? result.west_targets : result.east_targets
      const sheltered = flags[marker.index] ?? false
      marker.material.color.setHex(sheltered ? 0x26836b : 0xd45a59)
      marker.material.opacity = sheltered ? 0.82 : 1
    }
    corridorMaterial.color.setHex(result.corridor_clear ? 0x68d8c7 : 0xd45a59)
    corridorMaterial.opacity = result.corridor_clear ? 0.2 : 0.3
  }

  function setInteractive(live: boolean) {
    interactive = live
    if (renderer.domElement.style) renderer.domElement.style.cursor = live ? 'pointer' : 'default'
  }

  // The CSS3D layer is unused, so taps reach the WebGL canvas underneath it.
  if (renderer.domElement.style) {
    renderer.domElement.style.touchAction = 'none'
    renderer.domElement.style.cursor = 'default'
  }

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let pointerStart: { x: number; y: number } | null = null

  function pointerDown(event: PointerEvent) {
    pointerStart = { x: event.clientX, y: event.clientY }
  }

  function pointerCancel() {
    pointerStart = null
  }

  function pointerUp(event: PointerEvent) {
    if (!pointerStart) return
    const travel = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)
    pointerStart = null
    if (travel > 12 || !interactive || !anchorGroup.visible) return

    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    anchorGroup.updateMatrixWorld(true)
    world.updateMatrixWorld(true)
    raycaster.setFromCamera(pointer, camera)

    const pieceHits = raycaster.intersectObjects(piecePickMeshes, false)
    if (pieceHits.length > 0) {
      callbacks.onSelectPiece(pieceHits[0].object.userData.pieceId as PieceId)
      return
    }

    const seaHits = raycaster.intersectObject(sea, false)
    if (seaHits.length > 0) {
      const local = world.worldToLocal(seaHits[0].point.clone())
      callbacks.onWaterTap({ x: local.x, z: local.z })
    }
  }

  renderer.domElement.addEventListener('pointerdown', pointerDown)
  renderer.domElement.addEventListener('pointerup', pointerUp)
  renderer.domElement.addEventListener('pointercancel', pointerCancel)

  function update(timeSeconds: number) {
    for (const animation of animated) animation(timeSeconds)
    if (selectedId !== null) {
      const selected = pieceVisuals.get(selectedId)
      if (selected) selected.ring.scale.setScalar(1 + Math.sin(timeSeconds * 4.2) * 0.08)
    }
    if (ghost?.visible) ghost.position.y = 0.05 + Math.sin(timeSeconds * 3.4) * 0.002
    if (evaluation && !evaluation.corridor_clear) {
      corridorMaterial.opacity = 0.22 + Math.sin(timeSeconds * 4.5) * 0.1
    }
  }

  function dispose() {
    renderer.domElement.removeEventListener('pointerdown', pointerDown)
    renderer.domElement.removeEventListener('pointerup', pointerUp)
    renderer.domElement.removeEventListener('pointercancel', pointerCancel)
    disposeObject(world)
    anchorGroup.remove(world)
  }

  setInteractive(false)
  setLens(null)
  setWavePieces([])

  return {
    update,
    setInteractive,
    setPieces,
    setWavePieces,
    setSelected,
    setGhost,
    setLens,
    setEvaluation,
    dispose,
  }
}
