// World-tracking controller for Break the waves. This adapts the accepted standalone world-tracking
// runtime to the floor-local game scene. It owns one global 8th Wall engine session, a full-stage
// canvas and the game anchor; the paired page mounts this controller, while the standalone marker
// experiment keeps its own unchanged controller and assets.
import { PUZZLE_SCALE } from '../../diorama/dioramaModel'
import type { BreakWavesPiece, BreakWavesResult, PieceId, Side } from './breakWaves'
import {
  createBreakWavesScene,
  type BreakWavesScene,
  type GhostPiece,
  type LensId,
} from './breakWavesScene'

type Three = any
type Engine = any

export type WorldArPhase =
  | 'preparing'
  | 'ready'
  | 'starting'
  | 'placing'
  | 'tracking'
  | 'tracking-lost'
  | 'paused'
  | 'stopped'
  | 'denied'
  | 'unavailable'
  | 'failed'

export interface WorldArState {
  phase: WorldArPhase
  canStart: boolean
  reloadRequired: boolean
  message: string
  sizePercent: number
}

export interface WorldArOptions {
  container: HTMLElement
  mySide: Side
  onSelectPiece(pieceId: PieceId): void
  onWaterTap(point: { x: number; z: number }): void
  onState?(state: WorldArState): void
}

interface SdkModules {
  THREE: Three
  XR8: Engine
}

interface Runtime {
  sdkPromise: Promise<SdkModules> | null
  sdk: SdkModules | null
  loadError: string | null
  reloadRequired: boolean
  owner: symbol | null
  stopCooldownUntil: number
  stopCooldownTimer: number
  cooldownListeners: Set<() => void>
}

interface PlacementTap {
  id: number
  x: number
  y: number
}

const ENGINE_TIMEOUT_MS = 30_000
const START_TIMEOUT_MS = 45_000
const STOP_COOLDOWN_MS = 450
const DEFAULT_MODEL_SCALE = 0.24
const INITIAL_CAMERA = { x: 0, y: 1.45, z: 2.2 }
const TAP_MOVE_LIMIT = 12
const MAX_PLACEMENT_DISTANCE = 8
const MIN_PLACEMENT_DISTANCE = 0.15
const DEFAULT_SIZE_PERCENT = 100
const MIN_SIZE_PERCENT = 50
const MAX_SIZE_PERCENT = 200
const SIZE_STEP_PERCENT = 5
const CANVAS_CLASS = 'break-waves-world-canvas'

const runtime: Runtime = {
  sdkPromise: null,
  sdk: null,
  loadError: null,
  reloadRequired: false,
  owner: null,
  stopCooldownUntil: 0,
  stopCooldownTimer: 0,
  cooldownListeners: new Set(),
}

function cooldownActive() {
  return runtime.stopCooldownUntil > performance.now()
}

function notifyCooldownChange(except?: () => void) {
  for (const listener of Array.from(runtime.cooldownListeners)) {
    if (listener !== except) listener()
  }
}

function beginStopCooldown() {
  // The accepted runtime holds a short settle guard after XR8.stop()/clearCameraPipelineModules().
  // Keep it page-global so a replacement controller cannot reopen the engine during shutdown. The
  // timer only ends this cooldown; it never clears the permanent reload gate for an uncertain start.
  runtime.stopCooldownUntil = performance.now() + STOP_COOLDOWN_MS
  if (runtime.stopCooldownTimer) window.clearTimeout(runtime.stopCooldownTimer)
  runtime.stopCooldownTimer = window.setTimeout(() => {
    runtime.stopCooldownTimer = 0
    runtime.stopCooldownUntil = 0
    notifyCooldownChange()
  }, STOP_COOLDOWN_MS)
}

const engineScriptUrl = new URL(
  `${import.meta.env.BASE_URL}ar/vendor/8thwall-engine-1.0.0/xr.js`,
  window.location.origin,
).href
const threeUrl = new URL(
  `${import.meta.env.BASE_URL}ar/vendor/three-0.160.0/build/three.module.min.js`,
  window.location.origin,
).href

let canvasStyle: HTMLStyleElement | null = null
let canvasStyleUsers = 0

function retainCanvasStyle() {
  if (!canvasStyle) {
    canvasStyle = document.createElement('style')
    canvasStyle.dataset.breakWavesWorldStyle = 'true'
    // A stylesheet-level !important rule survives Three.js writing non-important inline pixel sizes.
    canvasStyle.textContent =
      '.break-waves-world-canvas{position:absolute;inset:0;display:block;width:100%!important;height:100%!important;z-index:1;outline:none;touch-action:none;}'
    document.head.append(canvasStyle)
  }
  canvasStyleUsers += 1
}

function releaseCanvasStyle() {
  canvasStyleUsers = Math.max(0, canvasStyleUsers - 1)
  if (canvasStyleUsers > 0) return
  canvasStyle?.remove()
  canvasStyle = null
}

