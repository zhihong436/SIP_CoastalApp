import { useEffect, useRef, type RefObject } from 'react'
import type { DrawOnView } from '../camera/capturePhoto'
import type { Plan } from './holdTheShore'
import { drawShore, readShorePalette } from './drawShore'

const STORM_MS = 2500
// Under reduced motion the waves stay still and the storm is only a short fade.
const STORM_FADE_MS = 600

interface Props {
  plan: Plan | null
  // When the storm started, in performance.now() time. Null when there is no storm.
  stormStartedAt: number | null
  onStormEnd: () => void
  // Set to a function that draws the shore as it is now, for the keepsake photo.
  drawRef: RefObject<DrawOnView | null>
}

// The drawn shore, animated while this screen is open. The animation frame loop stops when the screen is left.
export function ShoreCanvas({ plan, stormStartedAt, onStormEnd, drawRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latest = useRef({ plan, stormStartedAt, onStormEnd })

  useEffect(() => {
    latest.current = { plan, stormStartedAt, onStormEnd }
  })

  useEffect(() => {
    const canvas = canvasRef.current!
    const palette = readShorePalette()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const stormMs = reducedMotion ? STORM_FADE_MS : STORM_MS
    let wavePhase = 0
    let storm = 0
    let lastTime = performance.now()
    let reportedStorm: number | null = null
    let frame = 0

    const draw: DrawOnView = (context, width, height) =>
      drawShore(context, width, height, { plan: latest.current.plan, wavePhase, storm, palette })
    drawRef.current = draw

    function resize() {
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(canvas.clientWidth * ratio)
      canvas.height = Math.round(canvas.clientHeight * ratio)
    }

    function render(now: number) {
      const { stormStartedAt: startedAt, onStormEnd: end } = latest.current
      const progress = startedAt === null ? 0 : (now - startedAt) / stormMs
      // The storm builds up, holds, then dies away.
      storm = startedAt === null ? 0 : Math.max(0, Math.min(1, progress / 0.2, (1 - progress) / 0.2))
      if (startedAt !== null && progress >= 1 && reportedStorm !== startedAt) {
        reportedStorm = startedAt
        end()
      }
      if (!reducedMotion) wavePhase = (wavePhase + ((now - lastTime) / 1000) * (0.1 + storm * 0.6)) % 1
      lastTime = now

      const ratio = window.devicePixelRatio || 1
      const context = canvas.getContext('2d')!
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
      draw(context, canvas.clientWidth, canvas.clientHeight)
      frame = requestAnimationFrame(render)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    frame = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      drawRef.current = null
    }
  }, [drawRef])

  return <canvas ref={canvasRef} className="camera__shore" aria-hidden="true" />
}
