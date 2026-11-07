// Standalone coastal AR experiment. This page deliberately does not use the React app,
// Supabase, authentication or the trail session hooks. It is a local feasibility check only.
import './ar.css'
import { createCoastalScene, type CoastalScene, type CoastalSceneState } from './coastalScene'

type Phase =
  | 'intro'
  | 'starting'
  | 'stopping'
  | 'scanning'
  | 'tracking'
  | 'tracking-lost'
  | 'stopped'
  | 'paused'
  | 'denied'
  | 'unavailable'
  | 'failed'

interface VendorModules {
  THREE: any
  MindARThree: any
}

const vendorBase = new URL('ar/vendor/', document.baseURI)
const targetUrl = new URL('ar/targets/coastal-target.mind', document.baseURI).href

const startScreen = byId<HTMLElement>('start-screen')
const startButton = byId<HTMLButtonElement>('start-button')
const statusPanel = byId<HTMLElement>('status-panel')
const statusKicker = byId<HTMLElement>('status-kicker')
const statusTitle = byId<HTMLElement>('status-title')
const statusCopy = byId<HTMLElement>('status-copy')
const retryButton = byId<HTMLButtonElement>('retry-button')
const cancelStartButton = byId<HTMLButtonElement>('cancel-start-button')
const stopButton = byId<HTMLButtonElement>('stop-button')
const controls = byId<HTMLElement>('ar-controls')
const controlStatus = byId<HTMLElement>('control-status')
const rotateButton = byId<HTMLButtonElement>('rotate-button')
const resetButton = byId<HTMLButtonElement>('reset-button')
const livePill = byId<HTMLElement>('live-pill')
const liveText = byId<HTMLElement>('live-text')
const hint = byId<HTMLElement>('ar-hint')
const hintText = byId<HTMLElement>('hint-text')
const stage = byId<HTMLElement>('ar-stage')

let phase: Phase = 'intro'
let mindar: any = null
let anchor: any = null
let scene: CoastalScene | null = null
let sceneState: CoastalSceneState = { placed: 0, selected: null, quarterTurns: null, live: false }
let trackingLive = false
let startPending = false
let cancelAfterStart: Phase | null = null
let sessionGeneration = 0
let renderFrame = 0
let vendorPromise: Promise<VendorModules> | null = null
let startingCopy: string | null = null

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing #${id}`)
  return element as T
}

function loadVendor(): Promise<VendorModules> {
  if (!vendorPromise) {
    const threeUrl = new URL('three-0.160.0/build/three.module.min.js', vendorBase).href
    const mindarUrl = new URL('mind-ar-1.2.5/mindar-image-three.prod.js', vendorBase).href
    vendorPromise = Promise.all([
      import(/* @vite-ignore */ threeUrl),
      import(/* @vite-ignore */ mindarUrl),
    ])
      .then(([THREE, mindarModule]) => ({ THREE, MindARThree: mindarModule.MindARThree }))
      .catch((error: unknown) => {
        vendorPromise = null
        throw error
      })
  }
  return vendorPromise
}

function statusCopyFor(next: Phase): { kicker: string; title: string; copy: string } {
  switch (next) {
    case 'starting':
      return {
        kicker: 'Starting',
        title: 'Starting the camera…',
        copy: startingCopy ?? 'Allow camera access when your browser asks. The camera frames stay on this device and are never uploaded.',
      }
    case 'stopping':
      return {
        kicker: 'Stopping',
        title: 'Releasing the camera…',
        copy: 'If the camera permission prompt is still open, finish or dismiss it, or reload the page.',
      }
    case 'denied':
      return {
        kicker: 'Camera blocked',
        title: 'Camera access is blocked',
        copy: "In Safari, open the aA menu in the address bar, choose Website Settings, set Camera to Allow, then try again. Camera access also needs HTTPS. If this page was opened from a localhost QR code on a phone, use the HTTPS preview URL printed on the card instead.",
      }
    case 'unavailable':
      return {
        kicker: 'Camera unavailable',
        title: 'The rear camera could not start',
        copy: 'Close other apps that use the camera, check this page is served over HTTPS, then try again. A desktop webcam can be used for a preliminary check, but it does not prove Safari behaviour on a phone.',
      }
    case 'failed':
      return {
        kicker: 'Session failed',
        title: 'The AR session could not start',
        copy: 'Check that the files under /ar/ are being served, then try again. If it keeps failing, reload the page and check the browser console.',
      }
    case 'stopped':
      return {
        kicker: 'Stopped',
        title: 'Camera stopped',
        copy: 'The camera and AR worker have been released. Placed sections stay on this page. Start again to continue.',
      }
    case 'paused':
      return {
        kicker: 'Paused',
        title: 'Camera paused',
        copy: 'The camera was released when you left the page. Start again when you are ready.',
      }
    default:
      return { kicker: '', title: '', copy: '' }
  }
}

