// Isolated world-tracking feasibility experiment. This page uses the local 8th Wall engine binary
// and the local Three.js 0.160 module, then places the approved lighthouse-island model on the
// engine's single estimated floor plane (Y = 0). It is not the paired game: no account, save,
// sync, analytics or puzzle mutation is used here.
import './world.css'
import {
  createLighthouseDiorama,
  type LighthouseDiorama,
} from '../diorama/dioramaModel'
import {
  evaluateBreakWaves,
  pieceSheltersPoint,
  type BreakWavesPiece,
} from '../features/trail/breakWaves'

type Three = any
type Engine = any
type EngineModule = any

const w = window as any

const protectedPieces: BreakWavesPiece[] = [
  { id: 'a1', owner: 'a', placed: true, x: -0.32, z: 0.22, rotation: 0 },
  { id: 'a2', owner: 'a', placed: true, x: -0.2, z: 0.14, rotation: 0 },
  { id: 'b1', owner: 'b', placed: true, x: 0.32, z: 0.22, rotation: 0 },
  { id: 'b2', owner: 'b', placed: true, x: 0.2, z: 0.14, rotation: 0 },
]
const exposedPieces: BreakWavesPiece[] = []

const ENGINE_TIMEOUT_MS = 30_000
const START_TIMEOUT_MS = 45_000
const DEFAULT_MODEL_SCALE = 0.24
const INITIAL_CAMERA = { x: 0, y: 1.45, z: 2.2 }
const TAP_MOVE_LIMIT = 12
const MAX_PLACEMENT_DISTANCE = 8

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing #${id}`)
  return element as T
}

const app = byId<HTMLElement>('world-app')
const canvas = byId<HTMLCanvasElement>('world-canvas')
const statusTitle = byId<HTMLElement>('status-title')
const statusDetail = byId<HTMLElement>('status-detail')
const idleCopy = byId<HTMLElement>('idle-copy')
const idleActions = byId<HTMLElement>('idle-actions')
const runActions = byId<HTMLElement>('run-actions')
const startButton = byId<HTMLButtonElement>('start')
const reloadButton = byId<HTMLButtonElement>('reload')
const replaceButton = byId<HTMLButtonElement>('replace')
const stopButton = byId<HTMLButtonElement>('stop')
const unsupportedMessage = byId<HTMLElement>('unsupported')
const trackingWarning = byId<HTMLElement>('tracking-warning')
const stateCopy = byId<HTMLElement>('state-copy')
const stateButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-state]'))
const sizeSlider = byId<HTMLInputElement>('island-size')
const sizeValue = byId<HTMLOutputElement>('island-size-value')

let THREE: Three = null
let XR8: Engine = null
let engineReady = false
let engineLoading = false
let fatalEngineError = false
let reloadAvailable = false
let reloadRequired = false
let blockedByCompatibility = false
let starting = false
let stopping = false
let running = false
let cameraVisible = false
let placed = false
let tracking: 'unknown' | 'normal' | 'limited' = 'unknown'
let sessionToken = 0
let modulesAdded = false
let runRequested = false
let startTimer = 0
let stopTimer = 0
let pageClosed = false

let scene: any = null
let sceneCamera: any = null
let renderer: any = null
let model: LighthouseDiorama | null = null
let modelRoot: any = null
let lightRig: any = null
let hemisphereLight: any = null
let raycaster: any = null
let placementPlane: any = null
let sceneToken: number | null = null
let trackingListener: (() => void) | null = null
let tapStart: { id: number; x: number; y: number } | null = null
let tapMoved = false

let modelScale = DEFAULT_MODEL_SCALE
let activeState: 'exposed' | 'protected' = 'protected'
let activePieces = protectedPieces
let protectedTarget = 1
let protectedMix = 1
let clockTime = 0
let lastFrame = performance.now()
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function setStatus(phase: string, title: string, detail: string) {
  app.dataset.phase = phase
  statusTitle.textContent = title
  statusDetail.textContent = detail
  trackingWarning.hidden = phase !== 'limited'
  updateControls()
}

