import { sections, type Plan, type ProtectionId, type SectionId } from './holdTheShore'

// The drawn shore sits across the middle of the camera view, as fractions of its height from the top. The sea is the
// upper part and the sand the lower. The tap buttons use the same fractions, so they sit exactly over the drawing.
export const SHORE_TOP = 0.36
export const SEA_BOTTOM = 0.5
export const SHORE_BOTTOM = 0.72

export interface ShorePalette {
  sea: string
  seaStorm: string
  wave: string
  sand: string
  wall: string
  rock: string
  plant: string
  outline: string
  label: string
}

export interface ShoreScene {
  plan: Plan | null
  // Where the waves are in their cycle, from 0 to 1. The caller moves it on, and holds it still for reduced motion.
  wavePhase: number
  // How strong the storm is now, from 0 for calm to 1 at its height.
  storm: number
  palette: ShorePalette
}

export function readShorePalette(): ShorePalette {
  const style = getComputedStyle(document.documentElement)
  const color = (name: string) => style.getPropertyValue(name).trim()
  return {
    sea: color('--color-shore-sea'),
    seaStorm: color('--color-shore-sea-storm'),
    wave: color('--color-shore-wave'),
    sand: color('--color-shore-sand'),
    wall: color('--color-shore-wall'),
    rock: color('--color-shore-rock'),
    plant: color('--color-shore-plant'),
    outline: color('--color-camera-outline'),
    label: color('--color-shore-label'),
  }
}

// Draws the sea, sand, sections and chosen protections. The live view and the saved photo both use this, so the shore
// sits in the same place in each. Sizes are in screen pixels, and the photo scales them up with the picture.
export function drawShore(context: CanvasRenderingContext2D, width: number, height: number, scene: ShoreScene) {
  const { palette, storm } = scene
  const top = height * SHORE_TOP
  const seaBottom = height * SEA_BOTTOM
  const bottom = height * SHORE_BOTTOM
  const sectionWidth = width / sections.length

  context.globalAlpha = 0.82
  context.fillStyle = palette.sea
  context.fillRect(0, top, width, seaBottom - top)
  context.fillStyle = palette.sand
  context.fillRect(0, seaBottom, width, bottom - seaBottom)
  context.globalAlpha = storm * 0.55
  context.fillStyle = palette.seaStorm
  context.fillRect(0, top, width, seaBottom - top)
  context.globalAlpha = 1

  drawWaves(context, width, top, seaBottom, scene)

  sections.forEach((section, index) => {
    const left = index * sectionWidth
    if (index > 0) {
      context.setLineDash([6, 6])
      context.lineWidth = 2
      context.strokeStyle = palette.label
      context.beginPath()
      context.moveTo(left, top)
      context.lineTo(left, bottom)
      context.stroke()
      context.setLineDash([])
    }
    drawProtection(context, scene.plan?.[section.id] ?? null, left, sectionWidth, seaBottom, palette)
    drawName(context, section.id, left + sectionWidth / 2, bottom - 14, palette)
  })
}

// Lines of waves that roll from the far edge of the sea towards the shore. A storm makes them bigger.
function drawWaves(context: CanvasRenderingContext2D, width: number, top: number, bottom: number, scene: ShoreScene) {
  const waves = 4
  const amplitude = 3 + scene.storm * 9
  context.lineCap = 'round'
  context.lineWidth = 3 + scene.storm * 2
  context.strokeStyle = scene.palette.wave
  for (let index = 0; index < waves; index++) {
    const progress = (scene.wavePhase + index / waves) % 1
    const baseline = top + progress * (bottom - top)
    context.globalAlpha = 0.9 - progress * 0.5
    context.beginPath()
    for (let x = 0; x <= width; x += 6) {
      const y = baseline + Math.sin(x / 18 + index * 2) * amplitude
      if (x === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.stroke()
  }
  context.globalAlpha = 1
}

export function drawProtection(
  context: CanvasRenderingContext2D,
  protection: ProtectionId | null,
  left: number,
  sectionWidth: number,
  seaBottom: number,
  palette: ShorePalette,
) {
  context.lineJoin = 'round'
  context.lineWidth = 3
  context.strokeStyle = palette.outline
  const inset = 12

  if (protection === 'sea_wall') {
    context.fillStyle = palette.wall
    context.beginPath()
    context.rect(left + inset, seaBottom - 8, sectionWidth - inset * 2, 34)
    context.fill()
    context.stroke()
  } else if (protection === 'rock_slope') {
    context.fillStyle = palette.rock
    context.beginPath()
    context.moveTo(left + inset, seaBottom + 40)
    context.lineTo(left + inset + 14, seaBottom - 6)
    context.lineTo(left + sectionWidth - inset - 14, seaBottom - 6)
    context.lineTo(left + sectionWidth - inset, seaBottom + 40)
    context.closePath()
    context.fill()
    context.stroke()
    context.lineWidth = 2
    for (let index = 0; index < 5; index++) {
      context.beginPath()
      context.arc(left + inset + 16 + index * ((sectionWidth - inset * 2 - 32) / 4), seaBottom + 16, 6, 0, Math.PI * 2)
      context.stroke()
    }
  } else if (protection === 'breakwater') {
    context.fillStyle = palette.rock
    for (let index = 0; index < 3; index++) {
      context.beginPath()
      context.ellipse(left + sectionWidth * (0.25 + index * 0.25), seaBottom - 26, 13, 9, 0, 0, Math.PI * 2)
      context.fill()
      context.stroke()
    }
  } else if (protection === 'beach_plants') {
    context.lineCap = 'round'
    context.lineWidth = 4
    context.strokeStyle = palette.plant
    for (let index = 0; index < 5; index++) {
      const x = left + sectionWidth * (0.14 + index * 0.18)
      const y = seaBottom + 30
      context.beginPath()
      context.moveTo(x, y)
      context.lineTo(x - 7, y - 20)
      context.moveTo(x, y)
      context.lineTo(x, y - 24)
      context.moveTo(x, y)
      context.lineTo(x + 7, y - 20)
      context.stroke()
    }
  }
}

function drawName(context: CanvasRenderingContext2D, id: SectionId, x: number, y: number, palette: ShorePalette) {
  const name = sections.find((section) => section.id === id)!.name
  context.font = '700 15px system-ui, -apple-system, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'alphabetic'
  context.lineJoin = 'round'
  context.lineWidth = 4
  context.strokeStyle = palette.outline
  context.fillStyle = palette.label
  context.strokeText(name, x, y)
  context.fillText(name, x, y)
}