function safeErrorMessage(error: unknown) {
  if (!error) return ''
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
  return message.length > 240 ? `${message.slice(0, 237)}…` : message
}

function errorPhase(error: unknown): WorldArPhase {
  const name = error instanceof DOMException ? error.name : (error as { name?: string } | null)?.name
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'NotReadableError' || name === 'OverconstrainedError') {
    return 'unavailable'
  }
  return 'failed'
}

function webglAvailable() {
  const probe = document.createElement('canvas')
  return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'))
}

function loadThree(): Promise<Three> {
  return import(/* @vite-ignore */ threeUrl) as Promise<Three>
}

function reasonLabel(reason: unknown) {
  const engine = runtime.sdk?.XR8
  if (typeof reason === 'string') return reason.toLowerCase().replaceAll('_', ' ')
  const enumObject = engine?.XrDevice?.IncompabilityReasons || engine?.XrDevice?.IncompatibilityReasons
  if (enumObject && typeof enumObject === 'object') {
    for (const [name, value] of Object.entries(enumObject)) {
      if (value === reason && !/^\d+$/.test(name)) return name.toLowerCase().replaceAll('_', ' ')
    }
  }
  return `code ${String(reason)}`
}

function compatibility(engine: Engine) {
  try {
    const allowedDevices = engine.XrConfig.device().MOBILE
    const compatible = engine.XrDevice.isDeviceBrowserCompatible({ allowedDevices })
    const reasons = (engine.XrDevice.incompatibleReasons({ allowedDevices }) || []).map(reasonLabel)
    return { compatible: Boolean(compatible), reasons }
  } catch (error) {
    return { compatible: false, reasons: [safeErrorMessage(error) || 'compatibility check failed'] }
  }
}

function loadEngineScript(): Promise<Engine> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { XR8?: Engine }
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
      else if (w.XR8) resolve(w.XR8)
      else reject(new Error('The local 8th Wall engine signalled readiness without exposing XR8.'))
    }
    // An existing global or a script load is not readiness. The preloaded SLAM chunk announces
    // itself with xrloaded; register first so a cache hit cannot race the listener.
    const onLoaded = () => settle()
    const timeout = window.setTimeout(() => {
      settle(
        new Error('The local 8th Wall engine did not finish loading its SLAM chunk. Check the local assets.'),
      )
    }, ENGINE_TIMEOUT_MS)

    window.addEventListener('xrloaded', onLoaded, { once: true })
    const script = document.createElement('script')
    script.src = engineScriptUrl
    script.async = true
    script.dataset.preloadChunks = 'slam'
    script.dataset.breakWavesWorldEngine = 'true'
    script.addEventListener('error', () => {
      settle(new Error('The local 8th Wall engine script could not be loaded. Check the local assets.'))
    })
    document.head.append(script)
  })
}

function loadSdk(): Promise<SdkModules> {
  if (runtime.sdkPromise) return runtime.sdkPromise
  runtime.loadError = null
  runtime.sdkPromise = (async () => {
    if (!webglAvailable()) throw new Error('WebGL is not available in this browser.')
    // Three must be installed before the engine evaluates its Three.js integration.
    const THREE = await loadThree()
    ;(window as unknown as { THREE?: Three }).THREE = THREE
    const XR8 = await loadEngineScript()
    const sdk = { THREE, XR8 }
    runtime.sdk = sdk
    return sdk
  })().catch((error: unknown) => {
    runtime.loadError = safeErrorMessage(error) || 'The world-tracking engine could not be prepared.'
    runtime.reloadRequired = true
    throw error
  })
  return runtime.sdkPromise
}

export class BreakWavesWorldAr {
  private readonly ownerToken = Symbol('break-waves-world-ar')
  private readonly canvas: HTMLCanvasElement
  private readonly resizeObserver: ResizeObserver | null
  private phaseValue: WorldArPhase = 'preparing'
  private message = 'Preparing the world-tracking engine. No camera is requested.'
  private sizePercentValue = DEFAULT_SIZE_PERCENT
  private sdk: SdkModules | null = null
  private preparePromise: Promise<void> | null = null
  private disposed = false
  private generation = 0
  private starting = false
  private started = false
  private running = false
  private runRequested = false
  private modulesInstalled = false
  private cameraVisible = false
  private tracking: 'unknown' | 'normal' | 'limited' = 'unknown'
  private placed = false
  private startTimer = 0
  private scene: BreakWavesScene | null = null
  private engineScene: any = null
  private sceneToken: number | null = null
  private anchor: any = null
  private sceneCamera: any = null
  private renderer: any = null
  private raycaster: any = null
  private placementPlane: any = null
  private trackingListener: (() => void) | null = null
  private contextLostHandler: (() => void) | null = null
  private tapStart: PlacementTap | null = null
  private tapMoved = false
  private containerPositionChanged = false
  private previousContainerPosition = ''