function updateControls() {
  const sessionVisible = starting || running
  idleActions.hidden = sessionVisible
  runActions.hidden = !sessionVisible
  idleCopy.hidden = sessionVisible
  startButton.disabled =
    !engineReady ||
    engineLoading ||
    starting ||
    running ||
    stopping ||
    fatalEngineError ||
    blockedByCompatibility ||
    reloadRequired
  reloadButton.hidden = !reloadAvailable
  stopButton.disabled = stopping
  replaceButton.disabled = !placed || !running || starting
}

function setCameraVisible(visible: boolean) {
  cameraVisible = visible
  app.dataset.camera = visible ? 'on' : 'off'
  updateSceneVisibility()
}

function updateSceneVisibility() {
  if (modelRoot) modelRoot.visible = Boolean(placed && tracking === 'normal' && cameraVisible)
}

function updateStateCopy() {
  const result = activeState === 'protected' ? evaluateBreakWaves(protectedPieces) : evaluateBreakWaves(exposedPieces)
  const example =
    activeState === 'protected'
      ? 'Protected example: four local breakwater pieces.'
      : 'Exposed example: no breakwater pieces.'
  stateCopy.textContent = `${example} West ${result.west_sheltered}/7, east ${result.east_sheltered}/7, boat route ${
    result.corridor_clear ? 'open' : 'blocked'
  }. Illustrative only; switching does not move the island or save anything.`
  for (const button of stateButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.state === activeState))
  }
}

function setState(state: 'exposed' | 'protected') {
  activeState = state
  activePieces = state === 'protected' ? protectedPieces : exposedPieces
  protectedTarget = state === 'protected' ? 1 : 0
  updateStateCopy()
  if (!model) return
  model.setPieces(activePieces)
  if (reducedMotion) {
    protectedMix = protectedTarget
    model.setBreakwaterMood(protectedMix)
    model.setShoreMood(protectedMix, protectedMix)
    model.update(0, protectedMix)
  }
}

function modelBaseY() {
  return 0.48 * modelScale + 0.002
}

function setIslandSize(percent: number) {
  modelScale = DEFAULT_MODEL_SCALE * percent / 100
  sizeValue.value = `${percent}%`
  sizeSlider.setAttribute('aria-valuetext', `${percent}% of default island size`)
  if (modelRoot) {
    modelRoot.scale.setScalar(modelScale)
    // Lift only enough to keep the bottom on the floor. Do not change the anchor's X/Z or yaw.
    modelRoot.position.y = modelBaseY()
  }
  if (lightRig) {
    lightRig.scale.setScalar(modelScale)
    const key = lightRig.getObjectByName('coastal-world-key')
    const extent = modelScale * 5.2
    key.shadow.camera.left = -extent
    key.shadow.camera.right = extent
    key.shadow.camera.top = extent
    key.shadow.camera.bottom = -extent
    key.shadow.camera.updateProjectionMatrix()
    lightRig.getObjectByName('coastal-world-glow').distance = 3.5 * modelScale
  }
}

function refreshReadyStatus() {
  if (tracking === 'limited') return
  if (placed) {
    setStatus(
      'placed',
      'Placed on the estimated floor',
      'Sidestep or walk around slowly. Normal tracking is not a stability guarantee. Re-place clears this anchor and needs a fresh tap.',
    )
    return
  }
  setStatus(
    'ready',
    'Ready to place',
    'Tap a textured floor patch above the controls. This uses the estimated floor (Y = 0), not tabletop detection.',
  )
}

function safeErrorMessage(error: unknown) {
  if (!error) return ''
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
  return message.length > 240 ? `${message.slice(0, 237)}…` : message
}

function reasonLabel(reason: unknown) {
  if (typeof reason === 'string') return reason.toLowerCase().replaceAll('_', ' ')
  const enumObject = XR8?.XrDevice?.IncompabilityReasons || XR8?.XrDevice?.IncompatibilityReasons
  if (enumObject && typeof enumObject === 'object') {
    for (const [name, value] of Object.entries(enumObject)) {
      if (value === reason && !/^\d+$/.test(name)) return name.toLowerCase().replaceAll('_', ' ')
    }
  }
  return `code ${String(reason)}`
}

