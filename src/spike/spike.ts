// Standalone camera spike. Not part of the React app, and nothing is uploaded or stored.
import './spike.css'

const video = document.querySelector<HTMLVideoElement>('#video')!
const overlay = document.querySelector<HTMLCanvasElement>('#overlay')!
const startButton = document.querySelector<HTMLButtonElement>('#start')!
const captureButton = document.querySelector<HTMLButtonElement>('#capture')!
const preview = document.querySelector<HTMLImageElement>('#preview')!
const guidance = document.querySelector<HTMLParagraphElement>('#guidance')!
const logList = document.querySelector<HTMLOListElement>('#log')!
const context = overlay.getContext('2d')!

const targetRadius = 48
let stream: MediaStream | null = null
let tapCount = 0
let tapFlashUntil = 0
let wantCamera = false

function log(message: string) {
  const item = document.createElement('li')
  item.textContent = `${new Date().toLocaleTimeString()} ${message}`
  logList.prepend(item)
}

function streamIsLive() {
  return stream !== null && stream.getTracks().every((track) => track.readyState === 'live')
}

async function startCamera() {
  wantCamera = true
  guidance.hidden = true
  stream?.getTracks().forEach((track) => track.stop())
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    })
    video.srcObject = stream
    await video.play()
    const settings = stream.getVideoTracks()[0].getSettings()
    log(`Camera started (facingMode ${settings.facingMode ?? 'not reported'}, ${settings.width}x${settings.height})`)
    captureButton.disabled = false
    startButton.textContent = 'Restart camera'
  } catch (error) {
    wantCamera = false
    captureButton.disabled = true
    const name = error instanceof DOMException ? error.name : 'Error'
    log(`Camera failed: ${name}`)
    guidance.textContent =
      name === 'NotAllowedError'
        ? 'Camera access was denied. Allow the camera for this site in your browser settings, then tap Start camera again.'
        : 'The camera could not start. Close other apps that use the camera, then tap Start camera again.'
    guidance.hidden = false
  }
}

function capturePhoto() {
  if (!video.videoWidth) return
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d')!.drawImage(video, 0, 0)
  preview.src = canvas.toDataURL('image/jpeg', 0.85)
  preview.hidden = false
  log('Photo captured to preview')
}

// The graphic orbits the centre so there is always something moving over the feed.
function targetPosition(time: number) {
  const { width, height } = overlay
  return {
    x: width / 2 + Math.cos(time / 1200) * width * 0.25,
    y: height / 2 + Math.sin(time / 900) * height * 0.25,
  }
}

function draw(time: number) {
  const { width, height } = overlay
  context.clearRect(0, 0, width, height)
  const { x, y } = targetPosition(time)
  const flashing = time < tapFlashUntil

  context.beginPath()
  context.arc(x, y, targetRadius, 0, Math.PI * 2)
  context.fillStyle = flashing ? '#ffd23f' : '#ffffff'
  context.globalAlpha = 0.85
  context.fill()
  context.globalAlpha = 1
  context.lineWidth = 6
  context.strokeStyle = '#0b3d3e'
  context.stroke()

  // Dark outline keeps the text readable on bright backgrounds.
  context.font = 'bold 28px system-ui, sans-serif'
  context.textAlign = 'center'
  context.lineWidth = 6
  context.strokeStyle = '#000000'
  context.fillStyle = '#ffffff'
  const label = `Taps: ${tapCount}`
  context.strokeText(label, width / 2, 44)
  context.fillText(label, width / 2, 44)

  requestAnimationFrame(draw)
}

function resizeOverlay() {
  overlay.width = overlay.clientWidth
  overlay.height = overlay.clientHeight
}

overlay.addEventListener('pointerdown', (event) => {
  const rect = overlay.getBoundingClientRect()
  const { x, y } = targetPosition(performance.now())
  const distance = Math.hypot(event.clientX - rect.left - x, event.clientY - rect.top - y)
  if (distance <= targetRadius) {
    tapCount += 1
    tapFlashUntil = performance.now() + 300
    log(`Overlay tapped (${tapCount})`)
  }
})

// Locking the phone or switching apps can end the stream, so restart it when the page is visible again.
document.addEventListener('visibilitychange', () => {
  log(`Page ${document.visibilityState}`)
  if (document.visibilityState === 'visible' && wantCamera && (!streamIsLive() || video.paused)) {
    log('Stream not live after returning, restarting')
    void startCamera()
  }
})

startButton.addEventListener('click', () => void startCamera())
captureButton.addEventListener('click', capturePhoto)
window.addEventListener('resize', resizeOverlay)

if (!navigator.mediaDevices?.getUserMedia) {
  guidance.textContent = 'This browser cannot open the camera. Camera access also needs an HTTPS page.'
  guidance.hidden = false
  startButton.disabled = true
}

log(`Page loaded on ${navigator.userAgent}`)
resizeOverlay()
requestAnimationFrame(draw)
