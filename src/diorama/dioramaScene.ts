// Standalone visual preview for the refined Break the waves diorama. The shared render-only model
// supplies the island, water and breakwaters; this wrapper owns the preview camera, lights, local
// exposed/protected comparison and animation loop. It is not the AR scene or the paired game.
import {
  createLighthouseDiorama,
  type LighthouseDiorama,
} from './dioramaModel'
import {
  pieceSheltersPoint,
  type BreakWavesPiece,
} from '../features/trail/breakWaves'

type Three = any

export type DioramaView = 'overhead' | 'oblique'
export type DioramaState = 'exposed' | 'protected'

interface Options {
  pieces: BreakWavesPiece[]
  initialState: DioramaState
  reducedMotion: boolean
}

export interface DioramaHandle {
  setView(view: DioramaView): void
  setState(state: DioramaState): void
  resize(): void
  dispose(): void
}

const OVERHEAD_DIR = { x: 0, y: 1, z: 0.18 }
const OBLIQUE_DIR = { x: -0.62, y: 0.55, z: 0.9 }
const OVERHEAD_TARGET = { x: 0, y: 0.27, z: 0.34 }
const OBLIQUE_TARGET = { x: 0, y: 0.3, z: 0.28 }

export function createDiorama(THREE: Three, container: HTMLElement, options: Options): DioramaHandle {
  const compact = window.innerWidth < 620
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.6 : 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.03
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.setClearColor(0x000000, 0)
  renderer.domElement.setAttribute('aria-hidden', 'true')
  container.replaceChildren(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 120)

  const model: LighthouseDiorama = createLighthouseDiorama(THREE, {
    pieces: options.pieces,
    compact,
    shadows: true,
    groundShadow: true,
    maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
    zOffset: -0.01,
    breakwaterMode: 'sculpted',
    ownerAccents: false,
    boats: [
      { x: 0.02, z: 0.5, rotation: 0.25, scale: 1 },
      { x: -0.03, z: -0.53, rotation: -0.35, scale: 0.82 },
    ],
    shelterAt: (puzzleX, puzzleZ) =>
      options.pieces.some((piece) => pieceSheltersPoint(piece, puzzleX, puzzleZ)),
  })
  scene.add(model.root)

  // ----- Preview lighting ---------------------------------------------------------
  const hemisphere = new THREE.HemisphereLight(0xd9f2f1, 0x79634c, 1.35)
  scene.add(hemisphere)
  const key = new THREE.DirectionalLight(0xffe2b5, 3.6)
  key.position.set(-5.2, 7.6, 4.8)
  key.target.position.set(0, 0.2, 0.2)
  key.castShadow = true
  key.shadow.mapSize.set(compact ? 1024 : 2048, compact ? 1024 : 2048)
  key.shadow.camera.left = -4.2
  key.shadow.camera.right = 4.2
  key.shadow.camera.top = 4.2
  key.shadow.camera.bottom = -4.2
  key.shadow.camera.near = 0.5
  key.shadow.camera.far = 24
  key.shadow.bias = -0.00035
  key.shadow.normalBias = 0.02
  scene.add(key)
  scene.add(key.target)
  const fill = new THREE.DirectionalLight(0x9ed8e2, 1.25)
  fill.position.set(5.4, 4.4, -4.5)
  scene.add(fill)
  const rim = new THREE.DirectionalLight(0xfff4d7, 0.7)
  rim.position.set(0.5, 3.2, -5.5)
  scene.add(rim)
  const lighthouseGlow = new THREE.PointLight(0xffbd68, 1.15, 3.5, 2)
  lighthouseGlow.position.set(-1.55, 1.76, -0.95)
  scene.add(lighthouseGlow)

  // ----- Camera, views and state --------------------------------------------------
  let currentView: DioramaView = 'overhead'
  let protectedTarget = options.initialState === 'protected' ? 1 : 0
  let protectedMix = protectedTarget
  const cameraGoal = new THREE.Vector3()
  const cameraTarget = new THREE.Vector3(OVERHEAD_TARGET.x, OVERHEAD_TARGET.y, OVERHEAD_TARGET.z)
  let disposed = false
  let animationFrame = 0
  let lastFrame = performance.now()
  let visualTime = 0

  function applyCamera(direction: { x: number; y: number; z: number }, target: any, immediate: boolean) {
    const dir = new THREE.Vector3(direction.x, direction.y, direction.z).normalize()
    const verticalHalf = THREE.MathUtils.degToRad(camera.fov / 2)
    const horizontalHalf = Math.atan(Math.tan(verticalHalf) * camera.aspect)
    const fitRadius =
      window.innerWidth >= 900
        ? 3.7
        : window.innerWidth >= 380
          ? 3.08
          : currentView === 'oblique'
            ? 3.2
            : 3.5
    const distance = (fitRadius / Math.sin(Math.min(verticalHalf, horizontalHalf))) * 1.04
    const goal = target.clone().add(dir.multiplyScalar(distance))
    cameraGoal.copy(goal)
    if (immediate) {
      camera.position.copy(goal)
      cameraTarget.copy(target)
      camera.lookAt(cameraTarget)
      camera.updateMatrixWorld(true)
    }
    return target
  }

  function setView(view: DioramaView, immediate = false) {
    currentView = view
    const target = new THREE.Vector3(
      currentView === 'overhead' ? OVERHEAD_TARGET.x : OBLIQUE_TARGET.x,
      currentView === 'overhead' ? OVERHEAD_TARGET.y : OBLIQUE_TARGET.y,
      currentView === 'overhead' ? OVERHEAD_TARGET.z : OBLIQUE_TARGET.z,
    )
    if (compact) target.y -= 0.12
    applyCamera(currentView === 'overhead' ? OVERHEAD_DIR : OBLIQUE_DIR, target, immediate || options.reducedMotion)
  }

  function applyMood() {
    model.setBreakwaterMood(protectedMix)
    model.setShoreMood(protectedMix, protectedMix)
  }

  function setState(state: DioramaState, immediate = false) {
    protectedTarget = state === 'protected' ? 1 : 0
    if (immediate || options.reducedMotion) {
      protectedMix = protectedTarget
      applyMood()
      model.update(visualTime, protectedMix)
      if (options.reducedMotion) renderFrame()
    }
  }

  function updateScene(dt: number) {
    if (!options.reducedMotion) visualTime += dt
    const mixEase = 1 - Math.exp(-dt * 4.4)
    protectedMix += (protectedTarget - protectedMix) * mixEase
    if (Math.abs(protectedTarget - protectedMix) < 0.001) protectedMix = protectedTarget
    applyMood()
    model.update(visualTime, protectedMix)
    if (!options.reducedMotion) {
      camera.position.lerp(cameraGoal, 1 - Math.exp(-dt * 5.5))
      cameraTarget.lerp(
        new THREE.Vector3(
          currentView === 'overhead' ? OVERHEAD_TARGET.x : OBLIQUE_TARGET.x,
          (currentView === 'overhead' ? OVERHEAD_TARGET.y : OBLIQUE_TARGET.y) - (compact ? 0.12 : 0),
          currentView === 'overhead' ? OVERHEAD_TARGET.z : OBLIQUE_TARGET.z,
        ),
        1 - Math.exp(-dt * 5.5),
      )
      camera.lookAt(cameraTarget)
    }
  }

  function renderFrame() {
    if (disposed) return
    renderer.render(scene, camera)
  }

  function animate(now: number) {
    if (disposed) return
    const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000))
    lastFrame = now
    updateScene(dt)
    renderFrame()
    animationFrame = requestAnimationFrame(animate)
  }

  function resize() {
    const width = container.clientWidth || window.innerWidth
    const height = container.clientHeight || window.innerHeight
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.6 : 2))
    renderer.setSize(width, height, false)
    camera.aspect = width / Math.max(1, height)
    camera.updateProjectionMatrix()
    setView(currentView, true)
    if (options.reducedMotion) {
      model.update(visualTime, protectedMix)
      renderFrame()
    }
  }

  camera.aspect =
    (container.clientWidth || window.innerWidth) / Math.max(1, container.clientHeight || window.innerHeight)
  camera.updateProjectionMatrix()
  resize()
  setView('overhead', true)
  setState(options.initialState, true)
  applyMood()
  model.update(visualTime, protectedMix)
  renderFrame()
  if (!options.reducedMotion) animationFrame = requestAnimationFrame(animate)

  const onResize = () => resize()
  window.addEventListener('resize', onResize)

  return {
    setView(view) {
      setView(view)
      if (options.reducedMotion) {
        model.update(visualTime, protectedMix)
        renderFrame()
      }
    },
    setState(state) {
      setState(state)
    },
    resize,
    dispose() {
      if (disposed) return
      disposed = true
      if (animationFrame) cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', onResize)
      model.dispose()
      renderer.dispose()
      renderer.forceContextLoss?.()
      container.replaceChildren()
    },
  }
}
