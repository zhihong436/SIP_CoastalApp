// The Break the waves challenge model. This mirrors the database's simplified shelter check exactly
// enough for the AR feedback and local UX checks. The database remains authoritative: accepted
// placements, the tested layout and the pass/fail result all come from the migration's functions.
//
// The miniature is illustrative, not an engineering wave model. Waves travel towards negative z,
// the coast is at z = -0.20, and buildable water is z = -0.08 to 0.28.

export type Side = 'a' | 'b'
export type PieceId = 'a1' | 'a2' | 'b1' | 'b2'

export interface BreakWavesPiece {
  id: PieceId
  owner: Side
  placed: boolean
  x: number
  z: number
  rotation: number
}

export interface BreakWavesResult {
  passed: boolean
  valid: boolean
  west_sheltered: number
  east_sheltered: number
  west_targets: boolean[]
  east_targets: boolean[]
  corridor_clear: boolean
  placed_a: number
  placed_b: number
  both_contribute: boolean
  errors: string[]
  failures: string[]
}

export const WATER = { minX: -0.44, maxX: 0.44, minZ: -0.08, maxZ: 0.28 } as const
export const COAST_Z = -0.2
export const PIECE_LENGTH = 0.18
export const PIECE_WIDTH = 0.03
export const CORRIDOR_HALF_WIDTH = 0.075
export const WEST_TARGET_X = [-0.38, -0.34, -0.3, -0.26, -0.22, -0.18, -0.14] as const
export const EAST_TARGET_X = [0.14, 0.18, 0.22, 0.26, 0.3, 0.34, 0.38] as const
export const TARGET_Z = COAST_Z

export const PIECE_IDS: PieceId[] = ['a1', 'a2', 'b1', 'b2']

export function initialPieces(): BreakWavesPiece[] {
  return [
    { id: 'a1', owner: 'a', placed: false, x: 0, z: 0, rotation: 0 },
    { id: 'a2', owner: 'a', placed: false, x: 0, z: 0, rotation: 0 },
    { id: 'b1', owner: 'b', placed: false, x: 0, z: 0, rotation: 0 },
    { id: 'b2', owner: 'b', placed: false, x: 0, z: 0, rotation: 0 },
  ]
}

export function sideForPiece(id: string): Side | null {
  if (id === 'a1' || id === 'a2') return 'a'
  if (id === 'b1' || id === 'b2') return 'b'
  return null
}

export function snapCoordinate(value: number) {
  return Math.round(value * 100) / 100
}

export function normaliseRotation(degrees: number) {
  const snapped = Math.round(degrees / 15) * 15
  return ((snapped % 180) + 180) % 180
}

export function pieceCorners(piece: Pick<BreakWavesPiece, 'x' | 'z' | 'rotation'>) {
  const theta = (piece.rotation * Math.PI) / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const halfLength = PIECE_LENGTH / 2
  const halfWidth = PIECE_WIDTH / 2
  const local: Array<[number, number]> = [
    [-halfLength, -halfWidth],
    [halfLength, -halfWidth],
    [halfLength, halfWidth],
    [-halfLength, halfWidth],
  ]
  return local.map(([x, z]) => ({
    x: piece.x + x * cos - z * sin,
    z: piece.z + x * sin + z * cos,
  }))
}

function project(points: Array<{ x: number; z: number }>, axisX: number, axisZ: number) {
  let min = Infinity
  let max = -Infinity
  for (const point of points) {
    const value = point.x * axisX + point.z * axisZ
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  return { min, max }
}

// Separating-axis test. Touching edges are allowed; overlapping footprints are not.
export function rectanglesOverlap(a: Array<{ x: number; z: number }>, b: Array<{ x: number; z: number }>) {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i += 1) {
      const p1 = polygon[i]
      const p2 = polygon[(i + 1) % polygon.length]
      const axisX = -(p2.z - p1.z)
      const axisZ = p2.x - p1.x
      if (axisX === 0 && axisZ === 0) continue
      const aRange = project(a, axisX, axisZ)
      const bRange = project(b, axisX, axisZ)
      if (aRange.max <= bRange.min || bRange.max <= aRange.min) return false
    }
  }
  return true
}

const corridorCorners = [
  { x: -CORRIDOR_HALF_WIDTH, z: WATER.minZ },
  { x: CORRIDOR_HALF_WIDTH, z: WATER.minZ },
  { x: CORRIDOR_HALF_WIDTH, z: WATER.maxZ },
  { x: -CORRIDOR_HALF_WIDTH, z: WATER.maxZ },
]