function compatibility() {
  if (!XR8) return { compatible: false, reasons: ['engine not loaded'] }
  try {
    const allowedDevices = XR8.XrConfig.device().MOBILE
    const compatible = XR8.XrDevice.isDeviceBrowserCompatible({ allowedDevices })
    const reasons = (XR8.XrDevice.incompatibleReasons({ allowedDevices }) || []).map(reasonLabel)
    return { compatible, reasons }
  } catch (error) {
    return { compatible: false, reasons: [safeErrorMessage(error) || 'compatibility check failed'] }
  }
}

function showUnsupported(reasons: string[]) {
  blockedByCompatibility = true
  const reasonText = reasons.length ? ` (${reasons.join(', ')})` : ''
  unsupportedMessage.hidden = false
  unsupportedMessage.textContent = `This browser/device cannot run 8th Wall world tracking${reasonText}. Open this page on a supported iPhone or Android phone with a current browser over HTTPS. No camera was requested.`
  setStatus(
    'error',
    'World tracking is not supported here',
    'Use a supported phone browser over HTTPS. This desktop fallback does not request the camera.',
  )
}

function loadThree() {
  const threeUrl = new URL('ar/vendor/three-0.160.0/build/three.module.min.js', document.baseURI).href
  return import(/* @vite-ignore */ threeUrl) as Promise<Three>
}

function loadEngineScript(): Promise<Engine> {
  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      window.removeEventListener('xrloaded', onLoaded)
      window.clearTimeout(timeout)
    }
    const settle = (error?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve(w.XR8)
    }
    // XR8 can exist before the preloaded SLAM chunk is ready. The documented xrloaded event is
    // the readiness signal; script load or an existing XR8 global alone is not enough.
    const onLoaded = () => {
      if (w.XR8) settle()
      else settle(new Error('The local 8th Wall engine signalled readiness without exposing XR8.'))
    }
    const timeout = window.setTimeout(() => {
      settle(
        new Error(
          'The local 8th Wall engine did not finish loading its SLAM chunk. Check the local assets.',
        ),
      )
    }, ENGINE_TIMEOUT_MS)

    // Register before inserting the script so a fast cache hit cannot race the listener.
    window.addEventListener('xrloaded', onLoaded, { once: true })
    const script = document.createElement('script')
    script.src = new URL('ar/vendor/8thwall-engine-1.0.0/xr.js', document.baseURI).href
    script.async = true
    script.dataset.preloadChunks = 'slam'
    script.addEventListener('error', () => {
      settle(new Error('The local 8th Wall engine script could not be loaded. Check the local assets.'))
    })
    document.head.append(script)
  })
}

function webglAvailable() {
  const probe = document.createElement('canvas')
  return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'))
}

async function boot() {
  engineLoading = true
  updateControls()
  setStatus(
    'loading',
    'Preparing engine…',
    'Loading the local Three.js module and 8th Wall engine. No camera is requested.',
  )
  try {
    if (!webglAvailable()) throw new Error('WebGL is not available in this browser.')
    THREE = await loadThree()
    w.THREE = THREE
    XR8 = await loadEngineScript()
    if (pageClosed) return
    engineReady = true
    engineLoading = false
    setStatus(
      'idle',
      'Engine ready — camera off',
      'Press Start AR when you are standing over a textured floor. The camera stays off until then.',
    )
  } catch (error) {
    engineReady = false
    engineLoading = false
    fatalEngineError = true
    reloadAvailable = true
    setStatus(
      'error',
      'The experiment could not start',
      `${safeErrorMessage(error)} Reload the page to try again.`,
    )
  }
  updateControls()
}

function resizeCameraCanvas() {
  // CSS size alone leaves the default 300×150 drawing buffer in place. XR8 reads these
  // dimensions to size both the camera feed and its tracked projection on the next frame.
  const pixelRatio = window.devicePixelRatio || 1
  const width = Math.max(1, Math.round(app.clientWidth * pixelRatio))
  const height = Math.max(1, Math.round(app.clientHeight * pixelRatio))
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
}