  private pendingPieces: BreakWavesPiece[] = []
  private pendingWavePieces: BreakWavesPiece[] = []
  private pendingSelected: PieceId | null = null
  private pendingGhost: GhostPiece | null = null
  private pendingLens: LensId | null = null
  private pendingEvaluation: BreakWavesResult | null = null

  constructor(private readonly options: WorldArOptions) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = CANVAS_CLASS
    this.canvas.dataset.breakWavesWorldCanvas = 'true'
    this.canvas.setAttribute('aria-hidden', 'true')
    this.applyCanvasPresentation(false)
    retainCanvasStyle()
    this.ensureContainerPosition()
    options.container.append(this.canvas)

    this.canvas.addEventListener('pointerdown', this.onCanvasPointerDown, true)
    this.canvas.addEventListener('pointermove', this.onCanvasPointerMove, true)
    this.canvas.addEventListener('pointerup', this.onCanvasPointerUp, true)
    this.canvas.addEventListener('pointercancel', this.onCanvasPointerCancel, true)
    this.canvas.addEventListener('pointerleave', this.onCanvasPointerCancel, true)
    this.canvas.addEventListener('touchmove', this.onCanvasTouchMove, { passive: false })
    this.canvas.addEventListener('contextmenu', this.onCanvasContextMenu)

    window.addEventListener('resize', this.onWindowResize)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    window.addEventListener('pagehide', this.onPageHide)
    window.addEventListener('pageshow', this.onPageShow)

