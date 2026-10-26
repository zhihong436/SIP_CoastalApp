import type { DrawOnView } from '../camera/capturePhoto'
import { LINE_2100_Y, TODAY_LINE_Y, lineLabel2100, lineLabelToday, lineNote } from './stop1'

// Draws the Today and 2100 lines. The live view and the saved photo both use this, so the lines sit in the
// same place in each. Sizes are in screen pixels, and the photo scales them up with the picture.
export const drawWaterLines: DrawOnView = (context, width, height) => {
  const style = getComputedStyle(document.documentElement)
  const color = (name: string) => style.getPropertyValue(name).trim()

  const outline = color('--color-camera-outline')
  drawLine(context, width, height * TODAY_LINE_Y, lineLabelToday, color('--color-camera-today'), outline)
  drawLine(context, width, height * LINE_2100_Y, lineLabel2100, color('--color-camera-future'), outline, lineNote)
}

function drawLine(
  context: CanvasRenderingContext2D,
  width: number,
  y: number,
  label: string,
  lineColor: string,
  outline: string,
  note?: string,
) {
  // A dark line under the coloured one keeps it readable on bright water and sky.
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(0, y)
  context.lineTo(width, y)
  context.lineWidth = 7
  context.strokeStyle = outline
  context.stroke()
  context.lineWidth = 3
  context.strokeStyle = lineColor
  context.stroke()

  context.font = '700 15px system-ui, -apple-system, sans-serif'
  context.textBaseline = 'alphabetic'
  context.lineJoin = 'round'
  context.lineWidth = 4
  context.strokeStyle = outline
  context.fillStyle = lineColor
  context.textAlign = 'left'
  context.strokeText(label, 12, y - 8)
  context.fillText(label, 12, y - 8)

  if (note) {
    context.font = '600 12px system-ui, -apple-system, sans-serif'
    context.textAlign = 'right'
    context.strokeText(note, width - 12, y - 8)
    context.fillText(note, width - 12, y - 8)
  }
}