function addPipelineModules(token: number) {
  XR8.XrController.configure({ disableWorldTracking: false, scale: 'responsive' })
  const custom: EngineModule = {
    name: `coastal-world-diorama-${token}`,
    requiredPermissions: () => {
      const permissions = XR8.XrPermissions.permissions()
      return [permissions.CAMERA, permissions.DEVICE_ORIENTATION]
    },
    onStart: () => {
      // A stale callback must never touch the global engine or UI. The stop path already released
      // this abandoned attempt; a newer generation may own the engine now.
      if (token !== sessionToken) return
      try {
        resizeCameraCanvas()
        setupScene(token)
        starting = false
        running = true
        setCameraVisible(true)
        window.clearTimeout(startTimer)
        if (tracking === 'normal') refreshReadyStatus()
        else if (tracking === 'limited') {
          setStatus(
            'limited',
            'Tracking limited — move slowly',
            'Finding the estimated floor. Keep a textured floor in view and avoid tables or other surfaces.',
          )
        } else {
          setStatus(
            'starting',
            'Move the phone slowly',
            'Finding the estimated floor. Keep a textured floor in view and avoid tables or other surfaces.',
          )
        }
        updateControls()
      } catch (error) {
        failSession(
          'The 3D island could not start',
          safeErrorMessage(error),
        )
      }
    },
    onCanvasSizeChange: () => {
      if (token === sessionToken) resizeCameraCanvas()
    },
    onUpdate: ({ processCpuResult }: any) => {
      if (token !== sessionToken) return
      updateReality(processCpuResult?.reality)
      updateModelFrame()
    },
    onCameraStatusChange: ({ status }: any) => {
      if (token !== sessionToken) return
      if (status === 'requesting') {
        setStatus(
          'starting',
          'Waiting for camera permission…',
          'Allow camera and motion access when your browser asks. No frames are stored by this page.',
        )
      } else if (status === 'hasStream') {
        setStatus(
          'starting',
          'Camera stream ready',
          'Waiting for video frames. Keep the phone pointed at a textured floor.',
        )
      } else if (status === 'hasVideo') {
        if (!cameraVisible) setCameraVisible(true)
        if (tracking === 'normal') refreshReadyStatus()
        updateControls()
      } else if (status === 'failed') {
        failSession(
          'Camera access failed or was denied',
          'Allow camera access for this site in your browser settings. On iPhone, also check Motion & Orientation Access.',
        )
      }
    },
    onException: (error: unknown) => {
      if (token !== sessionToken) return
      failSession(
        'World tracking stopped after an engine error',
        safeErrorMessage(error) || 'The engine reported an error.',
      )
    },
    onRemove: () => {
      if (token === sceneToken) teardownScene()
    },
  }

  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule(),
    custom,
  ])
  modulesAdded = true
}

