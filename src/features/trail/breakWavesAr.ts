// Camera and MindAR lifecycle for the Break the waves stop. The QR scanner is always unmounted before
// this controller starts, and this controller owns the camera exclusively. Every stop path removes the
// stream, worker, renderer and event listeners; saved construction lives in the database, not here.
import type { BreakWavesPiece, BreakWavesResult, PieceId, Side } from './breakWaves'
import {
  createBreakWavesScene,
  type BreakWavesScene,
  type GhostPiece,
  type LensId,
} from './breakWavesScene'

export type ArPhase =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'tracking'
  | 'tracking-lost'
  | 'paused'
  | 'stopped'
  | 'denied'
  | 'unavailable'
  | 'failed'

interface VendorModules {
  THREE: any
  MindARThree: any
}

interface Options {
  container: HTMLElement
  mySide: Side
  onPhase(phase: ArPhase): void
  onSelectPiece(pieceId: PieceId): void
  onWaterTap(point: { x: number; z: number }): void
}

const vendorBase = new URL(`${import.meta.env.BASE_URL}ar/vendor/`, window.location.origin)
const targetUrl = new URL(`${import.meta.env.BASE_URL}ar/targets/coastal-target.mind`, window.location.origin).href
let vendorPromise: Promise<VendorModules> | null = null

function loadVendor(): Promise<VendorModules> {
  if (!vendorPromise) {
    const threeUrl = new URL('three-0.160.0/build/three.module.min.js', vendorBase).href
    const mindarUrl = new URL('mind-ar-1.2.5/mindar-image-three.prod.js', vendorBase).href
    vendorPromise = Promise.all([import(/* @vite-ignore */ threeUrl), import(/* @vite-ignore */ mindarUrl)])
      .then(([THREE, mindarModule]) => ({ THREE, MindARThree: mindarModule.MindARThree }))
      .catch((error: unknown) => {
        vendorPromise = null
        throw error
      })
  }
  return vendorPromise
}

function cameraPhase(error: unknown): ArPhase {
  const name = error instanceof DOMException ? error.name : (error as { name?: string } | null)?.name
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'NotReadableError' || name === 'OverconstrainedError') return 'unavailable'
  // MindAR's camera startup rejects with no error object. Other errors happened after setup.
  if (error === undefined || error === null) return 'unavailable'
  return 'failed'
}

export class BreakWavesAr {
  phase: ArPhase = 'idle'
  private scene: BreakWavesScene | null = null
  private mindar: any = null
  private anchor: any = null
  private renderFrame = 0
  private generation = 0
  private busy = false
  private cancelledAs: ArPhase | null = null
  private disposed = false
  private pendingPieces: BreakWavesPiece[] = []
  private pendingWavePieces: BreakWavesPiece[] = []
  private pendingSelected: PieceId | null = null
  private pendingGhost: GhostPiece | null = null
  private pendingLens: LensId | null = null
  private pendingEvaluation: BreakWavesResult | null = null
  private contextLostHandler: (() => void) | null = null
  private resizeHandler: EventListenerOrEventListenerObject | null = null

  constructor(private readonly options: Options) {}