function setPhase(next: Phase) {
  phase = next
  const showStatus = ['starting', 'stopping', 'denied', 'unavailable', 'failed', 'stopped', 'paused'].includes(next)
  const showLive = ['scanning', 'tracking', 'tracking-lost'].includes(next)
  startScreen.hidden = next !== 'intro'
  statusPanel.hidden = !showStatus
  stopButton.hidden = !showLive
  controls.hidden = !showLive
  livePill.hidden = !showLive

  if (showStatus) {
    const copy = statusCopyFor(next)
    statusKicker.textContent = copy.kicker
    statusTitle.textContent = copy.title
    statusCopy.textContent = copy.copy
    const canStart = ['denied', 'unavailable', 'failed', 'stopped', 'paused'].includes(next)
    retryButton.hidden = !canStart
    retryButton.textContent = next === 'stopped' || next === 'paused' ? 'Start again' : 'Try again'
    cancelStartButton.hidden = next !== 'starting'
  }

  if (next === 'scanning') {
    liveText.textContent = 'Looking for the card'
    livePill.dataset.state = 'searching'
    hint.hidden = false
    hintText.textContent = 'Point the rear camera at the coastal illustration on the card. Hold it flat, fill the frame and use good light.'
  } else if (next === 'tracking') {
    liveText.textContent = 'Tracking live'
    livePill.dataset.state = 'live'
    hint.hidden = true
  } else if (next === 'tracking-lost') {
    liveText.textContent = 'Card lost'
    livePill.dataset.state = 'searching'
    hint.hidden = false
    hintText.textContent = 'Illustration lost. Point the camera back at the coastal illustration. Model controls are paused until tracking returns.'
  } else {
    hint.hidden = true
  }

  updateControls()
}

function updateControls() {
  const live = trackingLive && (phase === 'tracking' || phase === 'tracking-lost')
  const selected = sceneState.selected
  const placed = sceneState.placed
  rotateButton.disabled = !live || selected === null
  resetButton.disabled = !live || placed === 0

  if (!live) {
    controlStatus.textContent = 'Model controls unlock while the illustration is tracked.'
    return
  }
  if (selected !== null) {
    const turns = sceneState.quarterTurns ?? 0
    if (turns === 0) {
      controlStatus.textContent = `Slot ${selected + 1} selected. It is broadside, so the water behind it is calmer. Tap Rotate 90° to turn it edge-on.`
    } else if (turns === 2) {
      controlStatus.textContent = `Slot ${selected + 1} selected, turned 180° from its guide. It is still broadside, so its wave shadow remains. Tap Rotate 90° to turn it edge-on.`
    } else {
      controlStatus.textContent = `Slot ${selected + 1} selected, turned ${turns * 90}° from its guide. It is edge-on to the waves, so it adds no shelter. Tap Rotate 90° again to turn it broadside.`
    }
    return
  }
  if (placed > 0) {
    controlStatus.textContent = `${placed} section${placed === 1 ? '' : 's'} placed. Broadside sections calm the water behind them; tap one to select it.`
    return
  }
  controlStatus.textContent = 'Tap a glowing ring on the water to place a breakwater section broadside to the waves.'
}

function handleSceneChange(next: CoastalSceneState) {
  sceneState = next
  updateControls()
}

async function ensureAr() {
  if (mindar) return
  const { THREE, MindARThree } = await loadVendor()
  const instance = new MindARThree({
    container: stage,
    imageTargetSrc: targetUrl,
    maxTrack: 1,
    // The experiment draws its own loading, scanning and error states.
    uiLoading: 'no',
    uiScanning: 'no',
    uiError: 'no',
  })
  mindar = instance
  // The CSS3D layer is unused. It must not swallow the taps meant for the 3D slots.
  if (instance.cssRenderer?.domElement?.style) instance.cssRenderer.domElement.style.pointerEvents = 'none'
  anchor = instance.addAnchor(0)
  anchor.onTargetFound = () => {
    if (!mindar) return
    trackingLive = true
    scene?.setInteractive(true)
    if (phase === 'starting' || phase === 'scanning' || phase === 'tracking-lost') setPhase('tracking')
    else updateControls()
  }
  anchor.onTargetLost = () => {
    trackingLive = false
    scene?.setInteractive(false)
    if (phase === 'scanning' || phase === 'tracking' || phase === 'tracking-lost') setPhase('tracking-lost')
    else updateControls()
  }
  scene = createCoastalScene(THREE, anchor.group, instance.renderer, instance.camera, { onChange: handleSceneChange })
}

async function startWithCameraErrorCapture(instance: any): Promise<void> {
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

function cameraPhase(error: unknown): Phase {
  const name = error instanceof DOMException ? error.name : (error as { name?: string } | null)?.name
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'NotReadableError' || name === 'OverconstrainedError') return 'unavailable'
  // MindAR's camera startup rejects with no error object. Other errors happened after setup.
  if (error === undefined || error === null) return 'unavailable'
  return 'failed'
}