function setupScene(token: number) {
  if (!THREE || !XR8) throw new Error('The 3D dependencies are not ready.')
  const xrScene = XR8.Threejs.xrScene()
  if (!xrScene?.scene || !xrScene?.camera) throw new Error('The 8th Wall Three.js scene is unavailable.')
  teardownScene()
  scene = xrScene.scene
  sceneCamera = xrScene.camera
  renderer = xrScene.renderer
  clockTime = 0
  lastFrame = performance.now()

  if (renderer) {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.03
  }

  // The engine drives this camera after startup. This initial pose only defines a view aimed at the
  // floor; it is not a per-frame camera angle or a camera-facing transform for the island.
  sceneCamera.position.set(INITIAL_CAMERA.x, INITIAL_CAMERA.y, INITIAL_CAMERA.z)
  sceneCamera.lookAt(new THREE.Vector3(0, 0, 0))
  sceneCamera.updateMatrixWorld(true)
  XR8.XrController.updateCameraProjectionMatrix({
    origin: sceneCamera.position,
    facing: sceneCamera.quaternion,
  })

  activePieces = activeState === 'protected' ? protectedPieces : exposedPieces
  protectedTarget = activeState === 'protected' ? 1 : 0
  protectedMix = protectedTarget
  model = createLighthouseDiorama(THREE, {
    pieces: activePieces,
    compact: window.innerWidth < 620,
    shadows: true,
    groundShadow: true,
    maxAnisotropy: renderer?.capabilities?.getMaxAnisotropy?.() ?? 1,
    zOffset: -0.01,
    breakwaterMode: 'sculpted',
    ownerAccents: false,
    boats: [
      { x: 0.02, z: 0.5, rotation: 0.25, scale: 1 },
      { x: -0.03, z: -0.53, rotation: -0.35, scale: 0.82 },
    ],
    shelterAt: (puzzleX, puzzleZ) => activePieces.some((piece) => pieceSheltersPoint(piece, puzzleX, puzzleZ)),
  })
  modelRoot = model.root
  modelRoot.name = 'coastal-world-root'
  modelRoot.scale.setScalar(modelScale)
  modelRoot.position.set(0, modelBaseY(), 0)
  modelRoot.rotation.y = 0
  modelRoot.visible = false
  scene.add(modelRoot)
  model.setBreakwaterMood(protectedMix)
  model.setShoreMood(protectedMix, protectedMix)
  model.update(0, protectedMix)

  setupLights()
  setIslandSize(sizeSlider.valueAsNumber)
  raycaster = new THREE.Raycaster()
  placementPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  sceneToken = token

  const onTrackingStatus = (event: any) => {
    if (token !== sessionToken) return
    const detail = event?.detail || event
    updateTrackingState(detail?.status, detail?.reason)
  }
  window.addEventListener('reality.trackingstatus', onTrackingStatus)
  trackingListener = () => window.removeEventListener('reality.trackingstatus', onTrackingStatus)
}

function setupLights() {
  // Author lights in model units so the rig scales with the island without recreating lights.
  const scale = 1
  hemisphereLight = new THREE.HemisphereLight(0xd9f2f1, 0x79634c, 1.35)
  scene.add(hemisphereLight)

  lightRig = new THREE.Group()
  lightRig.name = 'coastal-world-light-rig'
  const key = new THREE.DirectionalLight(0xffe2b5, 3.6)
  key.name = 'coastal-world-key'
  key.position.set(-5.2 * scale, 7.6 * scale, 4.8 * scale)
  key.target.position.set(0, 0.2 * scale, 0.2 * scale)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  const shadowExtent = modelScale * 5.2
  key.shadow.camera.left = -shadowExtent
  key.shadow.camera.right = shadowExtent
  key.shadow.camera.top = shadowExtent
  key.shadow.camera.bottom = -shadowExtent
  key.shadow.camera.near = 0.1
  key.shadow.camera.far = 8
  key.shadow.bias = -0.00035
  key.shadow.normalBias = 0.002
  lightRig.add(key)
  lightRig.add(key.target)

  const fill = new THREE.DirectionalLight(0x9ed8e2, 1.25)
  fill.position.set(5.4 * scale, 4.4 * scale, -4.5 * scale)
  lightRig.add(fill)

  const rim = new THREE.DirectionalLight(0xfff4d7, 0.7)
  rim.position.set(0.5 * scale, 3.2 * scale, -5.5 * scale)
  lightRig.add(rim)

  const glow = new THREE.PointLight(0xffbd68, 1.15, 3.5 * scale, 2)
  glow.name = 'coastal-world-glow'
  glow.position.set(-1.55 * scale, 1.76 * scale, -0.95 * scale)
  lightRig.add(glow)

  scene.add(lightRig)
}

function teardownScene() {
  trackingListener?.()
  trackingListener = null
  if (modelRoot && scene) scene.remove(modelRoot)
  if (model) {
    model.dispose()
    model = null
  }
  modelRoot = null
  if (lightRig) {
    lightRig.traverse((child: any) => {
      child.shadow?.map?.dispose?.()
      child.dispose?.()
    })
    if (scene) scene.remove(lightRig)
  }
  lightRig = null
  if (hemisphereLight && scene) scene.remove(hemisphereLight)
  hemisphereLight = null
  scene = null
  sceneCamera = null
  renderer = null
  raycaster = null
  placementPlane = null
  sceneToken = null
  placed = false
  tracking = 'unknown'
  trackingWarning.hidden = true
  replaceButton.disabled = true
}