export function pieceInsideWater(piece: Pick<BreakWavesPiece, 'x' | 'z' | 'rotation'>) {
  return pieceCorners(piece).every(
    (corner) =>
      corner.x >= WATER.minX &&
      corner.x <= WATER.maxX &&
      corner.z >= WATER.minZ &&
      corner.z <= WATER.maxZ,
  )
}

export function pieceBlocksCorridor(piece: Pick<BreakWavesPiece, 'x' | 'z' | 'rotation'>) {
  return rectanglesOverlap(pieceCorners(piece), corridorCorners)
}

// True when the upstream ray from (targetX, targetZ) crosses the piece's long centreline. A piece
// rotated parallel to the wave direction has no horizontal span and cannot shelter a target.
export function pieceSheltersPoint(piece: BreakWavesPiece, targetX: number, targetZ: number) {
  if (!piece.placed) return false
  const theta = (piece.rotation * Math.PI) / 180
  const halfLength = PIECE_LENGTH / 2
  const p1x = piece.x - halfLength * Math.cos(theta)
  const p1z = piece.z - halfLength * Math.sin(theta)
  const dx = PIECE_LENGTH * Math.cos(theta)
  const dz = PIECE_LENGTH * Math.sin(theta)
  if (Math.abs(dx) < 0.000001) return false
  const t = (targetX - p1x) / dx
  if (t < 0 || t > 1) return false
  return p1z + t * dz >= targetZ
}

export function isTargetSheltered(pieces: BreakWavesPiece[], targetX: number, targetZ = TARGET_Z) {
  return pieces.some((piece) => pieceSheltersPoint(piece, targetX, targetZ))
}

export function evaluateBreakWaves(pieces: BreakWavesPiece[]): BreakWavesResult {
  const errors: string[] = []
  const placed = pieces.filter((piece) => piece.placed)
  const placedA = placed.filter((piece) => piece.owner === 'a').length
  const placedB = placed.filter((piece) => piece.owner === 'b').length

  if (placedA > 2 || placedB > 2) errors.push('too_many_pieces')
  for (const piece of placed) {
    if (piece.owner !== 'a' && piece.owner !== 'b') errors.push('unknown_owner')
    if (![piece.x, piece.z, piece.rotation].every(Number.isFinite)) errors.push('invalid_coordinates')
    if (!pieceInsideWater(piece)) errors.push('out_of_water')
  }
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      if (rectanglesOverlap(pieceCorners(placed[i]), pieceCorners(placed[j]))) errors.push('piece_overlap')
    }
  }

  const westTargets = WEST_TARGET_X.map((x) => isTargetSheltered(placed, x))
  const eastTargets = EAST_TARGET_X.map((x) => isTargetSheltered(placed, x))
  const west = westTargets.filter(Boolean).length
  const east = eastTargets.filter(Boolean).length
  const corridorClear = !placed.some(pieceBlocksCorridor)
  const valid = errors.length === 0
  const bothContribute = placedA > 0 && placedB > 0
  const passed = valid && west === 7 && east === 7 && corridorClear && bothContribute

  const failures: string[] = []
  if (!valid) failures.push('invalid_layout')
  if (west < 7) failures.push('west_unprotected')
  if (east < 7) failures.push('east_unprotected')
  if (!corridorClear) failures.push('boat_route_blocked')
  if (!bothContribute) failures.push('both_players_needed')

  return {
    passed,
    valid,
    west_sheltered: west,
    east_sheltered: east,
    west_targets: westTargets,
    east_targets: eastTargets,
    corridor_clear: corridorClear,
    placed_a: placedA,
    placed_b: placedB,
    both_contribute: bothContribute,
    errors: Array.from(new Set(errors)),
    failures,
  }
}

export function emptyResult(): BreakWavesResult {
  return evaluateBreakWaves(initialPieces())
}

export const failureText: Record<string, string> = {
  invalid_layout: 'The construction is not valid.',
  west_unprotected: 'Waves still reach part of the west beach.',
  east_unprotected: 'Waves still reach part of the east beach.',
  boat_route_blocked: 'A breakwater blocks the boat entrance.',
  both_players_needed: 'Both players need at least one accepted piece.',
}