  private setPhase(next: ArPhase) {
    if (this.disposed) return
    this.phase = next
    this.options.onPhase(next)
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

  async start() {
    if (this.disposed || this.busy || this.mindar) return
    this.busy = true
    this.cancelledAs = null
    const generation = ++this.generation
    this.setPhase('starting')

    let cameraAttemptStarted = false
    try {
      const { THREE, MindARThree } = await loadVendor()
      if (this.disposed || generation !== this.generation) return
      this.options.container.replaceChildren()

      // MindAR 1.2.5 adds a window resize listener it never removes. Capture that one listener
      // during construction so this controller can release it with the rest of the AR resources.
      const originalAddEventListener = window.addEventListener
      let capturedResize: EventListenerOrEventListenerObject | null = null
      const captureAddEventListener = function (
        this: Window,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) {
        if (type === 'resize') capturedResize = listener
        return originalAddEventListener.call(this, type, listener, options)
      }
      let instance: any
      ;(window as unknown as { addEventListener: typeof window.addEventListener }).addEventListener =
        captureAddEventListener as typeof window.addEventListener
      try {
        instance = new MindARThree({
          container: this.options.container,
          imageTargetSrc: targetUrl,
          maxTrack: 1,
          uiLoading: 'no',
          uiScanning: 'no',
          uiError: 'no',
        })
      } finally {
        window.addEventListener = originalAddEventListener
      }
      this.resizeHandler = capturedResize
      this.mindar = instance
      if (instance.cssRenderer?.domElement?.style) instance.cssRenderer.domElement.style.pointerEvents = 'none'
      this.anchor = instance.addAnchor(0)
      this.anchor.onTargetFound = () => {
        if (!this.mindar || this.disposed) return
        this.scene?.setInteractive(true)
        if (this.phase === 'starting' || this.phase === 'scanning' || this.phase === 'tracking-lost') {
          this.setPhase('tracking')
        }
      }
      this.anchor.onTargetLost = () => {
        if (!this.mindar || this.disposed) return
        this.scene?.setInteractive(false)
        if (this.phase === 'scanning' || this.phase === 'tracking' || this.phase === 'tracking-lost') {
          this.setPhase('tracking-lost')
        }
      }
      this.scene = createBreakWavesScene(THREE, this.anchor.group, instance.renderer, instance.camera, {
        mySide: this.options.mySide,
        callbacks: {
          onSelectPiece: (pieceId) => this.options.onSelectPiece(pieceId),
          onWaterTap: (point) => this.options.onWaterTap(point),
        },
      })
      this.scene.setInteractive(false)
      this.applyPendingState()

      this.contextLostHandler = () => {
        this.scene?.setInteractive(false)
        this.stop('stopped')
        this.setPhase('failed')
      }
      instance.renderer.domElement.addEventListener('webglcontextlost', this.contextLostHandler)

      cameraAttemptStarted = true
      await this.startWithCameraErrorCapture(instance)
      if (this.disposed || generation !== this.generation) {
        this.cleanup()
        return
      }

      this.scene.setInteractive(Boolean(this.anchor?.visible))
      this.startRenderLoop()
      this.setPhase(this.anchor?.visible ? 'tracking' : 'scanning')
    } catch (error) {
      if (this.disposed || generation !== this.generation) {
        this.cleanup()
        return
      }
      this.cleanup()
      this.setPhase(cameraAttemptStarted ? cameraPhase(error) : 'failed')
    } finally {
      this.busy = false
      if (!this.disposed && this.cancelledAs) {
        this.cleanup()
        this.setPhase(this.cancelledAs)
        this.cancelledAs = null
      }
    }
  }

  private async startWithCameraErrorCapture(instance: any): Promise<void> {
    const mediaDevices = navigator.mediaDevices
    const original = mediaDevices?.getUserMedia
    let captured: unknown = null
    let patched = false

    if (mediaDevices && original) {
      try {
        mediaDevices.getUserMedia = function patchedGetUserMedia(this: MediaDevices, constraints: MediaStreamConstraints) {
          return original.call(this, constraints).catch((error: unknown) => {
            captured = error
            throw error
          })
        }
        patched = true
      } catch {
        // Some browsers make the method read-only. The fallback message still covers both cases.
      }
    }

    try {
      await instance.start()
    } catch (error) {
      throw captured ?? error ?? new Error('Camera did not start')
    } finally {
      if (patched && original) mediaDevices.getUserMedia = original
    }
  }

  stop(target: 'paused' | 'stopped' = 'stopped') {
    if (this.disposed || this.phase === 'idle') return
    this.generation += 1
    if (this.busy) {
      this.cancelledAs = target
      this.setPhase(target)
      return
    }
    this.cleanup()
    this.setPhase(target)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.generation += 1
    this.cancelledAs = null
    this.cleanup()
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

  private startRenderLoop() {
    if (this.renderFrame) return
    const frame = (now: number) => {
      this.renderFrame = requestAnimationFrame(frame)
      if (!this.mindar || !this.scene) return
      this.scene.update(now / 1000)
      this.mindar.renderer.render(this.mindar.scene, this.mindar.camera)
    }
    this.renderFrame = requestAnimationFrame(frame)
  }

  private stopRenderLoop() {
    if (this.renderFrame) cancelAnimationFrame(this.renderFrame)
    this.renderFrame = 0
  }

  private cleanup() {
    this.stopRenderLoop()
    try {
      this.scene?.dispose()
    } catch {
      // A partly built scene is still removed below.
    }
    this.scene = null

    if (this.contextLostHandler && this.mindar?.renderer?.domElement) {
      try {
        this.mindar.renderer.domElement.removeEventListener('webglcontextlost', this.contextLostHandler)
      } catch {
        // The canvas may already be detached.
      }
    }
    this.contextLostHandler = null

    if (this.resizeHandler) {
      try {
        window.removeEventListener('resize', this.resizeHandler)
      } catch {
        // The listener may already be gone with the page.
      }
      this.resizeHandler = null
    }

    if (this.mindar) {
      try {
        const controller = this.mindar.controller
        if (controller) {
          controller.onUpdate = null
          controller.stopProcessVideo?.()
          controller.dispose?.()
        }
      } catch {
        // The worker may already be gone. The camera tracks below still need stopping.
      }
      this.mindar.controller = null
      try {
        const video = this.mindar.video
        if (video) {
          const stream = video.srcObject as MediaStream | null
          stream?.getTracks().forEach((track) => track.stop())
          video.pause()
          video.srcObject = null
          video.remove()
        }
      } catch {
        // A detached video can throw; the container is cleared anyway.
      }
      this.mindar.video = null
      try {
        this.mindar.renderer?.dispose?.()
        this.mindar.renderer?.domElement?.remove()
        this.mindar.cssRenderer?.domElement?.remove()
        this.mindar.ui?.loadingModal?.remove?.()
        this.mindar.ui?.scanningMask?.remove?.()
        this.mindar.ui?.compatibilityModal?.remove?.()
      } catch {
        // Best-effort teardown of a partly constructed instance.
      }
    }
    this.mindar = null
    this.anchor = null
    this.options.container.replaceChildren()
  }
}