function updateReality(reality: any) {
  if (!reality) return
  updateTrackingState(reality.trackingStatus, reality.trackingReason)
}

function updateTrackingState(status: unknown, reason: unknown) {
  const nextStatus = String(status || '')
  const nextReason = String(reason || '')
  if (nextStatus === 'LIMITED' || nextReason === 'INITIALIZING') {
    if (tracking !== 'limited') {
      tracking = 'limited'
      setStatus(
        'limited',
        'Tracking limited — move slowly',
        nextReason === 'INITIALIZING'
          ? 'Finding the estimated floor. Keep the phone aimed at a textured floor and avoid tables or other surfaces.'
          : 'The island is hidden until tracking returns. Normal tracking is not a stability guarantee.',
      )
    }
    updateSceneVisibility()
    updateControls()
    return
  }
  if (nextStatus === 'NORMAL' && tracking !== 'normal') {
    tracking = 'normal'
    updateSceneVisibility()
    if (running) refreshReadyStatus()
    updateControls()
  }
}

function updateModelFrame() {
  if (!model || !modelRoot?.visible) return
  const now = performance.now()
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000))
  lastFrame = now
  if (reducedMotion) {
    protectedMix = protectedTarget
  } else {
    clockTime += dt
    const ease = 1 - Math.exp(-dt * 4.4)
    protectedMix += (protectedTarget - protectedMix) * ease
    if (Math.abs(protectedTarget - protectedMix) < 0.001) protectedMix = protectedTarget
  }
  model.setBreakwaterMood(protectedMix)
  model.setShoreMood(protectedMix, protectedMix)
  model.update(clockTime, protectedMix)
}

function screenPoint(clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  const x = ((clientX - rect.left) / rect.width) * 2 - 1
  const y = -((clientY - rect.top) / rect.height) * 2 + 1
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1.2 || Math.abs(y) > 1.2) return null
  return { x, y }
}

function tryPlace(clientX: number, clientY: number) {
  if (!modelRoot || !sceneCamera || !raycaster || !placementPlane || !THREE) return
  if (placed) return
  if (!cameraVisible || !running || starting) return
  if (tracking !== 'normal') {
    setStatus(
      'limited',
      'Wait for normal tracking',
      'Placement is disabled until tracking returns. Keep the phone aimed at a textured floor.',
    )
    return
  }
  const point = screenPoint(clientX, clientY)
  if (!point) return
  sceneCamera.updateMatrixWorld(true)
  raycaster.setFromCamera(point, sceneCamera)
  const ray = raycaster.ray
  if (!ray || !Number.isFinite(ray.direction.y) || ray.direction.y > -0.02) {
    setStatus(
      'ready',
      'Tap the floor again',
      'That tap did not meet the estimated floor plane. Aim lower at a textured floor patch.',
    )
    return
  }
  const hit = new THREE.Vector3()
  const intersection = ray.intersectPlane(placementPlane, hit)
  if (
    !intersection ||
    !Number.isFinite(hit.x) ||
    !Number.isFinite(hit.y) ||
    !Number.isFinite(hit.z)
  ) {
    setStatus(
      'ready',
      'Tap the floor again',
      'That tap did not meet the estimated floor plane. Aim lower at a textured floor patch.',
    )
    return
  }
  const distance = hit.distanceTo(sceneCamera.position)
  if (distance < 0.15 || distance > MAX_PLACEMENT_DISTANCE) {
    setStatus(
      'ready',
      'Tap closer to your feet',
      'The estimated floor point was too far away. Aim at a floor patch within a few steps.',
    )
    return
  }
  const yaw = Math.atan2(sceneCamera.position.x - hit.x, sceneCamera.position.z - hit.z)
  modelRoot.position.set(hit.x, modelBaseY(), hit.z)
  modelRoot.rotation.y = yaw
  if (lightRig) {
    lightRig.position.set(hit.x, 0, hit.z)
    lightRig.rotation.y = yaw
  }
  placed = true
  updateSceneVisibility()
  refreshReadyStatus()
  updateControls()
}

