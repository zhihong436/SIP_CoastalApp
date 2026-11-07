// The marker-relative Break the waves miniature. The shared lighthouse-island diorama supplies the
// approved scenery and surf; this scene adds the game's exact target line, lenses, construction
// outlines, ghost and marker-relative picking. Puzzle coordinates stay the world's local coordinates:
// the shared model is simply scaled by 1 / PUZZLE_SCALE. Marker registration adds the local pitch
// and presentation scale; floor registration leaves the logical world neutral for a parent that
// owns physical placement.
import {
  CORRIDOR_HALF_WIDTH,
  PIECE_LENGTH,
  PIECE_WIDTH,
  TARGET_Z,
  WATER,
  WEST_TARGET_X,
  EAST_TARGET_X,
  pieceSheltersPoint,
  type BreakWavesPiece,
  type BreakWavesResult,
  type PieceId,
  type Side,
} from './breakWaves'
import {
  createLighthouseDiorama,
  PUZZLE_SCALE,
  type LighthouseDiorama,
} from '../../diorama/dioramaModel'

type Three = any
type Object3D = any
type Material = any

export type LensId = 'waves' | 'seabed'
export type SceneView = 'oblique' | 'top'
export type SceneRegistration = 'marker' | 'floor'

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
  setView(view: SceneView): void
  dispose(): void
}

const OBLIQUE_PITCH = (25 * Math.PI) / 180
const BASE_SCALE = 1.35
const WATER_PICK_Y = 0.03
const TARGET_MARK_Y = 0.06
const SHELTERED_COLOR = 0x8fffbd
const EXPOSED_COLOR = 0xff6a52
const NEUTRAL_MARK_COLOR = 0xfff3d7
const LENS_COLOR = 0x76dfd2
const BLOCKED_COLOR = 0xff3d2e
const SELECTION_COLOR: Record<Side, number> = { a: 0xff8fa1, b: 0xffd166 }