function resetArSetup() {
  stopRenderLoop()
  try {
    scene?.dispose()
  } catch {
    // The scene may only be partly built.
  }
  scene = null
  cleanupPartialSession()
  if (mindar) {
    try {
      mindar.renderer?.dispose?.()
      mindar.renderer?.domElement?.remove()
      mindar.cssRenderer?.domElement?.remove()
      mindar.ui?.loadingModal?.remove?.()
      mindar.ui?.scanningMask?.remove?.()
      mindar.ui?.compatibilityModal?.remove?.()
    } catch {
      // Best-effort teardown of a partly constructed instance.
    }
  }
  mindar = null
  anchor = null
  trackingLive = false
  sceneState = { placed: 0, selected: null, quarterTurns: null, live: false }
}

function cleanupPartialSession() {
  if (!mindar) return
  try {
    const controller = mindar.controller
    if (controller) {
      // An in-flight tracking loop may still call onUpdate after stopProcessVideo.
      controller.onUpdate = null
      controller.stopProcessVideo?.()
      controller.dispose?.()
    }
  } catch {
    // The worker may already be gone. The camera tracks below still need stopping.
  }
  mindar.controller = null

  const video = mindar.video
  if (video) {
    try {
      const stream = video.srcObject as MediaStream | null
      stream?.getTracks().forEach((track) => track.stop())
      video.pause()
    } catch {
      // A detached video can throw here; removing it is enough.
    }
    video.srcObject = null
    video.remove()
  }
  mindar.video = null
  try {
    mindar.renderer?.clear?.()
  } catch {
    // The context can already be gone during page teardown.
  }

  if (anchor) {
    anchor.visible = false
    anchor.group.visible = false
  }
  trackingLive = false
  scene?.setInteractive(false)
}

function stopRenderLoop() {
  if (renderFrame) cancelAnimationFrame(renderFrame)
  renderFrame = 0
}

function startRenderLoop() {
  if (renderFrame) return
  const frame = (now: number) => {
    renderFrame = requestAnimationFrame(frame)
    if (!mindar) return
    scene?.update(now / 1000)
    mindar.renderer.render(mindar.scene, mindar.camera)
  }
  renderFrame = requestAnimationFrame(frame)
}

async function startSession() {
  if (startPending) return
  startPending = true
  cancelAfterStart = null
  startingCopy = null
  const generation = ++sessionGeneration
  setPhase('starting')
  updateControls()

  let finishedNormally = false
  let cameraAttemptStarted = false
  try {
    if (!mindar) {
      startingCopy = 'Loading the local AR engine…'
      setPhase('starting')
    }
    await ensureAr()
    if (generation !== sessionGeneration) return
    startingCopy = null
    setPhase('starting')
    cleanupPartialSession()
    cameraAttemptStarted = true
    await startWithCameraErrorCapture(mindar)
    if (generation !== sessionGeneration) return
    finishedNormally = true
    const alreadyTracking = Boolean(anchor?.visible)
    trackingLive = alreadyTracking
    scene?.setInteractive(alreadyTracking)
    startRenderLoop()
    setPhase(alreadyTracking ? 'tracking' : 'scanning')
  } catch (error) {
    if (generation !== sessionGeneration) return
    if (!cameraAttemptStarted) resetArSetup()
    else cleanupPartialSession()
    setPhase(cameraAttemptStarted ? cameraPhase(error) : 'failed')
  } finally {
    startPending = false
    if (!finishedNormally && (cancelAfterStart || generation !== sessionGeneration)) {
      cleanupPartialSession()
      const target = cancelAfterStart ?? 'stopped'
      cancelAfterStart = null
      setPhase(target)
    }
    updateControls()
  }
}

function stopSession(target: 'stopped' | 'paused' = 'stopped') {
  if (phase === 'intro') return
  sessionGeneration += 1
  if (startPending) {
    cancelAfterStart = target
    setPhase('stopping')
    return
  }
  stopRenderLoop()
  cleanupPartialSession()
  setPhase(target)
}

startButton.addEventListener('click', () => void startSession())
retryButton.addEventListener('click', () => void startSession())
cancelStartButton.addEventListener('click', () => stopSession('stopped'))
stopButton.addEventListener('click', () => stopSession('stopped'))

rotateButton.addEventListener('click', () => {
  if (!scene || !trackingLive) return
  if (!scene.rotateSelected()) {
    controlStatus.textContent = 'Tap a placed section first, then rotate it.'
  }
})

resetButton.addEventListener('click', () => {
  if (!scene || !trackingLive) return
  scene.reset()
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (['starting', 'stopping', 'scanning', 'tracking', 'tracking-lost'].includes(phase)) stopSession('paused')
  }
})

window.addEventListener('pageshow', (event) => {
  if (event.persisted && phase !== 'intro') stopSession('paused')
})

window.addEventListener('pagehide', () => {
  stopRenderLoop()
  cleanupPartialSession()
})

window.addEventListener('error', (event) => {
  if (phase === 'starting' || phase === 'scanning' || phase === 'tracking' || phase === 'tracking-lost') {
    console.error('Coastal AR error', event.error ?? event.message)
  }
})

// Start on the intro screen. The camera is only requested after a tap, which iOS requires.
setPhase('intro')