function clearPlacement(announce: boolean) {
  placed = false
  if (modelRoot) {
    modelRoot.visible = false
    modelRoot.position.set(0, modelBaseY(), 0)
    modelRoot.rotation.y = 0
  }
  if (lightRig) {
    lightRig.position.set(0, 0, 0)
    lightRig.rotation.y = 0
  }
  updateControls()
  if (announce) {
    if (tracking === 'normal') {
      setStatus(
        'ready',
        'Placement cleared',
        'Tap the floor to set a new anchor. Recheck the floor and move slowly; recalibration may be needed.',
      )
    } else {
      setStatus(
        'limited',
        'Placement cleared — tracking limited',
        'The next tap needs normal tracking. Keep the phone aimed at a textured floor.',
      )
    }
  }
}

function clearStartTimer() {
  window.clearTimeout(startTimer)
  startTimer = 0
}

function beginStopCooldown() {
  // Brief UI settle for a completed running session. An abandoned startup is not retried on this
  // timer: stop/fail before onStart sets reloadRequired instead.
  stopping = true
  window.clearTimeout(stopTimer)
  stopTimer = window.setTimeout(() => {
    stopping = false
    updateControls()
  }, 450)
}

function releaseEngineQuietly() {
  clearStartTimer()
  starting = false
  running = false
  setCameraVisible(false)
  runRequested = false
  if (XR8) {
    try {
      XR8.stop()
    } catch {
      // The engine may already be stopped.
    }
    if (modulesAdded) {
      try {
        XR8.clearCameraPipelineModules()
      } catch {
        // Clearing is best effort; the page will not reuse this session.
      }
    }
  }
  modulesAdded = false
  beginStopCooldown()
}

function stopSession(message: string) {
  const wasActive = starting || running || modulesAdded || runRequested
  const pendingStart = starting
  sessionToken += 1
  clearStartTimer()
  starting = false
  running = false
  setCameraVisible(false)
  teardownScene()
  if (wasActive) {
    releaseEngineQuietly()
  }
  if (!wasActive) updateControls()
  if (pendingStart) {
    reloadRequired = true
    reloadAvailable = true
    setStatus(
      'error',
      'Reload required after cancelling startup',
      'The engine was still starting. Reload the page before starting a new session; the abandoned start is being released.',
    )
    return
  }
  setStatus('idle', 'Camera off', message)
}

function failSession(title: string, detail: string) {
  const pendingStart = starting
  sessionToken += 1
  clearStartTimer()
  starting = false
  running = false
  setCameraVisible(false)
  teardownScene()
  releaseEngineQuietly()
  reloadAvailable = true
  if (pendingStart) {
    reloadRequired = true
    setStatus('error', title, `${detail} The engine had not finished starting; reload the page before retrying.`)
    return
  }
  setStatus('error', title, `${detail} You can retry with Start AR or reload the page.`)
}

async function startSession() {
  if (
    starting ||
    running ||
    stopping ||
    !engineReady ||
    fatalEngineError ||
    blockedByCompatibility ||
    reloadRequired
  )
    return
  const token = ++sessionToken
  reloadAvailable = false
  unsupportedMessage.hidden = true
  starting = true
  updateControls()
  setStatus(
    'starting',
    'Starting camera…',
    'Allow camera and motion access when your browser asks. Placement waits for normal tracking.',
  )

  const support = compatibility()
  if (!support.compatible) {
    starting = false
    showUnsupported(support.reasons)
    updateControls()
    return
  }

  try {
    addPipelineModules(token)
    startTimer = window.setTimeout(() => {
      if (token === sessionToken && starting) {
        failSession(
          'The camera did not start',
          'Check camera and motion permissions.',
        )
      }
    }, START_TIMEOUT_MS)
  } catch (error) {
    failSession(
      'The world-tracking engine could not start',
      safeErrorMessage(error),
    )
    return
  }

  // XrController.pipelineModule() declares camera, deviceorientation and devicemotion in its
  // published requiredPermissions(). XR8.run() is still called synchronously inside the Start
  // gesture, so the engine's permission framework can request them without a second
  // DeviceOrientationEvent/DeviceMotionEvent prompt from this page.
  if (token !== sessionToken) return

  try {
    resizeCameraCanvas()
    runRequested = true
    const result = XR8.run({
      canvas,
      cameraConfig: { direction: XR8.XrConfig.camera().BACK },
      allowedDevices: XR8.XrConfig.device().MOBILE,
    })
    if (result && typeof result.then === 'function') await result
  } catch (error) {
    if (token !== sessionToken) return
    failSession(
      'The camera could not be opened',
      `${safeErrorMessage(error)} Check camera permission.`,
    )
    return
  }

  if (token !== sessionToken) return
  running = true
  updateControls()
  if (tracking === 'normal') refreshReadyStatus()
}