function disposeObject(object: Object3D) {
  const geometries = new Set<any>()
  const materials = new Set<any>()
  const textures = new Set<any>()
  object.traverse((child: any) => {
    if (child.geometry) geometries.add(child.geometry)
    const material: Material | Material[] | undefined = child.material
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

export function createBreakWavesScene(
  THREE: Three,
  anchorGroup: Object3D,
  renderer: any,
  camera: any,
  options: { mySide: Side; callbacks: SceneCallbacks; registration?: SceneRegistration },
): BreakWavesScene {
  const { mySide, callbacks } = options
  const registration = options.registration ?? 'marker'
  const reducedMotion =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const world = new THREE.Group()
  world.name = 'break-waves-world'
  if (registration === 'marker') {
    // The anchor's plane is XY with Z coming out of the card. Rotating makes Y up. The extra local
    // pitch is presentation only; hit conversion still goes through this same world transform.
    //
    // The model's seaward/front direction is local +z. A camera looking at the marker from the
    // anchor's +Z side must see that water face, not the landward island back. At PI/2 - pitch,
    // anchor z = model z * sin(pitch), so local +z maps to anchor +Z (the camera side) and local -z
    // stays on the landward side. PI/2 + pitch would reverse that and show the landward face.
    world.rotation.x = Math.PI / 2 - OBLIQUE_PITCH
    world.scale.setScalar(BASE_SCALE)
  } else {
    // The caller's anchor parent supplies translation, yaw, physical scale and floor lift. Keeping
    // this root at unit scale and zero rotation makes its local coordinates the exact puzzle frame.
    world.rotation.set(0, 0, 0)
    world.scale.setScalar(1)
  }
  anchorGroup.add(world)

  let currentView: SceneView = 'oblique'
  function setView(view: SceneView) {
    currentView = view
    // View choice tilts the marker presentation. A floor-registered scene stays floor-neutral; moving
    // the phone changes the real perspective instead.
    if (registration === 'marker') {
      world.rotation.x = Math.PI / 2 - (currentView === 'oblique' ? OBLIQUE_PITCH : 0)
      world.updateMatrixWorld(true)
    }
  }

  let interactive = false
  let selectedId: PieceId | null = null
  let piecesSignature = ''
  let waveSignature = ''
  let wavePieces: BreakWavesPiece[] = []
  let evaluation: BreakWavesResult | null = null
  let activeLens: LensId | null = null
  let ghost: Object3D | null = null
  let ghostFillMaterial: Material | null = null
  let ghostOutlineMaterial: Material | null = null
  let disposed = false

  // ----- Shared island model ------------------------------------------------------
  const model: LighthouseDiorama = createLighthouseDiorama(THREE, {
    pieces: [],
    compact: window.innerWidth < 700,
    shadows: true,
    groundShadow: false,
    maxAnisotropy: 1,
    zOffset: 0,
    breakwaterMode: 'footprint',
    ownerAccents: true,
    boats: [{ x: 0.02, z: 0.5, rotation: 0.25, scale: 1 }],
    shelterAt: (puzzleX, puzzleZ) =>
      wavePieces.some((piece) => pieceSheltersPoint(piece, puzzleX, puzzleZ)),
  })
  // One inverse transform takes every model and pick point back to exact puzzle coordinates.
  model.root.scale.setScalar(1 / PUZZLE_SCALE)
  model.root.name = 'diorama-model'
  world.add(model.root)

  // ----- Lighting ----------------------------------------------------------------
  // Warm key, cool fill and a lighthouse glow, matching the standalone preview. Shadows and tone
  // mapping are temporarily enabled on the caller's renderer and restored on disposal; size and
  // pixel ratio are never touched.
  world.add(new THREE.HemisphereLight(0xd9f2f1, 0x79634c, 1.35))
  const keyLight = new THREE.DirectionalLight(0xffe2b5, 3.6)
  keyLight.position.set(-5.2 / PUZZLE_SCALE, 7.6 / PUZZLE_SCALE, 4.8 / PUZZLE_SCALE)
  keyLight.target.position.set(0, 0.2 / PUZZLE_SCALE, 0.2 / PUZZLE_SCALE)
  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(1024, 1024)
  keyLight.shadow.camera.left = -2.4
  keyLight.shadow.camera.right = 2.4
  keyLight.shadow.camera.top = 2.4
  keyLight.shadow.camera.bottom = -2.4
  keyLight.shadow.camera.near = 0.1
  keyLight.shadow.camera.far = 12
  keyLight.shadow.bias = -0.0005
  keyLight.shadow.normalBias = 0.012
  world.add(keyLight)
  world.add(keyLight.target)
  const fillLight = new THREE.DirectionalLight(0x9ed8e2, 1.25)
  fillLight.position.set(5.4 / PUZZLE_SCALE, 4.4 / PUZZLE_SCALE, -4.5 / PUZZLE_SCALE)
  world.add(fillLight)
  const rimLight = new THREE.DirectionalLight(0xfff4d7, 0.7)
  rimLight.position.set(0.5 / PUZZLE_SCALE, 3.2 / PUZZLE_SCALE, -5.5 / PUZZLE_SCALE)
  world.add(rimLight)
  const lighthouseGlow = new THREE.PointLight(0xffbd68, 1.15, 3.5 / PUZZLE_SCALE, 2)
  lighthouseGlow.position.set(-1.55 / PUZZLE_SCALE, 1.76 / PUZZLE_SCALE, -0.95 / PUZZLE_SCALE)
  world.add(lighthouseGlow)

  // Three scales light positions through matrixWorld, but PointLight.distance and the directional
  // shadow camera's extent are world-space values. A floor parent can change physical size at any
  // time, so derive those values from its uniform world scale. The accepted world preview uses
  // 5.2 * model scale for shadow coverage, 3.5 * model scale for the glow and .012 normal bias at
  // the marker's 0.5 model scale. Marker registration keeps its existing fixed values untouched.
  const floorScale = new THREE.Vector3()
  let syncedFloorScale = 0
  function syncFloorLights() {
    if (registration !== 'floor') return
    const parentScale = Math.abs(anchorGroup.getWorldScale(floorScale).x)
    if (!Number.isFinite(parentScale) || parentScale <= 0) return
    if (Math.abs(parentScale - syncedFloorScale) < 1e-6) return
    syncedFloorScale = parentScale
    const modelScale = parentScale / PUZZLE_SCALE
    const shadowExtent = 5.2 * modelScale
    keyLight.shadow.camera.left = -shadowExtent
    keyLight.shadow.camera.right = shadowExtent
    keyLight.shadow.camera.top = shadowExtent
    keyLight.shadow.camera.bottom = -shadowExtent
    keyLight.shadow.camera.near = 0.1
    keyLight.shadow.camera.far = 8
    keyLight.shadow.camera.updateProjectionMatrix()
    keyLight.shadow.normalBias = 0.012 * (parentScale / BASE_SCALE)
    lighthouseGlow.distance = 3.5 * modelScale
  }
  syncFloorLights()

  // ----- Game overlays ------------------------------------------------------------
  const overlay = new THREE.Group()
  world.add(overlay)

  // Small target ticks replace the old rings and labels. They stay readable at phone size and
  // only take the result colours while the wave lens is on.
  const targetMarks: Array<{ material: Material; side: 'west' | 'east'; index: number }> = []
  const targetMarkGeometry = new THREE.CircleGeometry(0.017, 4)
  const targetBackingGeometry = new THREE.CircleGeometry(0.019, 4)
  const targetBackingMaterial = new THREE.MeshBasicMaterial({
    color: 0x082a32,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
  })
  const targetRoot = new THREE.Group()
  targetRoot.name = 'target-marks'
  overlay.add(targetRoot)
  for (const [side, values] of [
    ['west', WEST_TARGET_X],
    ['east', EAST_TARGET_X],
  ] as const) {
    values.forEach((x, index) => {
      const backing = new THREE.Mesh(targetBackingGeometry, targetBackingMaterial)
      backing.rotation.x = -Math.PI / 2
      backing.position.set(x, TARGET_MARK_Y - 0.0005, TARGET_Z)
      backing.renderOrder = 5
      targetRoot.add(backing)
      const material = new THREE.MeshBasicMaterial({
        color: NEUTRAL_MARK_COLOR,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      })
      const mark = new THREE.Mesh(targetMarkGeometry, material)
      mark.rotation.x = -Math.PI / 2
      mark.position.set(x, TARGET_MARK_Y, TARGET_Z)
      mark.renderOrder = 6
      targetRoot.add(mark)
      targetMarks.push({ material, side, index })
    })
  }

  const waveLens = new THREE.Group()
  waveLens.name = 'wave-lens'
  waveLens.visible = false
  overlay.add(waveLens)
  const arrowShape = new THREE.Shape()
  arrowShape.moveTo(0, 0.03)
  arrowShape.lineTo(0.018, -0.012)
  arrowShape.lineTo(0, -0.004)
  arrowShape.lineTo(-0.018, -0.012)
  arrowShape.closePath()
  const arrowGeometry = new THREE.ShapeGeometry(arrowShape)
  arrowGeometry.rotateX(-Math.PI / 2)
  const arrowMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff3d7,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
  })
  for (const x of [-0.32, -0.16, 0, 0.16, 0.32]) {
    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial)
    arrow.position.set(x, 0.062, 0.16)
    arrow.renderOrder = 5
    waveLens.add(arrow)
  }

  const seabedLens = new THREE.Group()
  seabedLens.name = 'seabed-lens'
  seabedLens.visible = false
  overlay.add(seabedLens)
  const corridorMaterial = new THREE.MeshBasicMaterial({
    color: LENS_COLOR,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
  })
  const corridor = new THREE.Mesh(
    new THREE.PlaneGeometry(CORRIDOR_HALF_WIDTH * 2, WATER.maxZ - WATER.minZ),
    corridorMaterial,
  )
  corridor.rotation.x = -Math.PI / 2
  corridor.position.set(0, 0.05, (WATER.maxZ + WATER.minZ) / 2)
  corridor.renderOrder = 4
  seabedLens.add(corridor)
  const corridorEdgeMaterial = new THREE.MeshBasicMaterial({
    color: 0xe8fff5,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    depthTest: false,
  })
  for (const x of [-CORRIDOR_HALF_WIDTH, CORRIDOR_HALF_WIDTH]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.002, WATER.maxZ - WATER.minZ), corridorEdgeMaterial)
    edge.position.set(x, 0.052, (WATER.maxZ + WATER.minZ) / 2)
    edge.renderOrder = 5
    seabedLens.add(edge)
  }

  // The enlarged island sea extends beyond the authoritative buildable rectangle. The seabed lens
  // therefore also shows the exact WATER boundary (and a faint area wash), distinct from the central
  // boat corridor. It is a lens overlay only; placement rules and the puzzle rectangle are unchanged.
  const buildableWidth = WATER.maxX - WATER.minX
  const buildableDepth = WATER.maxZ - WATER.minZ
  const buildableCenterZ = (WATER.maxZ + WATER.minZ) / 2
  const buildableAreaMaterial = new THREE.MeshBasicMaterial({
    color: 0xeaf6ef,
    transparent: true,
    opacity: 0.035,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
  })
  const buildableArea = new THREE.Mesh(
    new THREE.PlaneGeometry(buildableWidth, buildableDepth),
    buildableAreaMaterial,
  )
  buildableArea.name = 'buildable-water-area'
  buildableArea.rotation.x = -Math.PI / 2
  buildableArea.position.set(0, 0.044, buildableCenterZ)
  buildableArea.renderOrder = 3
  seabedLens.add(buildableArea)
  const buildableBoundaryMaterial = new THREE.LineBasicMaterial({
    color: 0xeaf6ef,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    depthTest: false,
  })
  const buildableBoundaryGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(WATER.minX, 0, WATER.minZ),
    new THREE.Vector3(WATER.maxX, 0, WATER.minZ),
    new THREE.Vector3(WATER.maxX, 0, WATER.maxZ),
    new THREE.Vector3(WATER.minX, 0, WATER.maxZ),
  ])
  const buildableBoundary = new THREE.LineLoop(buildableBoundaryGeometry, buildableBoundaryMaterial)
  buildableBoundary.name = 'buildable-water-boundary'
  buildableBoundary.position.y = 0.055
  buildableBoundary.renderOrder = 5
  seabedLens.add(buildableBoundary)

  // The pick surface is exactly the authoritative water rectangle. It is invisible but is hit by
  // the same raycaster and world transform as the scenery and construction.
  const pickGeometry = new THREE.PlaneGeometry(WATER.maxX - WATER.minX, WATER.maxZ - WATER.minZ)
  pickGeometry.rotateX(-Math.PI / 2)
  const waterPick = new THREE.Mesh(
    pickGeometry,
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
  )
  waterPick.position.set((WATER.minX + WATER.maxX) / 2, WATER_PICK_Y, (WATER.minZ + WATER.maxZ) / 2)
  overlay.add(waterPick)

  // ----- Construction overlays ----------------------------------------------------
  let pieceRoot = new THREE.Group()
  pieceRoot.name = 'piece-overlays'
  overlay.add(pieceRoot)
  let piecePickMeshes: Object3D[] = []
  const pieceVisuals = new Map<string, { outline: Object3D; material: Material }>()
  const pickGeometryShared = new THREE.BoxGeometry(PIECE_LENGTH + 0.035, 0.07, PIECE_WIDTH + 0.045)
  const pickMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
  const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-PIECE_LENGTH / 2 - 0.002, 0, -PIECE_WIDTH / 2 - 0.003),
    new THREE.Vector3(PIECE_LENGTH / 2 + 0.002, 0, -PIECE_WIDTH / 2 - 0.003),
    new THREE.Vector3(PIECE_LENGTH / 2 + 0.002, 0, PIECE_WIDTH / 2 + 0.003),
    new THREE.Vector3(-PIECE_LENGTH / 2 - 0.002, 0, PIECE_WIDTH / 2 + 0.003),
  ])
  const ownerOutlineMaterials: Record<Side, Material> = {
    a: new THREE.LineBasicMaterial({
      color: SELECTION_COLOR.a,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      depthTest: false,
    }),
    b: new THREE.LineBasicMaterial({
      color: SELECTION_COLOR.b,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      depthTest: false,
    }),
  }

  function rebuildPieceOverlays(pieces: BreakWavesPiece[]) {
    pieceRoot.clear()
    pieceVisuals.clear()
    piecePickMeshes = []
    for (const piece of pieces) {
      if (!piece.placed || piece.owner !== mySide) continue
      const group = new THREE.Group()
      group.position.set(piece.x, 0, piece.z)
      group.rotation.y = -(piece.rotation * Math.PI) / 180
      const outline = new THREE.LineLoop(outlineGeometry, ownerOutlineMaterials[piece.owner])
      outline.position.y = 0.056
      outline.visible = piece.id === selectedId
      outline.renderOrder = 8
      group.add(outline)
      const pick = new THREE.Mesh(pickGeometryShared, pickMaterial)
      pick.position.y = 0.02
      pick.userData.pieceId = piece.id
      group.add(pick)
      pieceRoot.add(group)
      piecePickMeshes.push(pick)
      pieceVisuals.set(piece.id, { outline, material: ownerOutlineMaterials[piece.owner] })
    }
  }

  function rebuildPieces(pieces: BreakWavesPiece[]) {
    rebuildPieceOverlays(pieces)
    model.setPieces(pieces)
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
    const sheltered = (values: readonly number[]) =>
      values.filter((x) => pieces.some((piece) => pieceSheltersPoint(piece, x, TARGET_Z))).length / values.length
    model.setShoreMood(sheltered(WEST_TARGET_X), sheltered(EAST_TARGET_X))
  }

  function setSelected(pieceId: PieceId | null) {
    selectedId = pieceId
    for (const [id, visual] of pieceVisuals) visual.outline.visible = id === pieceId
  }

  function setGhost(nextGhost: GhostPiece | null) {
    if (!nextGhost) {
      if (ghost) ghost.visible = false
      return
    }
    if (!ghost) {
      const group = new THREE.Group()
      ghostFillMaterial = new THREE.MeshBasicMaterial({
        color: 0xffe7a6,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const fillGeometry = new THREE.PlaneGeometry(PIECE_LENGTH, PIECE_WIDTH)
      fillGeometry.rotateX(-Math.PI / 2)
      const fill = new THREE.Mesh(fillGeometry, ghostFillMaterial)
      fill.position.y = 0.052
      fill.renderOrder = 7
      group.add(fill)
      ghostOutlineMaterial = new THREE.LineBasicMaterial({
        color: 0xffe7a6,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        depthTest: false,
      })
      const outline = new THREE.LineLoop(outlineGeometry, ghostOutlineMaterial)
      outline.position.y = 0.058
      outline.renderOrder = 8
      group.add(outline)
      ghost = group
      overlay.add(ghost)
    }
    ghost.visible = true
    ghost.position.set(nextGhost.x, 0, nextGhost.z)
    ghost.rotation.y = -(nextGhost.rotation * Math.PI) / 180
  }

  function applyTargetStyle() {
    targetBackingMaterial.opacity = activeLens === 'waves' ? 0.62 : 0.22
    for (const marker of targetMarks) {
      if (activeLens === 'waves' && evaluation) {
        const flags = marker.side === 'west' ? evaluation.west_targets : evaluation.east_targets
        const sheltered = flags[marker.index] ?? false
        marker.material.color.setHex(sheltered ? SHELTERED_COLOR : EXPOSED_COLOR)
        marker.material.opacity = 1
      } else {
        marker.material.color.setHex(NEUTRAL_MARK_COLOR)
        marker.material.opacity = 0.35
      }
    }
  }

  function setLens(nextLens: LensId | null) {
    activeLens = nextLens
    waveLens.visible = nextLens === 'waves'
    seabedLens.visible = nextLens === 'seabed'
    applyTargetStyle()
  }

  function setEvaluation(result: BreakWavesResult) {
    evaluation = result
    applyTargetStyle()
    corridorMaterial.color.setHex(result.corridor_clear ? LENS_COLOR : BLOCKED_COLOR)
    corridorMaterial.opacity = result.corridor_clear ? 0.1 : 0.38
    corridorEdgeMaterial.color.setHex(result.corridor_clear ? 0xe8fff5 : 0xffa89a)
  }

  function setInteractive(live: boolean) {
    interactive = live
    if (renderer.domElement.style) renderer.domElement.style.cursor = live ? 'pointer' : 'default'
  }

  // ----- Pointer handling ---------------------------------------------------------
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

    const waterHits = raycaster.intersectObject(waterPick, false)
    if (waterHits.length > 0) {
      const local = world.worldToLocal(waterHits[0].point.clone())
      // The pick plane is exactly the authoritative rectangle; keep a tiny numeric guard.
      if (
        local.x < WATER.minX - 0.0001 ||
        local.x > WATER.maxX + 0.0001 ||
        local.z < WATER.minZ - 0.0001 ||
        local.z > WATER.maxZ + 0.0001
      ) {
        return
      }
      callbacks.onWaterTap({ x: local.x, z: local.z })
    }
  }

  const previousCursor = renderer.domElement.style?.cursor ?? ''
  const previousTouchAction = renderer.domElement.style?.touchAction ?? ''
  if (renderer.domElement.style) {
    renderer.domElement.style.touchAction = 'none'
    renderer.domElement.style.cursor = 'default'
  }
  renderer.domElement.addEventListener('pointerdown', pointerDown)
  renderer.domElement.addEventListener('pointerup', pointerUp)
  renderer.domElement.addEventListener('pointercancel', pointerCancel)

  // ----- Animation and disposal ---------------------------------------------------
  function update(timeSeconds: number) {
    if (disposed) return
    syncFloorLights()
    const visualTime = reducedMotion ? 0 : timeSeconds
    model.update(visualTime, 1)
    if (selectedId !== null) {
      const selected = pieceVisuals.get(selectedId)
      if (selected) selected.material.opacity = 0.55 + Math.sin(visualTime * 4.2) * 0.22
    }
    if (ghost?.visible && ghostFillMaterial && ghostOutlineMaterial) {
      ghostFillMaterial.opacity = 0.14 + Math.sin(visualTime * 3.4) * 0.04
      ghostOutlineMaterial.opacity = 0.72 + Math.sin(visualTime * 3.4) * 0.18
    }
    if (evaluation && !evaluation.corridor_clear) {
      corridorMaterial.opacity = 0.38 + Math.sin(visualTime * 4.5) * 0.05
    }
  }

  // The renderer belongs to the caller. Only presentation state is touched here and restored on
  // disposal; the canvas, camera and WebGL context are never created, stopped or lost.
  const previousToneMapping = renderer.toneMapping
  const previousExposure = renderer.toneMappingExposure
  const previousShadowMapEnabled = renderer.shadowMap.enabled
  const previousShadowMapType = renderer.shadowMap.type
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.03
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  setView('oblique')
  setInteractive(false)
  setLens(null)
  setWavePieces([])

  function dispose() {
    if (disposed) return
    disposed = true
    renderer.domElement.removeEventListener('pointerdown', pointerDown)
    renderer.domElement.removeEventListener('pointerup', pointerUp)
    renderer.domElement.removeEventListener('pointercancel', pointerCancel)
    model.dispose()
    disposeObject(overlay)
    // These overlay resources may be unattached when a player has no placed pieces or ghost.
    pickGeometryShared.dispose()
    pickMaterial.dispose()
    outlineGeometry.dispose()
    ownerOutlineMaterials.a.dispose()
    ownerOutlineMaterials.b.dispose()
    ghostFillMaterial?.dispose?.()
    ghostOutlineMaterial?.dispose?.()
    keyLight.shadow.map?.dispose?.()
    keyLight.shadow.map = null
    anchorGroup.remove(world)
    if (renderer.domElement.style) {
      renderer.domElement.style.cursor = previousCursor
      renderer.domElement.style.touchAction = previousTouchAction
    }
    renderer.toneMapping = previousToneMapping
    renderer.toneMappingExposure = previousExposure
    renderer.shadowMap.enabled = previousShadowMapEnabled
    renderer.shadowMap.type = previousShadowMapType
  }

  return {
    update,
    setInteractive,
    setPieces,
    setWavePieces,
    setSelected,
    setGhost,
    setLens,
    setEvaluation,
    setView,
    dispose,
  }
}
