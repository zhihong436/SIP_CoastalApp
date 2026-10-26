import { useEffect, useRef } from 'react'
import { drawProtection, readShorePalette } from './drawShore'
import type { ProtectionId } from './holdTheShore'

// The drawing is made at this size and shown smaller by CSS, so it stays sharp on a high-density screen.
const WIDTH = 104
const HEIGHT = 84
const SEA_BOTTOM = 40
const SCALE = 2

// A protection drawn on a little sea and sand tile, with the same shape the shore uses.
export function ProtectionPicture({ protection }: { protection: ProtectionId }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const palette = readShorePalette()
    const context = canvas.getContext('2d')!
    context.setTransform(SCALE, 0, 0, SCALE, 0, 0)
    context.fillStyle = palette.sea
    context.fillRect(0, 0, WIDTH, SEA_BOTTOM)
    context.fillStyle = palette.sand
    context.fillRect(0, SEA_BOTTOM, WIDTH, HEIGHT - SEA_BOTTOM)
    drawProtection(context, protection, 0, WIDTH, SEA_BOTTOM, palette)
  }, [protection])

  return (
    <canvas
      ref={canvasRef}
      className="protection-picture"
      width={WIDTH * SCALE}
      height={HEIGHT * SCALE}
      aria-hidden="true"
    />
  )
}
