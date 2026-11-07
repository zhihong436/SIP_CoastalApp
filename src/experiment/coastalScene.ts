// The miniature sea, beach and breakwater for the coastal AR experiment.
// This is an illustrative model: the wave shelter is a visual approximation, not an engineering simulation.
// Three.js is loaded at runtime from the locally served vendor module, so the module stays untyped here.

export interface CoastalSceneState {
  placed: number
  selected: number | null
  quarterTurns: number | null
  live: boolean
}

export interface CoastalScene {
  update(timeSeconds: number): void
  setInteractive(live: boolean): void
  rotateSelected(): boolean
  reset(): void
  dispose(): void
}

interface SceneCallbacks {
  onChange(state: CoastalSceneState): void
}

type Three = any
type Object3D = any
type Material = any

const SLOT_POSITIONS = [
  { x: 0.08, z: 0.245, yaw: 0.34 },
  { x: 0.22, z: 0.2, yaw: 0.78 },
  { x: 0.33, z: 0.08, yaw: 1.12 },
]

const ISLAND = { x: -0.19, z: 0.12 }

// Dominant wave travel: from the open sea (upper right) toward the island (lower left).
// The same normalised direction drives both the visible phase and the section shadow.
const WAVE_TRAVEL = { x: -0.821, z: -0.571 }
const WAVE_ACROSS = { x: 0.571, z: -0.821 }
const SECTION_HALF_LENGTH = 0.06
const SECTION_SHADOW_LENGTH = 0.24
const SECTION_SHADOW_STRENGTH = 0.82

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function easeOutBack(t: number) {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

function disposeObject(object: Object3D) {
  object.traverse((child: any) => {
    child.geometry?.dispose()
    const material: Material | Material[] | undefined = child.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
    else material?.dispose()
  })
}

function standardMaterial(THREE: Three, color: number, options: Record<string, unknown> = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0.02,
    flatShading: true,
    ...options,
  })
}

