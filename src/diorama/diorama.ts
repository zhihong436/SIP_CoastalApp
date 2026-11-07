// Standalone visual preview. This page deliberately does not use the app, Supabase or any camera
// API: it only renders the sculpted diorama so the visual treatment can be reviewed on a phone.
import './diorama.css'
import { evaluateBreakWaves, type BreakWavesPiece } from '../features/trail/breakWaves'
import {
  createDiorama,
  type DioramaHandle,
  type DioramaState,
  type DioramaView,
} from './dioramaScene'

const protectedPieces: BreakWavesPiece[] = [
  { id: 'a1', owner: 'a', placed: true, x: -0.32, z: 0.22, rotation: 0 },
  { id: 'a2', owner: 'a', placed: true, x: -0.2, z: 0.14, rotation: 0 },
  { id: 'b1', owner: 'b', placed: true, x: 0.32, z: 0.22, rotation: 0 },
  { id: 'b2', owner: 'b', placed: true, x: 0.2, z: 0.14, rotation: 0 },
]
const protectedResult = evaluateBreakWaves(protectedPieces)
const exposedResult = evaluateBreakWaves([])
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing #${id}`)
  return element as T
}

const stage = byId<HTMLElement>('diorama-stage')
const fallback = byId<HTMLElement>('diorama-fallback')
const fallbackDetail = byId<HTMLElement>('fallback-detail')
const stateTitle = byId<HTMLElement>('state-title')
const stateCopy = byId<HTMLElement>('state-copy')
const stateStats = byId<HTMLElement>('state-stats')
const viewButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-view]'))
const stateButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-state]'))

let activeView: DioramaView = 'overhead'
let activeState: DioramaState = 'protected'
let diorama: DioramaHandle | null = null

function updateStateCopy() {
  const result = activeState === 'protected' ? protectedResult : exposedResult
  if (activeState === 'protected') {
    stateTitle.textContent = 'Protected example'
    stateCopy.textContent =
      'Rounded rock breakwaters calm the water in their lee. The harbour entrance stays open.'
  } else {
    stateTitle.textContent = 'Exposed coast'
    stateCopy.textContent =
      'Open waves reach both beaches. The sand edge takes the full surf and a faint sediment wash.'
  }
  stateStats.textContent = `Local example · West ${result.west_sheltered}/7 · East ${result.east_sheltered}/7 · Boat route ${
    result.corridor_clear ? 'open' : 'blocked'
  }`
}

function setPressed(buttons: HTMLButtonElement[], attribute: string, value: string) {
  for (const button of buttons) {
    button.setAttribute('aria-pressed', String(button.dataset[attribute] === value))
  }
}

function setView(view: DioramaView) {
  activeView = view
  setPressed(viewButtons, 'view', view)
  diorama?.setView(view)
}

function setState(state: DioramaState) {
  activeState = state
  setPressed(stateButtons, 'state', state)
  updateStateCopy()
  diorama?.setState(state)
}

for (const button of viewButtons) {
  button.addEventListener('click', () => setView(button.dataset.view as DioramaView))
}
for (const button of stateButtons) {
  button.addEventListener('click', () => setState(button.dataset.state as DioramaState))
}
setPressed(viewButtons, 'view', activeView)
setPressed(stateButtons, 'state', activeState)
updateStateCopy()

function webglAvailable() {
  const canvas = document.createElement('canvas')
  return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
}

async function loadThree() {
  const threeUrl = new URL('ar/vendor/three-0.160.0/build/three.module.min.js', document.baseURI).href
  return import(/* @vite-ignore */ threeUrl)
}

function showFallback(error: unknown) {
  fallback.hidden = false
  fallbackDetail.textContent = error instanceof Error ? error.message : String(error)
  stage.setAttribute('aria-hidden', 'true')
  document.documentElement.dataset.dioramaState = 'fallback'
  for (const button of [...viewButtons, ...stateButtons]) button.disabled = true
}

async function boot() {
  try {
    if (!webglAvailable()) throw new Error('WebGL is not available in this browser.')
    const THREE = await loadThree()
    diorama = createDiorama(THREE, stage, {
      pieces: protectedPieces,
      initialState: activeState,
      reducedMotion,
    })
    diorama.setView(activeView)
    document.documentElement.dataset.dioramaState = 'ready'
  } catch (error) {
    showFallback(error)
  }
}

window.addEventListener('pagehide', () => {
  diorama?.dispose()
  diorama = null
})
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload()
})

void boot()