    this.resizeObserver =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            if (this.starting || this.running) this.resizeCanvas()
          })
        : null
    this.resizeObserver?.observe(options.container)

    runtime.cooldownListeners.add(this.handleCooldownChange)
    this.emitState()
    void this.prepare()
  }

  get phase(): WorldArPhase {
    return this.phaseValue
  }

  get sizePercent() {
    return this.sizePercentValue
  }

  get reloadRequired() {
    return runtime.reloadRequired
  }

  prepare(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    if (this.preparePromise) return this.preparePromise

    if (runtime.reloadRequired) {
      this.phaseValue = 'failed'
      this.message =
        runtime.loadError ?? 'Reload the page before using world tracking again; the previous startup did not finish cleanly.'
      this.emitState()
      return Promise.resolve()
    }
    if (runtime.sdk) {
      this.sdk = runtime.sdk
      this.refreshIdlePhase()
      return Promise.resolve()
    }

    this.phaseValue = 'preparing'
    this.message = 'Preparing the world-tracking engine. No camera is requested.'
    this.emitState()
    this.preparePromise = (async () => {
      try {
        const sdk = await loadSdk()
        if (this.disposed) return
        this.sdk = sdk
        if (runtime.reloadRequired) {
          this.phaseValue = 'failed'
          this.message =
            runtime.loadError ?? 'Reload the page before using world tracking again.'
          this.emitState()
          return
        }
        this.refreshIdlePhase()
      } catch (error) {
        if (this.disposed) return
        this.phaseValue = 'failed'
        this.message = `${safeErrorMessage(error) || 'The world-tracking engine could not be prepared.'} Reload the page to try again.`
        this.emitState()
      }
    })()
    return this.preparePromise
  }

  // XR8.run must stay in the user's gesture. This method performs no await before it. If the SDK is
  // not ready yet it starts preparation and returns false; the player presses Start again when ready.
  start(): boolean {
    if (this.disposed) return false
    if (runtime.reloadRequired) {
      this.phaseValue = 'failed'
      this.message =
        runtime.loadError ?? 'Reload the page before starting world tracking again; the previous startup did not finish cleanly.'
      this.emitState()
      return false
    }
    if (cooldownActive()) {
      this.message = 'The camera is still shutting down. Start will enable when that completes.'
      this.emitState()
      return false
    }
    const sdk = runtime.sdk
    if (!sdk) {
      if (!this.preparePromise) void this.prepare()
      this.message = 'The world-tracking engine is still preparing. Start will enable when it is ready.'
      this.emitState()
      return false
    }
    this.sdk = sdk
    const support = compatibility(sdk.XR8)
    if (!support.compatible) {
      this.phaseValue = 'unavailable'
      const reasonText = support.reasons.length ? ` (${support.reasons.join(', ')})` : ''
      this.message = `This browser/device cannot run world tracking${reasonText}. No camera was requested.`
      this.emitState()
      return false
    }
    if (this.starting || this.started || this.running || this.modulesInstalled || this.runRequested) return false
    if (runtime.owner && runtime.owner !== this.ownerToken) {
      this.phaseValue = 'failed'
      this.message = 'Another AR session is already using the camera. Stop it before starting this one.'
      this.emitState()
      return false
    }

    runtime.owner = this.ownerToken
    const generation = ++this.generation
    this.starting = true
    this.started = false
    this.running = false
    this.runRequested = false
    this.modulesInstalled = false
    this.cameraVisible = false
    this.tracking = 'unknown'
    this.placed = false
    this.phaseValue = 'starting'
    this.message = 'Starting the rear camera. Allow camera and motion access when your browser asks.'
    this.applyCanvasPresentation(false)
    this.emitState()

    try {
      this.resizeCanvas()
      this.addPipelineModules(generation)
      this.startTimer = window.setTimeout(() => {
        if (generation !== this.generation || !this.starting || this.started) return
        this.failSession('The camera did not start in time. Check camera and motion permissions.')
      }, START_TIMEOUT_MS)

      // The drawing buffer is sized again immediately before the engine reads the canvas.
      this.resizeCanvas()
      this.runRequested = true
      const result = sdk.XR8.run({
        canvas: this.canvas,
        cameraConfig: { direction: sdk.XR8.XrConfig.camera().BACK },
        allowedDevices: sdk.XR8.XrConfig.device().MOBILE,
      })
      if (result && typeof result.then === 'function') {
        result.catch((error: unknown) => {
          if (generation !== this.generation) return
          this.failSession(
            `The camera could not be opened. ${safeErrorMessage(error) || 'Check camera permission.'}`,
            error,
          )
        })
      }
    } catch (error) {
      if (generation === this.generation) {
        this.failSession(
          `The world-tracking engine could not start. ${safeErrorMessage(error) || 'Check the local assets.'}`,
          error,
        )
      }
      return false
    }
    return true
  }

  stop(target: 'paused' | 'stopped' = 'stopped') {
    if (this.disposed) return
    const active =
      this.starting || this.started || this.running || this.modulesInstalled || this.runRequested || this.scene !== null
    if (!active) return

    // Compute the reload gate before clearing startup flags. A session cancelled before onStart cannot
    // prove the SDK released camera acquisition, so another run is not allowed without a page reload.
    const pendingStart = this.starting && !this.started
    if (pendingStart) runtime.reloadRequired = true
    this.generation += 1
    this.clearStartTimer()
    this.starting = false
    this.started = false
    this.running = false
    this.runRequested = false
    this.cameraVisible = false
    this.tracking = 'unknown'
    this.teardownScene()
    this.releaseEngine()
    this.applyCanvasPresentation(false)
    this.phaseValue = target
    this.message = runtime.reloadRequired
      ? 'Reload the page before starting world tracking again; startup was interrupted before the camera finished starting.'
      : target === 'paused'
        ? 'Camera paused. Start will enable after the camera finishes releasing; start again and place the coast afresh.'
        : 'Camera stopped. Start will enable after the camera finishes releasing; start again and place the coast afresh.'
    this.emitState()
    if (cooldownActive()) notifyCooldownChange(this.handleCooldownChange)
  }

  dispose() {
    if (this.disposed) return
    const pendingStart = this.starting && !this.started
    const active =
      this.starting || this.started || this.running || this.modulesInstalled || this.runRequested || this.scene !== null
    if (pendingStart) runtime.reloadRequired = true
    this.disposed = true
    runtime.cooldownListeners.delete(this.handleCooldownChange)
    this.generation += 1
    this.clearStartTimer()
    this.starting = false
    this.started = false
    this.running = false
    this.runRequested = false
    this.cameraVisible = false
    this.teardownScene()
    if (active) this.releaseEngine()
    if (cooldownActive()) notifyCooldownChange()

    this.resizeObserver?.disconnect()
    window.removeEventListener('resize', this.onWindowResize)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    window.removeEventListener('pagehide', this.onPageHide)
    window.removeEventListener('pageshow', this.onPageShow)
    this.canvas.removeEventListener('pointerdown', this.onCanvasPointerDown, true)
    this.canvas.removeEventListener('pointermove', this.onCanvasPointerMove, true)
    this.canvas.removeEventListener('pointerup', this.onCanvasPointerUp, true)
    this.canvas.removeEventListener('pointercancel', this.onCanvasPointerCancel, true)
    this.canvas.removeEventListener('pointerleave', this.onCanvasPointerCancel, true)
    this.canvas.removeEventListener('touchmove', this.onCanvasTouchMove)
    this.canvas.removeEventListener('contextmenu', this.onCanvasContextMenu)
    this.canvas.remove()
    releaseCanvasStyle()
    if (this.containerPositionChanged) this.options.container.style.position = this.previousContainerPosition
    this.containerPositionChanged = false
    this.sizePercentValue = DEFAULT_SIZE_PERCENT
  }

  rePlace() {
    if (this.disposed) return
    this.pendingGhost = null
    this.scene?.setGhost(null)
    this.placed = false
    this.tapStart = null
    this.tapMoved = false
    if (this.anchor) {
      this.anchor.visible = false
      this.anchor.position.set(0, this.modelBaseY(), 0)
      this.anchor.rotation.y = 0
      this.anchor.updateMatrixWorld(true)
    }
    this.scene?.setInteractive(false)
    if (this.started && this.running) {
      if (this.tracking === 'normal') {
        this.phaseValue = 'placing'
        this.message = 'Placement cleared. Tap a textured floor patch to place the coast again.'
      } else {
        this.phaseValue = 'tracking-lost'
        this.message = 'Placement cleared. Wait for normal tracking before placing the coast again.'
      }
    }
    this.emitState()
  }

  setIslandSize(percent: number) {
    if (this.disposed || !Number.isFinite(percent)) return
    const clamped = Math.min(MAX_SIZE_PERCENT, Math.max(MIN_SIZE_PERCENT, percent))
    this.sizePercentValue = Math.round(clamped / SIZE_STEP_PERCENT) * SIZE_STEP_PERCENT
    this.applySize()
    this.emitState()
  }

  setPieces(pieces: BreakWavesPiece[]) {
    this.pendingPieces = pieces
    this.scene?.setPieces(pieces)
  }

  setWavePieces(pieces: BreakWavesPiece[]) {
    this.pendingWavePieces = pieces
    this.scene?.setWavePieces(pieces)
  }

  setSelected(pieceId: PieceId | null) {
    this.pendingSelected = pieceId
    this.scene?.setSelected(pieceId)
  }

  setGhost(ghost: GhostPiece | null) {
    this.pendingGhost = ghost
    this.scene?.setGhost(ghost)
  }

  setLens(lens: LensId | null) {
    this.pendingLens = lens
    this.scene?.setLens(lens)
  }

  setEvaluation(result: BreakWavesResult) {
    this.pendingEvaluation = result
    this.scene?.setEvaluation(result)
  }

  private modelScale() {
    return DEFAULT_MODEL_SCALE * (this.sizePercentValue / 100)
  }

  private parentScale() {
    return this.modelScale() * PUZZLE_SCALE
  }

  private modelBaseY() {
    return 0.48 * this.modelScale() + 0.002
  }

  private applySize() {
    if (!this.anchor) return
    const x = this.anchor.position.x
    const z = this.anchor.position.z
    const yaw = this.anchor.rotation.y
    this.anchor.scale.setScalar(this.parentScale())
    this.anchor.position.set(x, this.modelBaseY(), z)
    this.anchor.rotation.y = yaw
    this.anchor.updateMatrixWorld(true)
    // W1 derives world-space point-light distance and shadow extent from this parent scale.
    this.scene?.update(performance.now() / 1000)
  }

  private refreshIdlePhase() {
    if (this.starting || this.running) return
    if (runtime.reloadRequired) {
      this.phaseValue = 'failed'
      this.message =
        runtime.loadError ?? 'Reload the page before using world tracking again; the previous startup did not finish cleanly.'
      this.emitState()
      return
    }
    if (!this.sdk) {
      this.phaseValue = 'preparing'
      this.emitState()
      return
    }
    const support = compatibility(this.sdk.XR8)
    if (!support.compatible) {
      this.phaseValue = 'unavailable'
      const reasonText = support.reasons.length ? ` (${support.reasons.join(', ')})` : ''
      this.message = `This browser/device cannot run world tracking${reasonText}. No camera was requested.`
      this.emitState()
      return
    }
    this.phaseValue = 'ready'
    this.message = 'Engine ready. Start the rear camera when you are standing over a textured floor.'
    this.emitState()
  }

  private canStart() {
    if (this.disposed || runtime.reloadRequired || cooldownActive()) return false
    if (this.starting || this.started || this.running || this.modulesInstalled || this.runRequested) return false
    if (runtime.owner && runtime.owner !== this.ownerToken) return false
    if (!runtime.sdk) return false
    return compatibility(runtime.sdk.XR8).compatible
  }

  private handleCooldownChange = () => {
    if (this.disposed || this.starting || this.running) return
    if (this.phaseValue === 'ready') {
      this.refreshIdlePhase()
      return
    }
    if (!runtime.reloadRequired && (this.phaseValue === 'stopped' || this.phaseValue === 'paused')) {
      this.message =
        this.phaseValue === 'paused'
          ? 'Camera paused. Start again and place the coast afresh; your shared layout is safe.'
          : 'Camera stopped. Start again and place the coast afresh; your shared layout is safe.'
    }
    this.emitState()
  }

  private emitState() {
    if (this.disposed) return
    this.options.onState?.({
      phase: this.phaseValue,
      canStart: this.canStart(),
      reloadRequired: runtime.reloadRequired,
      message: this.message,
      sizePercent: this.sizePercentValue,
    })
  }

  private addPipelineModules(generation: number) {
    const sdk = this.sdk
    if (!sdk) throw new Error('The world-tracking engine is not ready.')
    const { XR8 } = sdk
    XR8.XrController.configure({ disableWorldTracking: false, scale: 'responsive' })

    const custom = {
      name: `break-waves-world-${generation}`,
      requiredPermissions: () => {
        const permissions = XR8.XrPermissions.permissions()
        return [permissions.CAMERA, permissions.DEVICE_ORIENTATION]
      },
      onStart: () => {
        if (generation !== this.generation) return
        this.handleEngineStart(generation)
      },
      onCanvasSizeChange: () => {
        if (generation === this.generation) this.resizeCanvas()
      },
      onUpdate: ({ processCpuResult }: any) => {
        if (generation !== this.generation) return
        const reality = processCpuResult?.reality
        if (reality) this.updateTrackingState(reality.trackingStatus, reality.trackingReason)
        this.scene?.update(performance.now() / 1000)
      },
      onCameraStatusChange: ({ status }: any) => {
        if (generation !== this.generation) return
        if (status === 'requesting') {
          this.phaseValue = 'starting'
          this.message = 'Waiting for camera permission…'
          this.emitState()
        } else if (status === 'hasStream') {
          this.phaseValue = 'starting'
          this.message = 'Camera stream ready. Waiting for video frames.'
          this.emitState()
        } else if (status === 'hasVideo') {
          this.cameraVisible = true
          this.applyCanvasPresentation(true)
          this.refreshSessionPhase()
        } else if (status === 'failed') {
          this.failSession('Camera access failed or was denied. Check camera and motion permissions.')
        }
      },
      onException: (error: unknown) => {
        if (generation !== this.generation) return
        this.failSession(
          `World tracking stopped after an engine error. ${safeErrorMessage(error) || 'The engine reported an error.'}`,
          error,
        )
      },
      onRemove: () => {
        if (generation === this.sceneToken) this.teardownScene()
      },
    }

    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      custom,
    ])
    this.modulesInstalled = true
  }

  private handleEngineStart(generation: number) {
    if (generation !== this.generation || !this.starting || this.started) return
    try {
      // Full-stage CSS and drawing buffer are refreshed before the scene is created; onCanvasSizeChange
      // may arrive later, but nothing waits for that callback to size the first frame.
      this.resizeCanvas()
      this.setupScene(generation)
      this.started = true
      this.starting = false
      this.running = true
      this.cameraVisible = true
      this.applyCanvasPresentation(true)
      this.clearStartTimer()
      this.refreshSessionPhase()
    } catch (error) {
      this.failSession(
        `The 3D coast could not start. ${safeErrorMessage(error) || 'The engine scene is unavailable.'}`,
        error,
      )
    }
  }

  private setupScene(generation: number) {
    const sdk = this.sdk
    if (!sdk) throw new Error('The 3D dependencies are not ready.')
    const xrScene = sdk.XR8.Threejs.xrScene()
    if (!xrScene?.scene || !xrScene?.camera) throw new Error('The 8th Wall Three.js scene is unavailable.')

    this.teardownScene()
    const scene = xrScene.scene
    const camera = xrScene.camera
    const renderer = xrScene.renderer
    this.engineScene = scene
    this.sceneCamera = camera
    this.renderer = renderer
    this.raycaster = new sdk.THREE.Raycaster()
    this.placementPlane = new sdk.THREE.Plane(new sdk.THREE.Vector3(0, 1, 0), 0)

    // The accepted trial's initial floor-facing pose establishes the tracking origin. The engine
    // owns the camera after startup; this pose is never reapplied per frame.
    camera.position.set(INITIAL_CAMERA.x, INITIAL_CAMERA.y, INITIAL_CAMERA.z)
    camera.lookAt(new sdk.THREE.Vector3(0, 0, 0))
    camera.updateMatrixWorld(true)
    sdk.XR8.XrController.updateCameraProjectionMatrix({
      origin: camera.position,
      facing: camera.quaternion,
    })

    const anchor = new sdk.THREE.Group()
    anchor.name = 'break-waves-world-anchor'
    anchor.visible = false
    anchor.scale.setScalar(this.parentScale())
    anchor.position.set(0, this.modelBaseY(), 0)
    anchor.rotation.y = 0
    scene.add(anchor)
    this.anchor = anchor

    this.scene = createBreakWavesScene(sdk.THREE, anchor, renderer, camera, {
      mySide: this.options.mySide,
      registration: 'floor',
      callbacks: {
        onSelectPiece: (pieceId) => {
          if (this.playable()) this.options.onSelectPiece(pieceId)
        },
        onWaterTap: (point) => {
          if (this.playable()) this.options.onWaterTap(point)
        },
      },
    })
    this.scene.setInteractive(false)
    this.applyPendingState()
    this.scene.update(0)
    this.sceneToken = generation

    const onTrackingStatus = (event: any) => {
      if (generation !== this.generation) return
      const detail = event?.detail || event
      this.updateTrackingState(detail?.status, detail?.reason)
    }
    window.addEventListener('reality.trackingstatus', onTrackingStatus)
    this.trackingListener = () => window.removeEventListener('reality.trackingstatus', onTrackingStatus)

    if (renderer?.domElement) {
      this.contextLostHandler = () => {
        if (generation !== this.generation) return
        this.failSession('The AR graphics context was lost.', undefined, true)
      }
      renderer.domElement.addEventListener('webglcontextlost', this.contextLostHandler)
    }
  }

  private applyPendingState() {
    if (!this.scene) return
    this.scene.setPieces(this.pendingPieces)
    this.scene.setWavePieces(this.pendingWavePieces)
    this.scene.setSelected(this.pendingSelected)
    this.scene.setGhost(this.pendingGhost)
    this.scene.setLens(this.pendingLens)
    if (this.pendingEvaluation) this.scene.setEvaluation(this.pendingEvaluation)
  }

  private teardownScene() {
    this.trackingListener?.()
    this.trackingListener = null

    if (this.contextLostHandler && this.renderer?.domElement) {
      try {
        this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLostHandler)
      } catch {
        // The canvas may already be detached.
      }
    }
    this.contextLostHandler = null

    try {
      this.scene?.dispose()
    } catch {
      // A partly built scene is still removed below.
    }
    this.scene = null
    if (this.anchor && this.engineScene) {
      try {
        this.engineScene.remove(this.anchor)
      } catch {
        // The engine scene may already be gone.
      }
    }
    this.anchor = null
    this.engineScene = null
    this.sceneCamera = null
    this.renderer = null
    this.raycaster = null
    this.placementPlane = null
    this.sceneToken = null
    this.placed = false
    this.tapStart = null
    this.tapMoved = false
  }

  private releaseEngine() {
    if (runtime.owner !== this.ownerToken) {
      this.modulesInstalled = false
      return
    }
    const sdk = this.sdk
    if (sdk) {
      try {
        sdk.XR8.stop()
      } catch {
        // The engine may already be stopped. Reload remains available for an uncertain stop.
        runtime.reloadRequired = true
      }
      if (this.modulesInstalled) {
        try {
          sdk.XR8.clearCameraPipelineModules()
        } catch {
          runtime.reloadRequired = true
        }
      }
    }
    this.modulesInstalled = false
    runtime.owner = null
    beginStopCooldown()
  }

  private failSession(message: string, error?: unknown, forceReload = false) {
    const pendingStart = this.starting && !this.started
    if (pendingStart || forceReload) runtime.reloadRequired = true
    this.generation += 1
    this.clearStartTimer()
    this.starting = false
    this.started = false
    this.running = false
    this.runRequested = false
    this.cameraVisible = false
    this.tracking = 'unknown'
    this.teardownScene()
    this.releaseEngine()
    this.applyCanvasPresentation(false)
    this.phaseValue = error ? errorPhase(error) : 'failed'
    if (runtime.reloadRequired) {
      this.message = `${message} Reload the page before starting world tracking again.`
    } else {
      this.message = `${message} You can retry with Start.`
    }
    this.emitState()
    if (cooldownActive()) notifyCooldownChange(this.handleCooldownChange)
  }

  private clearStartTimer() {
    if (this.startTimer) window.clearTimeout(this.startTimer)
    this.startTimer = 0
  }

  private updateTrackingState(status: unknown, reason: unknown) {
    const nextStatus = String(status || '')
    const nextReason = String(reason || '')
    const next =
      nextStatus === 'NORMAL'
        ? 'normal'
        : nextStatus === 'LIMITED' || nextReason === 'INITIALIZING'
          ? 'limited'
          : null
    if (!next || next === this.tracking) return
    this.tracking = next
    if (!this.started || !this.running) return
    this.refreshSessionPhase()
  }

  private refreshSessionPhase() {
    if (!this.started || !this.running) return
    this.updatePlayableState()
    if (this.tracking === 'normal') {
      if (this.placed) {
        this.phaseValue = 'tracking'
        this.message = 'Placed on the estimated floor. Construction is available while tracking is normal.'
      } else {
        this.phaseValue = 'placing'
        this.message = 'Normal tracking. Tap a textured floor patch to place the coast.'
      }
    } else if (this.tracking === 'limited') {
      this.phaseValue = 'tracking-lost'
      this.message = 'Tracking limited. The coast is hidden until normal tracking returns.'
    } else {
      this.phaseValue = 'starting'
      this.message = 'Move the phone slowly to find the estimated floor.'
    }
    this.applyCanvasPresentation(this.cameraVisible)
    this.emitState()
  }

  private playable() {
    return Boolean(
      !this.disposed &&
        this.started &&
        this.running &&
        this.cameraVisible &&
        this.tracking === 'normal' &&
        this.placed &&
        this.anchor &&
        this.scene,
    )
  }

  private updatePlayableState() {
    const playable = this.playable()
    if (this.anchor) this.anchor.visible = playable
    this.scene?.setInteractive(playable)
  }

  private canPlace() {
    return Boolean(
      !this.disposed &&
        this.started &&
        this.running &&
        this.cameraVisible &&
        this.tracking === 'normal' &&
        !this.placed &&
        this.scene &&
        this.sceneCamera &&
        this.raycaster &&
        this.placementPlane,
    )
  }

  private tryPlace(clientX: number, clientY: number) {
    if (!this.canPlace()) return false
    const rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return false
    const x = ((clientX - rect.left) / rect.width) * 2 - 1
    const y = -((clientY - rect.top) / rect.height) * 2 + 1
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1.2 || Math.abs(y) > 1.2) return false

    this.sceneCamera.updateMatrixWorld(true)
    this.raycaster.setFromCamera({ x, y }, this.sceneCamera)
    const ray = this.raycaster.ray
    if (!ray || !Number.isFinite(ray.direction.y) || ray.direction.y > -0.02) {
      this.phaseValue = 'placing'
      this.message = 'That tap did not meet the estimated floor plane. Aim lower at a textured floor patch.'
      this.emitState()
      return false
    }

    const hit = new this.sdk!.THREE.Vector3()
    const intersection = ray.intersectPlane(this.placementPlane, hit)
    if (
      !intersection ||
      !Number.isFinite(hit.x) ||
      !Number.isFinite(hit.y) ||
      !Number.isFinite(hit.z)
    ) {
      this.phaseValue = 'placing'
      this.message = 'That tap did not meet the estimated floor plane. Aim lower at a textured floor patch.'
      this.emitState()
      return false
    }

    const distance = hit.distanceTo(this.sceneCamera.position)
    if (distance < MIN_PLACEMENT_DISTANCE || distance > MAX_PLACEMENT_DISTANCE) {
      this.phaseValue = 'placing'
      this.message = 'Tap a floor point within a few steps of where you are standing.'
      this.emitState()
      return false
    }

    const yaw = Math.atan2(this.sceneCamera.position.x - hit.x, this.sceneCamera.position.z - hit.z)
    this.anchor.position.set(hit.x, this.modelBaseY(), hit.z)
    this.anchor.rotation.y = yaw
    this.anchor.visible = true
    this.anchor.updateMatrixWorld(true)
    this.placed = true
    this.phaseValue = 'tracking'
    this.message = 'Placed on the estimated floor. Construction is available while tracking is normal.'
    this.updatePlayableState()
    this.scene?.update(performance.now() / 1000)
    this.emitState()
    return true
  }

  private applyCanvasPresentation(visible: boolean) {
    const style = this.canvas.style
    style.setProperty('position', 'absolute')
    style.setProperty('inset', '0')
    style.setProperty('display', 'block')
    style.setProperty('width', '100%', 'important')
    style.setProperty('height', '100%', 'important')
    style.setProperty('touch-action', 'none')
    style.setProperty('outline', 'none')
    style.setProperty('z-index', '1')
    style.setProperty('visibility', visible ? 'visible' : 'hidden')
  }

  private ensureContainerPosition() {
    const container = this.options.container
    if (window.getComputedStyle(container).position !== 'static') return
    this.previousContainerPosition = container.style.position
    container.style.position = 'relative'
    this.containerPositionChanged = true
  }

  private resizeCanvas() {
    const pixelRatio = window.devicePixelRatio || 1
    const width = Math.max(1, Math.round(this.options.container.clientWidth * pixelRatio))
    const height = Math.max(1, Math.round(this.options.container.clientHeight * pixelRatio))
    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height
    // Reassert the CSS bounds in case the engine wrote pixel sizes to this canvas.
    this.applyCanvasPresentation(this.cameraVisible || this.started)
  }

  private onCanvasPointerDown = (event: PointerEvent) => {
    if (!this.canPlace()) return
    this.tapStart = { id: event.pointerId, x: event.clientX, y: event.clientY }
    this.tapMoved = false
  }

  private onCanvasPointerMove = (event: PointerEvent) => {
    if (!this.tapStart || event.pointerId !== this.tapStart.id) return
    if (Math.hypot(event.clientX - this.tapStart.x, event.clientY - this.tapStart.y) >= TAP_MOVE_LIMIT) {
      this.tapMoved = true
    }
  }

  private onCanvasPointerUp = (event: PointerEvent) => {
    if (!this.tapStart || event.pointerId !== this.tapStart.id) return
    const start = this.tapStart
    this.tapStart = null
    if (this.tapMoved) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) >= TAP_MOVE_LIMIT) return
    if (!this.tryPlace(event.clientX, event.clientY)) return
    // The scene registered its own bubble-phase pointer listener when it was created. Consuming the
    // successful placement in capture phase keeps that same tap from selecting or constructing.
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  private onCanvasPointerCancel = () => {
    this.tapStart = null
    this.tapMoved = false
  }

  private onCanvasTouchMove = (event: TouchEvent) => {
    event.preventDefault()
  }

  private onCanvasContextMenu = (event: MouseEvent) => {
    event.preventDefault()
  }

  private onWindowResize = () => {
    if (this.starting || this.running) this.resizeCanvas()
  }

  private onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') this.stop('paused')
  }

  private onPageHide = () => {
    this.stop('stopped')
  }

  private onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return
    if (this.phaseValue === 'starting') this.stop('paused')
  }
}