function onCanvasPointerDown(event: PointerEvent) {
  if (!cameraVisible || placed || tracking !== 'normal' || starting || !running || tapStart) return
  tapStart = { id: event.pointerId, x: event.clientX, y: event.clientY }
  tapMoved = false
}

function onCanvasPointerMove(event: PointerEvent) {
  if (!tapStart || event.pointerId !== tapStart.id) return
  if (Math.hypot(event.clientX - tapStart.x, event.clientY - tapStart.y) > TAP_MOVE_LIMIT) tapMoved = true
}

function onCanvasPointerUp(event: PointerEvent) {
  if (!tapStart || event.pointerId !== tapStart.id) return
  const start = tapStart
  tapStart = null
  if (tapMoved) return
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_MOVE_LIMIT) return
  tryPlace(event.clientX, event.clientY)
}

function onCanvasPointerCancel() {
  tapStart = null
}

function onStartClick() {
  void startSession()
}

function onStopClick() {
  stopSession('Start AR again when you are ready. A fresh session needs a new floor placement.')
}

function onReplaceClick() {
  if (!running || !placed) return
  clearPlacement(true)
}

function onReloadClick() {
  window.location.reload()
}

function onVisibilityChange() {
  if (document.visibilityState !== 'hidden') return
  if (!starting && !running && !modulesAdded && !runRequested) {
    sessionToken += 1
    clearStartTimer()
    return
  }
  stopSession('Camera released when the page was hidden. Start AR again to place on the floor.')
}

function onPageHide() {
  pageClosed = true
  if (!starting && !running && !modulesAdded && !runRequested) {
    sessionToken += 1
    clearStartTimer()
    return
  }
  stopSession('Camera released because the page closed or was hidden. Start AR again to place on the floor.')
}

function onPageShow(event: PageTransitionEvent) {
  if (event.persisted) window.location.reload()
}

// The app follows 100dvh, including Safari toolbar changes and device rotation. Observe its
// layout rather than the canvas, whose pixel attributes are also written by the engine.
const viewportObserver = new ResizeObserver(() => {
  if (starting || running) resizeCameraCanvas()
})
viewportObserver.observe(app)
window.addEventListener('pagehide', () => viewportObserver.disconnect(), { once: true })

canvas.addEventListener('pointerdown', onCanvasPointerDown)
canvas.addEventListener('pointermove', onCanvasPointerMove)
canvas.addEventListener('pointerup', onCanvasPointerUp)
canvas.addEventListener('pointercancel', onCanvasPointerCancel)
canvas.addEventListener('pointerleave', onCanvasPointerCancel)
canvas.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false })
canvas.addEventListener('contextmenu', (event) => event.preventDefault())
startButton.addEventListener('click', onStartClick)
stopButton.addEventListener('click', onStopClick)
replaceButton.addEventListener('click', onReplaceClick)
reloadButton.addEventListener('click', onReloadClick)
sizeSlider.addEventListener('input', () => setIslandSize(sizeSlider.valueAsNumber))
window.addEventListener('pagehide', onPageHide)
window.addEventListener('pageshow', onPageShow)
document.addEventListener('visibilitychange', onVisibilityChange)
for (const button of stateButtons) {
  button.addEventListener('click', () => setState(button.dataset.state as 'exposed' | 'protected'))
}
setIslandSize(sizeSlider.valueAsNumber)
updateStateCopy()
updateControls()
setStatus(
  'loading',
  'Preparing engine…',
  'Loading the local Three.js module and 8th Wall engine. No camera is requested.',
)
void boot()