export function createCoastalScene(
  THREE: Three,
  anchorGroup: Object3D,
  renderer: any,
  camera: any,
  callbacks: SceneCallbacks,
): CoastalScene {
  const world = new THREE.Group()
  // The anchor's plane is XY with Z coming out of the card. Rotating the miniature means Y is up.
  world.rotation.x = Math.PI / 2
  // Leave a small margin of the printed illustration visible around the miniature.
  world.scale.setScalar(0.9)
  anchorGroup.add(world)

  const animated: Array<(time: number, delta: number) => void> = []
  const slotGroups: Object3D[] = []
  const slotPickMeshes: Object3D[] = []
  const sections: Array<{
    group: Object3D
    slotIndex: number
    x: number
    z: number
    currentYaw: number
    quarterTurns: number
    baseYaw: number
    placedAt: number
    selectionRing: Object3D
    blocks: Object3D[]
  }> = []
  let selectedSlot: number | null = null
  let interactive = false
  let lastTime = 0

  function emit() {
    callbacks.onChange({
      placed: sections.length,
      selected: selectedSlot,
      quarterTurns: selectedSlot === null ? null : (sections.find((section) => section.slotIndex === selectedSlot)?.quarterTurns ?? 0),
      live: interactive,
    })
  }

  function setInteractive(live: boolean) {
    interactive = live
    for (const slot of slotGroups) {
      slot.visible = true
      const ring = slot.userData.ring as Object3D
      const ghost = slot.userData.ghost as Object3D
      const hasSection = sections.some((section) => section.slotIndex === slot.userData.slotIndex)
      ring.visible = !hasSection
      ghost.visible = live && !hasSection
    }
    emit()
  }

  // ----- Lighting -----------------------------------------------------------------
  world.add(new THREE.HemisphereLight(0xe4fff9, 0x8a6844, 4.2))
  const keyLight = new THREE.DirectionalLight(0xfff2cc, 4.4)
  keyLight.position.set(-0.5, 1.15, 0.75)
  world.add(keyLight)
  const rimLight = new THREE.DirectionalLight(0x6ddad4, 2.6)
  rimLight.position.set(0.8, 0.55, -0.55)
  world.add(rimLight)
  const fillLight = new THREE.DirectionalLight(0xe2fff9, 2.1)
  fillLight.position.set(0, 0.65, 1)
  world.add(fillLight)

  // ----- Sea ----------------------------------------------------------------------
  const seaGeometry = new THREE.PlaneGeometry(0.94, 0.74, 56, 44)
  seaGeometry.rotateX(-Math.PI / 2)
  const seaPosition = seaGeometry.attributes.position
  const seaVertexCount = seaPosition.count
  const seaBaseX = new Float32Array(seaVertexCount)
  const seaBaseZ = new Float32Array(seaVertexCount)
  const seaColors = new Float32Array(seaVertexCount * 3)
  const deepColor = new THREE.Color(0x16758a)
  const shallowColor = new THREE.Color(0x59c9c2)
  const harborColor = new THREE.Color(0x8adccd)
  const tempColor = new THREE.Color()

  for (let i = 0; i < seaVertexCount; i += 1) {
    const x = seaPosition.getX(i) as number
    const z = seaPosition.getZ(i) as number
    seaBaseX[i] = x
    seaBaseZ[i] = z
    const offshore = smoothstep(-0.12, 0.4, x)
    const harbor = 1 - smoothstep(0.0, 0.3, Math.hypot(x - ISLAND.x, z - ISLAND.z))
    tempColor.copy(shallowColor).lerp(deepColor, offshore).lerp(harborColor, harbor * 0.5)
    seaColors[i * 3] = tempColor.r
    seaColors[i * 3 + 1] = tempColor.g
    seaColors[i * 3 + 2] = tempColor.b
  }
  seaGeometry.setAttribute('color', new THREE.BufferAttribute(seaColors, 3))
  const seaMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.3,
    metalness: 0.05,
    flatShading: true,
    side: THREE.DoubleSide,
  })
  const sea = new THREE.Mesh(seaGeometry, seaMaterial)
  sea.position.y = 0.014
  world.add(sea)

  // Simple directional wave shadow for placed sections. A section is a short wall:
  // it only adds shelter when its broad face is turned into the incoming waves, and
  // only in the downstream water. This is a readable approximation, not a wave model.
  function sectionShadowAt(x: number, z: number) {
    let strongest = 0
    for (const section of sections) {
      const guideNormalX = Math.sin(section.baseYaw)
      const guideNormalZ = Math.cos(section.baseYaw)
      const currentNormalX = Math.sin(section.currentYaw)
      const currentNormalZ = Math.cos(section.currentYaw)
      // 1 when broadside to the incoming direction, 0 when edge-on (the 90°/270° turn).
      const guideFacing = Math.abs(guideNormalX * WAVE_TRAVEL.x + guideNormalZ * WAVE_TRAVEL.z)
      const orientation = Math.abs(currentNormalX * guideNormalX + currentNormalZ * guideNormalZ)
      if (orientation <= 0.001 || guideFacing <= 0.001) continue

      const wallAxisX = Math.cos(section.currentYaw)
      const wallAxisZ = -Math.sin(section.currentYaw)
      const projectedHalfWidth =
        SECTION_HALF_LENGTH * Math.abs(wallAxisX * WAVE_ACROSS.x + wallAxisZ * WAVE_ACROSS.z)

      const dx = x - section.x
      const dz = z - section.z
      const downstream = dx * WAVE_TRAVEL.x + dz * WAVE_TRAVEL.z
      if (downstream <= 0 || downstream >= SECTION_SHADOW_LENGTH) continue

      const lateral = dx * WAVE_ACROSS.x + dz * WAVE_ACROSS.z
      const lateralLimit = projectedHalfWidth + 0.03 + downstream * 0.2
      const lateralFade = 1 - smoothstep(lateralLimit * 0.55, lateralLimit, Math.abs(lateral))
      if (lateralFade <= 0) continue

      const alongFade = 1 - smoothstep(0, SECTION_SHADOW_LENGTH, downstream)
      const candidate = guideFacing * orientation * alongFade * lateralFade
      if (candidate > strongest) strongest = candidate
    }
    return strongest
  }

  function waterHeight(x: number, z: number, time: number) {
    // Baseline: open-sea waves fade towards the island's natural lee. This exists
    // with no sections placed and is not the player's shelter.
    const openSea = 0.15 + 0.85 * smoothstep(-0.08, 0.32, x)
    const naturalLee = 1 - 0.6 * smoothstep(0.32, 0.1, x) * smoothstep(0.1, 0.38, z)
    const baselineAmplitude = (0.006 + 0.048 * openSea) * naturalLee

    // Player-built shelter is separate and depends on the actual section positions
    // and rotations. Reset clears the sections, so this term returns to zero.
    const playerShelter = sectionShadowAt(x, z)
    const amplitude = baselineAmplitude * (1 - SECTION_SHADOW_STRENGTH * playerShelter)

    // Directional swell: these terms travel along WAVE_TRAVEL, so the visible crests
    // move from the open sea toward the island and the shadow sits behind the sections.
    const along = x * WAVE_TRAVEL.x + z * WAVE_TRAVEL.z
    const across = x * WAVE_ACROSS.x + z * WAVE_ACROSS.z
    const swell =
      Math.sin(along * 18 - time * 1.55) * 0.55 +
      Math.sin(along * 28 - time * 2.15 + across * 3.2 + 0.8) * 0.27 +
      Math.sin(along * 34 - time * 2.4 + across * 2.0) * 0.18
    return amplitude * swell
  }

  // Foam points around the island, along the breakwater, and on the open water.
  // Density and bobbing are deliberately lower in the harbour so the shelter reads in a still frame too.
  const foamBase: Array<{ x: number; z: number }> = []
  const pseudoRandom = (seed: number) => {
    const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
    return value - Math.floor(value)
  }
  for (let i = 0; i < 56; i += 1) {
    const angle = (i / 56) * Math.PI * 2
    const radius = 0.305 + Math.sin(i * 2.3) * 0.014
    foamBase.push({ x: ISLAND.x + Math.cos(angle) * radius, z: ISLAND.z + Math.sin(angle) * radius * 0.82 })
  }
  for (let i = 0; i < 22; i += 1) {
    const t = i / 21
    const x = 0.08 + t * 0.3
    const z = 0.245 - t * 0.16
    foamBase.push({ x: x + Math.sin(i * 3.7) * 0.022, z: z + Math.cos(i * 2.9) * 0.018 })
  }
  for (let i = 0; i < 78; i += 1) {
    foamBase.push({
      x: 0.08 + pseudoRandom(i + 1) * 0.38,
      z: -0.35 + pseudoRandom(i + 51) * 0.7,
    })
  }
  for (let i = 0; i < 18; i += 1) {
    foamBase.push({
      x: -0.34 + pseudoRandom(i + 101) * 0.34,
      z: 0.06 + pseudoRandom(i + 151) * 0.3,
    })
  }
  const foamGeometry = new THREE.BufferGeometry()
  foamGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(foamBase.length * 3), 3))
  const foam = new THREE.Points(
    foamGeometry,
    new THREE.PointsMaterial({ color: 0xf4fff7, size: 0.008, transparent: true, opacity: 0.85, depthWrite: false }),
  )
  foam.position.y = 0.02
  world.add(foam)

  // A thin base plate makes the model read as a physical diorama rather than a floating texture.
  const basePlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.96, 0.022, 0.76),
    standardMaterial(THREE, 0xd8bd86, { roughness: 0.96 }),
  )
  basePlate.position.y = -0.012
  world.add(basePlate)
  const baseRim = new THREE.Mesh(
    new THREE.BoxGeometry(0.98, 0.008, 0.78),
    standardMaterial(THREE, 0x0a3c4b, { roughness: 0.9 }),
  )
  baseRim.position.y = -0.027
  world.add(baseRim)

  animated.push((time) => {
    const position = seaGeometry.attributes.position
    for (let i = 0; i < seaVertexCount; i += 1) {
      const x = seaBaseX[i]
      const z = seaBaseZ[i]
      position.setY(i, waterHeight(x, z, time))
    }
    position.needsUpdate = true
    seaGeometry.computeVertexNormals()

    const foamPosition = foamGeometry.attributes.position
    for (let i = 0; i < foamBase.length; i += 1) {
      const point = foamBase[i]
      foamPosition.setXYZ(i, point.x, waterHeight(point.x, point.z, time) + 0.008, point.z)
    }
    foamPosition.needsUpdate = true
  })

  // ----- Island -------------------------------------------------------------------
  const island = new THREE.Group()
  island.position.set(ISLAND.x, 0, ISLAND.z)
  world.add(island)

  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.35, 40),
    new THREE.MeshBasicMaterial({ color: 0x082f3c, transparent: true, opacity: 0.2, depthWrite: false }),
  )
  contactShadow.rotation.x = -Math.PI / 2
  contactShadow.scale.z = 0.82
  contactShadow.position.y = 0.019
  island.add(contactShadow)

  const sand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.292, 0.322, 0.04, 11, 1),
    standardMaterial(THREE, 0xe4c27f, { roughness: 0.95 }),
  )
  sand.scale.z = 0.82
  sand.rotation.y = 0.3
  sand.position.y = 0.024
  island.add(sand)

  const grass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.235, 0.272, 0.055, 10, 1),
    standardMaterial(THREE, 0x4c9564, { roughness: 0.92 }),
  )
  grass.scale.z = 0.79
  grass.rotation.y = 0.34
  grass.position.set(-0.012, 0.061, 0.006)
  island.add(grass)

  const beachSpit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.105, 0.025, 8, 1),
    standardMaterial(THREE, 0xf0d79b, { roughness: 0.98 }),
  )
  beachSpit.scale.z = 0.72
  beachSpit.rotation.y = -0.5
  beachSpit.position.set(0.19, 0.031, 0.13)
  island.add(beachSpit)

  const hillMaterial = standardMaterial(THREE, 0x6cb46f, { roughness: 0.95 })
  const hillA = new THREE.Mesh(new THREE.SphereGeometry(0.14, 9, 6), hillMaterial)
  hillA.scale.set(1, 0.36, 0.8)
  hillA.position.set(-0.075, 0.082, -0.05)
  island.add(hillA)
  const hillB = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 5), standardMaterial(THREE, 0x3f8157, { roughness: 0.95 }))
  hillB.scale.set(1, 0.3, 0.78)
  hillB.position.set(-0.15, 0.078, 0.14)
  island.add(hillB)

  // Sand paths on the green top.
  const pathMaterial = standardMaterial(THREE, 0xf0d79b, { roughness: 1 })
  for (const [x, z, length, angle] of [
    [-0.02, 0.05, 0.18, 0.6],
    [0.06, 0.16, 0.12, -0.25],
    [-0.13, -0.02, 0.13, 1.15],
  ]) {
    const path = new THREE.Mesh(new THREE.BoxGeometry(length, 0.006, 0.018), pathMaterial)
    path.position.set(x, 0.093, z)
    path.rotation.y = angle
    island.add(path)
  }

  // A few rocks and shrubs.
  const islandRockMaterial = standardMaterial(THREE, 0x697276, { roughness: 0.95 })
  for (const [x, z, size, rotation] of [
    [0.15, 0.01, 0.055, 0.5],
    [0.2, 0.06, 0.04, 1.4],
    [0.13, -0.1, 0.035, 2.1],
    [-0.1, 0.2, 0.04, 0.8],
  ]) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), islandRockMaterial)
    rock.position.set(x, 0.09, z)
    rock.rotation.set(rotation, rotation * 1.7, rotation * 0.5)
    island.add(rock)
  }
  const shrubMaterial = standardMaterial(THREE, 0x2f714f, { roughness: 1 })
  for (const [x, z, size] of [
    [-0.1, 0.09, 0.026],
    [0.03, 0.02, 0.022],
    [-0.19, 0.1, 0.03],
    [0.08, 0.2, 0.02],
  ]) {
    const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), shrubMaterial)
    shrub.position.set(x, 0.09 + size * 0.5, z)
    island.add(shrub)
  }

  // ----- Lighthouse ---------------------------------------------------------------
  const lighthouse = new THREE.Group()
  lighthouse.position.set(0.145, 0.09, 0.0)
  island.add(lighthouse)
  const white = standardMaterial(THREE, 0xf4ead2, { roughness: 0.8 })
  const red = standardMaterial(THREE, 0xc9443f, { roughness: 0.72 })
  const dark = standardMaterial(THREE, 0x123944, { roughness: 0.8 })
  const lampMaterial = new THREE.MeshStandardMaterial({
    color: 0xffdf75,
    emissive: 0xffc94d,
    emissiveIntensity: 1.2,
    roughness: 0.35,
  })
  const towerParts = [
    { y: 0.024, height: 0.05, radius: 0.032, material: white },
    { y: 0.074, height: 0.046, radius: 0.026, material: red },
    { y: 0.12, height: 0.046, radius: 0.022, material: white },
  ]
  for (const part of towerParts) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(part.radius, part.radius + 0.006, part.height, 10), part.material)
    tower.position.y = part.y
    lighthouse.add(tower)
  }
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.009, 12), dark)
  gallery.position.y = 0.148
  lighthouse.add(gallery)
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.024, 0.032, 8), lampMaterial)
  lantern.position.y = 0.169
  lighthouse.add(lantern)
  const lampRoof = new THREE.Mesh(new THREE.ConeGeometry(0.031, 0.03, 8), red)
  lampRoof.position.y = 0.198
  lighthouse.add(lampRoof)
  const lampTop = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4), lampMaterial)
  lampTop.position.y = 0.218
  lighthouse.add(lampTop)
  animated.push((time) => {
    lampMaterial.emissiveIntensity = 0.9 + Math.sin(time * 2.2) * 0.35
  })

  // ----- Cottages ------------------------------------------------------------------
  const cottageWall = standardMaterial(THREE, 0xf3dfb4, { roughness: 0.95 })
  const roofRed = standardMaterial(THREE, 0xbf4438, { roughness: 0.85 })
  const roofGold = standardMaterial(THREE, 0xc9933f, { roughness: 0.9 })
  const roofTeal = standardMaterial(THREE, 0x367f77, { roughness: 0.85 })
  const windowMaterial = new THREE.MeshStandardMaterial({ color: 0x69c5c1, emissive: 0x1d5f66, emissiveIntensity: 0.25 })
  const cottageSpecs = [
    { x: 0.04, z: 0.11, wall: 0.065, depth: 0.05, height: 0.04, roof: roofRed, rotation: -0.08 },
    { x: 0.13, z: 0.2, wall: 0.052, depth: 0.042, height: 0.034, roof: roofGold, rotation: 0.2 },
    { x: -0.01, z: 0.23, wall: 0.042, depth: 0.036, height: 0.03, roof: roofTeal, rotation: -0.2 },
  ]
  for (const spec of cottageSpecs) {
    const cottage = new THREE.Group()
    cottage.position.set(spec.x, 0.095, spec.z)
    cottage.rotation.y = spec.rotation
    island.add(cottage)
    const walls = new THREE.Mesh(new THREE.BoxGeometry(spec.wall, spec.height, spec.depth), cottageWall)
    walls.position.y = spec.height / 2
    cottage.add(walls)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(spec.wall * 0.82, spec.height * 0.8, 4), spec.roof)
    roof.position.y = spec.height + spec.height * 0.4
    roof.rotation.y = Math.PI / 4
    cottage.add(roof)
    const door = new THREE.Mesh(new THREE.BoxGeometry(spec.wall * 0.2, spec.height * 0.45, 0.004), dark)
    door.position.set(0, spec.height * 0.22, spec.depth / 2 + 0.002)
    cottage.add(door)
    for (const side of [-1, 1]) {
      const window = new THREE.Mesh(new THREE.BoxGeometry(spec.wall * 0.2, spec.height * 0.24, 0.004), windowMaterial)
      window.position.set(side * spec.wall * 0.27, spec.height * 0.58, spec.depth / 2 + 0.002)
      cottage.add(window)
    }
  }

  // ----- Palms ---------------------------------------------------------------------
  const trunkMaterial = standardMaterial(THREE, 0x7d4f2c, { roughness: 1 })
  const frondMaterial = standardMaterial(THREE, 0x2f714f, { roughness: 0.95 })
  const palms: Object3D[] = []
  for (const [x, z, height, rotation] of [
    [-0.2, 0.2, 0.15, 0.3],
    [0.09, 0.24, 0.12, -0.4],
    [-0.25, 0.02, 0.1, 1.1],
  ]) {
    const palm = new THREE.Group()
    palm.position.set(x, 0.095, z)
    palm.rotation.y = rotation
    island.add(palm)
    palms.push(palm)
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.009, height, 5), trunkMaterial)
    trunk.position.y = height / 2
    trunk.rotation.z = -0.12
    palm.add(trunk)
    for (let i = 0; i < 5; i += 1) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 3), frondMaterial)
      const angle = (i / 5) * Math.PI * 2
      frond.position.set(Math.sin(angle) * 0.028, height + 0.008, Math.cos(angle) * 0.028)
      frond.rotation.z = Math.PI / 2.4
      frond.rotation.y = angle
      palm.add(frond)
    }
  }
  animated.push((time) => {
    for (let i = 0; i < palms.length; i += 1) {
      palms[i].rotation.z = Math.sin(time * 1.2 + i * 1.7) * 0.018
    }
  })

  // ----- Jetty and a small boat ----------------------------------------------------
  const jetty = new THREE.Group()
  jetty.position.set(0.102, 0.045, 0.16)
  jetty.rotation.y = -0.48
  island.add(jetty)
  const plank = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.022), standardMaterial(THREE, 0x9c6b3b, { roughness: 0.95 }))
  plank.position.x = 0.07
  jetty.add(plank)
  for (const x of [0.015, 0.06, 0.105, 0.15]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.035, 5), trunkMaterial)
    post.position.set(x, -0.018, 0)
    jetty.add(post)
  }

  const boat = new THREE.Group()
  boat.position.set(0.25, 0.055, 0.3)
  boat.rotation.y = 0.3
  world.add(boat)
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.055, 3, 6), standardMaterial(THREE, 0xc9443f, { roughness: 0.8 }))
  hull.rotation.z = Math.PI / 2
  hull.scale.y = 0.62
  boat.add(hull)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.11, 5), trunkMaterial)
  mast.position.y = 0.055
  boat.add(mast)
  const sailGeometry = new THREE.BufferGeometry()
  sailGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.02, 0, 0.055, 0.1, 0, 0, 0.1, 0], 3))
  sailGeometry.computeVertexNormals()
  const sail = new THREE.Mesh(sailGeometry, new THREE.MeshStandardMaterial({ color: 0xf7e7bd, side: THREE.DoubleSide, roughness: 0.9 }))
  sail.position.set(0, 0.01, 0)
  boat.add(sail)
  animated.push((time) => {
    boat.position.y = 0.055 + Math.sin(time * 1.45) * 0.005
    boat.rotation.z = Math.sin(time * 1.15) * 0.035
  })

  // ----- Buoys: one in the open sea, one in the sheltered harbour -----------------
  function makeBuoy(x: number, z: number, openSea: boolean) {
    const buoy = new THREE.Group()
    buoy.position.set(x, 0.05, z)
    world.add(buoy)
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 0.028, 8), standardMaterial(THREE, 0xc9443f, { roughness: 0.8 }))
    bottom.position.y = 0.014
    buoy.add(bottom)
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.026, 8), standardMaterial(THREE, 0xf4ead2, { roughness: 0.8 }))
    top.position.y = 0.041
    buoy.add(top)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.03, 4), standardMaterial(THREE, 0x123944, { roughness: 0.8 }))
    pole.position.y = 0.058
    buoy.add(pole)
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.01, 0.002), new THREE.MeshStandardMaterial({ color: 0xffd75a, side: THREE.DoubleSide }))
    flag.position.set(0.009, 0.064, 0)
    buoy.add(flag)
    const amplitude = openSea ? 0.013 : 0.0025
    const speed = openSea ? 1.9 : 1.1
    animated.push((time) => {
      buoy.position.y = 0.05 + Math.sin(time * speed) * amplitude
      buoy.rotation.z = Math.sin(time * speed * 0.8) * (openSea ? 0.08 : 0.018)
    })
    return buoy
  }
  makeBuoy(0.4, 0.2, true)
  makeBuoy(-0.06, 0.31, false)

  // ----- Offshore rocks ------------------------------------------------------------
  const rockMaterial = standardMaterial(THREE, 0x667276, { roughness: 0.98 })
  const rockLightMaterial = standardMaterial(THREE, 0x9ba19d, { roughness: 0.98 })
  const offshoreRocks: Array<{ x: number; z: number; size: number; rotation: number; light: boolean }> = [
    { x: 0.31, z: -0.22, size: 0.05, rotation: 0.6, light: false },
    { x: 0.39, z: -0.08, size: 0.04, rotation: 1.2, light: true },
    { x: 0.18, z: -0.3, size: 0.035, rotation: 2.2, light: false },
    { x: 0.42, z: 0.13, size: 0.032, rotation: 0.1, light: false },
    { x: 0.44, z: 0.28, size: 0.026, rotation: 1.7, light: true },
    { x: 0.12, z: -0.35, size: 0.022, rotation: 2.8, light: false },
  ]
  for (const spec of offshoreRocks) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(spec.size, 0), spec.light ? rockLightMaterial : rockMaterial)
    rock.position.set(spec.x, spec.size * 0.55 + 0.02, spec.z)
    rock.rotation.set(spec.rotation, spec.rotation * 1.8, spec.rotation * 0.6)
    world.add(rock)
  }

  // ----- Breakwater slots ----------------------------------------------------------
  const slotRingGeometry = new THREE.RingGeometry(0.031, 0.045, 36)
  const slotDotGeometry = new THREE.CircleGeometry(0.008, 12)
  const ghostGeometry = new THREE.BoxGeometry(0.108, 0.026, 0.032)
  const pickGeometry = new THREE.CircleGeometry(0.062, 20)

  for (let i = 0; i < SLOT_POSITIONS.length; i += 1) {
    const spec = SLOT_POSITIONS[i]
    const slot = new THREE.Group()
    slot.position.set(spec.x, 0.052, spec.z)
    slot.userData.slotIndex = i
    world.add(slot)
    slotGroups.push(slot)

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffe072,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const ring = new THREE.Mesh(slotRingGeometry, ringMaterial)
    ring.rotation.x = -Math.PI / 2
    slot.add(ring)
    const dot = new THREE.Mesh(slotDotGeometry, new THREE.MeshBasicMaterial({ color: 0xfff2c4, transparent: true, opacity: 0.9 }))
    dot.rotation.x = -Math.PI / 2
    dot.position.y = 0.001
    slot.add(dot)

    const ghostMaterial = new THREE.MeshBasicMaterial({
      color: 0xffefae,
      transparent: true,
      opacity: 0.22,
      wireframe: true,
      depthWrite: false,
    })
    const ghost = new THREE.Mesh(ghostGeometry, ghostMaterial)
    ghost.rotation.y = spec.yaw
    ghost.position.y = 0.012
    slot.add(ghost)

    const pick = new THREE.Mesh(
      pickGeometry,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
    )
    pick.rotation.x = -Math.PI / 2
    pick.position.y = 0.002
    pick.userData.slotIndex = i
    slot.add(pick)
    slotPickMeshes.push(pick)

    slot.userData.ring = ring
    slot.userData.ghost = ghost
    slot.userData.baseY = 0.052

    animated.push((time) => {
      const hasSection = sections.some((section) => section.slotIndex === i)
      if (!hasSection) {
        const pulse = 1 + Math.sin(time * 3.2 + i * 2.1) * 0.08
        ring.scale.setScalar(pulse)
        ringMaterial.opacity = interactive ? 0.85 + Math.sin(time * 3.2 + i * 2.1) * 0.12 : 0.35
        ghost.position.y = 0.012 + Math.sin(time * 2.4 + i) * 0.005
        ghostMaterial.opacity = interactive ? 0.26 : 0.1
        slot.position.y = 0.052 + Math.sin(time * 2 + i) * 0.002
      } else {
        ring.visible = false
        ghost.visible = false
      }
    })
  }

  // ----- Breakwater sections -------------------------------------------------------
  function makeSection(slotIndex: number) {
    const spec = SLOT_POSITIONS[slotIndex]
    const group = new THREE.Group()
    group.position.set(spec.x, 0.042, spec.z)
    group.rotation.y = spec.yaw
    world.add(group)

    const stoneMaterial = standardMaterial(THREE, 0x939d9b, { roughness: 0.95 })
    const stoneLightMaterial = standardMaterial(THREE, 0xbab7a8, { roughness: 0.95 })
    const blocks: Object3D[] = []
    for (let i = 0; i < 3; i += 1) {
      const width = i === 1 ? 0.038 : 0.03
      const block = new THREE.Mesh(new THREE.BoxGeometry(width, 0.026, i === 1 ? 0.04 : 0.033), i === 1 ? stoneLightMaterial : stoneMaterial)
      block.position.set((i - 1) * 0.037, 0.013 + (i === 1 ? 0.005 : 0), 0)
      block.rotation.y = (i - 1) * 0.08
      group.add(block)
      blocks.push(block)
    }
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.005, 0.016),
      new THREE.MeshStandardMaterial({ color: 0xffd75a, emissive: 0x6b4a00, emissiveIntensity: 0.35, roughness: 0.5 }),
    )
    marker.position.set(0, 0.034, 0)
    group.add(marker)
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.118, 0.012, 0.052), standardMaterial(THREE, 0x4d595d, { roughness: 1 }))
    base.position.y = 0.003
    group.add(base)
    const foamRing = new THREE.Mesh(
      new THREE.RingGeometry(0.045, 0.058, 24),
      new THREE.MeshBasicMaterial({ color: 0xf4fff7, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
    )
    foamRing.rotation.x = -Math.PI / 2
    foamRing.position.y = -0.005
    group.add(foamRing)

    const selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.06, 0.072, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd75a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    )
    selectionRing.rotation.x = -Math.PI / 2
    selectionRing.position.y = -0.006
    selectionRing.visible = false
    group.add(selectionRing)

    group.scale.setScalar(0.01)
    const section = {
      group,
      slotIndex,
      x: spec.x,
      z: spec.z,
      currentYaw: spec.yaw,
      quarterTurns: 0,
      baseYaw: spec.yaw,
      placedAt: performance.now() / 1000,
      selectionRing,
      blocks,
    }
    sections.push(section)
    return section
  }

  function selectSlot(slotIndex: number | null) {
    selectedSlot = slotIndex
    for (const section of sections) {
      const selected = section.slotIndex === selectedSlot
      section.selectionRing.visible = selected
      for (const block of section.blocks) {
        block.material.emissive?.setHex(selected ? 0x4a3510 : 0x000000)
        block.material.emissiveIntensity = selected ? 0.8 : 0
      }
    }
    emit()
  }

  function placeOrSelect(slotIndex: number) {
    if (!interactive || !anchorGroup.visible) return
    const existing = sections.find((section) => section.slotIndex === slotIndex)
    if (existing) {
      selectSlot(slotIndex)
      return
    }
    const section = makeSection(slotIndex)
    selectSlot(slotIndex)
    const slot = slotGroups[slotIndex]
    const ring = slot.userData.ring as Object3D
    const ghost = slot.userData.ghost as Object3D
    ring.visible = false
    ghost.visible = false
    // A small scale-in feels like the section is being placed on the water.
    section.placedAt = performance.now() / 1000
    emit()
  }

  function rotateSelected() {
    if (!interactive) return false
    if (selectedSlot === null) return false
    const section = sections.find((item) => item.slotIndex === selectedSlot)
    if (!section) return false
    section.quarterTurns = (section.quarterTurns + 1) % 4
    section.currentYaw = section.baseYaw + (section.quarterTurns * Math.PI) / 2
    section.group.rotation.y = section.currentYaw
    emit()
    return true
  }

  function reset() {
    for (const section of sections) {
      world.remove(section.group)
      disposeObject(section.group)
    }
    sections.length = 0
    selectedSlot = null
    for (const slot of slotGroups) {
      const ring = slot.userData.ring as Object3D
      const ghost = slot.userData.ghost as Object3D
      ring.visible = true
      ghost.visible = interactive
    }
    emit()
  }

  // The CSS3D layer is not used, so let taps reach the WebGL canvas underneath it.
  if (renderer.domElement.style) {
    renderer.domElement.style.touchAction = 'none'
    renderer.domElement.style.cursor = 'pointer'
  }

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let pointerStart: { x: number; y: number } | null = null

  function pointerDown(event: PointerEvent) {
    pointerStart = { x: event.clientX, y: event.clientY }
  }

  function pointerCancel() {
    pointerStart = null
  }

  function pointerUp(event: PointerEvent) {
    if (!pointerStart) return
    const travel = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)
    pointerStart = null
    if (travel > 12) return
    if (!interactive || !anchorGroup.visible) return
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    anchorGroup.updateMatrixWorld(true)
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(slotPickMeshes, false)
    if (hits.length > 0) {
      const slotIndex = hits[0].object.userData.slotIndex as number
      placeOrSelect(slotIndex)
    }
  }

  renderer.domElement.addEventListener('pointerdown', pointerDown)
  renderer.domElement.addEventListener('pointerup', pointerUp)
  renderer.domElement.addEventListener('pointercancel', pointerCancel)

  function update(timeSeconds: number) {
    const delta = lastTime === 0 ? 0 : Math.min(0.1, timeSeconds - lastTime)
    lastTime = timeSeconds
    for (const animation of animated) animation(timeSeconds, delta)
    for (const section of sections) {
      const age = timeSeconds - section.placedAt
      if (age >= 0 && age < 0.34) {
        section.group.scale.setScalar(Math.max(0.01, easeOutBack(age / 0.34)))
      } else {
        section.group.scale.setScalar(1)
      }
      if (section.selectionRing.visible) {
        const pulse = 1 + Math.sin(timeSeconds * 4.2) * 0.1
        section.selectionRing.scale.setScalar(pulse)
      }
    }
  }

  function dispose() {
    renderer.domElement.removeEventListener('pointerdown', pointerDown)
    renderer.domElement.removeEventListener('pointerup', pointerUp)
    renderer.domElement.removeEventListener('pointercancel', pointerCancel)
    for (const slot of slotGroups) disposeObject(slot)
    for (const section of sections) disposeObject(section.group)
    disposeObject(world)
    anchorGroup.remove(world)
  }

  emit()

  return {
    update,
    setInteractive,
    rotateSelected,
    reset,
    dispose,
  }
}
