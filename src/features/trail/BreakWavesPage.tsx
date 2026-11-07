import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { BackIcon, CheckIcon, QrIcon, WaveIcon } from '../../components/Icons'
import { supabase } from '../../lib/supabase'
import { useMatch } from '../chat/useMatch'
import { HuntCardScanner } from './HuntCardScanner'
import { BreakWavesWorldAr, type WorldArPhase, type WorldArState } from './breakWavesWorldAr'
import {
  evaluateBreakWaves,
  failureText,
  normaliseRotation,
  snapCoordinate,
  type BreakWavesPiece,
  type BreakWavesResult,
  type PieceId,
} from './breakWaves'
import type { GhostPiece, LensId } from './breakWavesScene'
import { useBreakWaves } from './useBreakWaves'

interface Props {
  sessionId: string
  matchId: string
}

type Pending =
  | { kind: 'edit' | 'return'; pieceId: PieceId }
  | { kind: 'ready' }
  | { kind: 'ack' }
  | null

interface RpcRow {
  revision?: number
  stale?: boolean
  duplicate?: boolean
  changed?: boolean
  test_ran?: boolean
  accepted?: boolean
  clue_unlocked?: boolean
}

function firstRow(data: RpcRow[] | RpcRow | null): RpcRow | null {
  if (Array.isArray(data)) return data[0] ?? null
  return data ?? null
}

function placementError(result: BreakWavesResult) {
  if (result.errors.includes('out_of_water')) return 'That would fall outside the marked water.'
  if (result.errors.includes('piece_overlap')) return 'That would overlap another breakwater.'
  return 'That placement is not valid.'
}

const INITIAL_WORLD_STATE: WorldArState = {
  phase: 'preparing',
  canStart: false,
  reloadRequired: false,
  message: 'Preparing the world-tracking engine. No camera is requested.',
  sizePercent: 100,
}

const licenseUrl = new URL(
  `${import.meta.env.BASE_URL}ar/vendor/8thwall-engine-1.0.0/LICENSE`,
  window.location.origin,
).href

function worldPhaseCopy(phase: WorldArPhase): { title: string; body: string } {
  switch (phase) {
    case 'preparing':
      return {
        title: 'Preparing world tracking',
        body: 'Loading the local Three.js and 8th Wall engine. No camera is requested until you start.',
      }
    case 'ready':
      return {
        title: 'Ready to place the coast',
        body: 'Start the rear camera when you are standing over a textured floor. Keep tables and other horizontal surfaces out of view.',
      }
    case 'starting':
      return {
        title: 'Starting the camera…',
        body: 'Allow camera and motion access when the browser asks. You can cancel this start below.',
      }
    case 'placing':
      return {
        title: 'Place the coast on the floor',
        body: 'Normal tracking. Tap a textured floor patch above these controls. This first tap places the coast, not a piece.',
      }
    case 'tracking':
      return {
        title: 'Coast placed',
        body: 'Tap one of your own pieces, then tap the water to build. Moving the phone changes the real perspective.',
      }
    case 'tracking-lost':
      return {
        title: 'Find the floor again',
        body: 'Tracking is limited. Move slowly over cracks, gravel, grass or a patterned rug. The coast is hidden and construction pauses; accepted pieces are safe.',
      }
    case 'paused':
    case 'stopped':
      return {
        title: phase === 'paused' ? 'Camera paused' : 'Camera stopped',
        body: 'The camera and AR engine were released. Your shared layout and revision are safe. Start again and place the coast afresh.',
      }
    case 'denied':
      return {
        title: 'Camera access is blocked',
        body: 'Allow camera access in the browser, then try again. HTTPS is required on a phone.',
      }
    case 'unavailable':
      return {
        title: 'World tracking is unavailable',
        body: 'Open this page on a supported iPhone or Android phone with a current browser over HTTPS. No camera was requested here.',
      }
    case 'failed':
      return {
        title: 'World tracking could not start',
        body: 'Check the local engine files and camera/motion permissions, then retry.',
      }
  }
}

function startLabel(phase: WorldArPhase) {
  if (phase === 'preparing') return 'Preparing engine…'
  if (phase === 'paused' || phase === 'stopped' || phase === 'failed') return 'Start camera again'
  if (phase === 'denied') return 'Try camera again'
  return 'Start camera'
}

function EngineNotice() {
  return (
    <div className="hunt-engine">
      <p className="hunt-attribution">
        8th Wall engine by Niantic Spatial, © 2026 Niantic Spatial, Inc. Proprietary{' '}
        <a href={licenseUrl} target="_blank" rel="noreferrer">
          XR Engine License Agreement
        </a>
        ; provided “AS IS”, without warranties; no endorsement.
      </p>
      <p className="hunt-attribution">
        This app stores no camera frames or poses and adds no recording, upload or analytics service of its own. The
        local 8th Wall engine processes frames for tracking; its post-camera network behaviour still needs a
        phone/network check.
      </p>
    </div>
  )
}

function IslandSizeControl({
  value,
  onChange,
  id = 'island-size',
}: {
  value: number
  onChange: (percent: number) => void
  id?: string
}) {
  return (
    <div className="hunt-size">
      <div className="hunt-size__label">
        <label htmlFor={id}>Island size</label>
        <output htmlFor={id}>{value}%</output>
      </div>
      <input
        id={id}
        type="range"
        min={50}
        max={200}
        step={5}
        value={value}
        aria-valuetext={`${value}% of default island size`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <p className="hunt-size__note">Relative size, not metres. It does not move saved pieces or change the revision.</p>
    </div>
  )
}

interface CameraControlProps {
  state: WorldArState
  showStart: boolean
  showStop: boolean
  showRePlace: boolean
  showSize: boolean
  onStart: () => void
  onStop: () => void
  onRePlace: () => void
  onSize: (percent: number) => void
}

function WorldCameraControls({
  state,
  showStart,
  showStop,
  showRePlace,
  showSize,
  onStart,
  onStop,
  onRePlace,
  onSize,
}: CameraControlProps) {
  const copy = state.reloadRequired
    ? {
        title: 'Reload this page',
        body: 'The previous camera startup did not finish cleanly. Reload before starting world tracking again.',
      }
    : worldPhaseCopy(state.phase)
  const showDiagnostic =
    state.reloadRequired ||
    ['denied', 'unavailable', 'failed', 'tracking-lost'].includes(state.phase) ||
    (!state.canStart && ['ready', 'paused', 'stopped'].includes(state.phase))

  return (
    <>
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
      {showDiagnostic && <p className="hunt__diagnostic">{state.message}</p>}
      {showSize && <IslandSizeControl value={state.sizePercent} onChange={onSize} />}
      <div className="hunt-camera-actions">
        {showStart && !state.reloadRequired && (
          <button type="button" className="button button--primary" disabled={!state.canStart} onClick={onStart}>
            {startLabel(state.phase)}
          </button>
        )}
        {showStop && (
          <button type="button" className="button button--secondary" onClick={onStop}>
            {state.phase === 'starting' ? 'Cancel start' : 'Stop camera'}
          </button>
        )}
        {showRePlace && (
          <button type="button" className="button button--secondary" onClick={onRePlace}>
            Re-place coast
          </button>
        )}
        {state.reloadRequired && (
          <button type="button" className="button button--secondary" onClick={() => window.location.reload()}>
            Reload page
          </button>
        )}
      </div>
      <EngineNotice />
    </>
  )
}

export function BreakWavesPage({ sessionId, matchId }: Props) {
  const match = useMatch(matchId)
  const { state, reload } = useBreakWaves(sessionId)
  const [selectedId, setSelectedId] = useState<PieceId | null>(null)
  const [lensOn, setLensOn] = useState(true)
  const [worldState, setWorldState] = useState<WorldArState>(INITIAL_WORLD_STATE)
  const [scanning, setScanning] = useState(false)
  const [help, setHelp] = useState(false)
  const [pending, setPending] = useState<Pending>(null)
  const [ghost, setGhost] = useState<GhostPiece | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dismissedTest, setDismissedTest] = useState<number | null>(null)
  const arPhase = worldState.phase
  const stageRef = useRef<HTMLDivElement>(null)
  const arRef = useRef<BreakWavesWorldAr | null>(null)
  const mounted = useRef(true)
  const mutating = useRef(false)
  const activeSessionId = useRef(sessionId)
  activeSessionId.current = sessionId
  const handlerRef = useRef<{ select: (id: PieceId) => void; water: (point: { x: number; z: number }) => void }>({
    select: () => undefined,
    water: () => undefined,
  })

  const side = match.status === 'ready' ? match.side : null
  const progress = state.status === 'ready' ? state.progress : null
  const pieces = progress?.pieces ?? []
  const myPieces = side ? pieces.filter((piece) => piece.owner === side) : []
  const selectedPiece = myPieces.find((piece) => piece.id === selectedId) ?? null
  const lensId: LensId | null = side === 'a' ? 'waves' : side === 'b' ? 'seabed' : null
  const liveEvaluation = useMemo(() => evaluateBreakWaves(pieces), [pieces])
  const testIsCurrent = Boolean(progress && progress.last_test_revision === progress.revision)
  const currentResult = testIsCurrent ? progress?.last_test_result ?? null : null
  const resultIsDismissed = Boolean(
    progress && !currentResult?.passed && dismissedTest !== null && dismissedTest === progress.attempts,
  )
  const showResult = Boolean(currentResult && !resultIsDismissed)
  const clueUnlocked = Boolean(progress?.clue_unlocked_at)
  const canEdit = Boolean(
    progress &&
      progress.opened_at &&
      !progress.solved_at &&
      !pending &&
      arPhase === 'tracking' &&
      !showResult &&
      !clueUnlocked,
  )
  const myReady = Boolean(progress && (side === 'a' ? progress.ready_a : progress.ready_b))
  const partnerReady = Boolean(progress && (side === 'a' ? progress.ready_b : progress.ready_a))
  const myAck = Boolean(progress && (side === 'a' ? progress.ack_a_at : progress.ack_b_at))
  const partnerAck = Boolean(progress && (side === 'a' ? progress.ack_b_at : progress.ack_a_at))
  const ownPlaced = myPieces.filter((piece) => piece.placed).length
  const canReady = Boolean(canEdit && ownPlaced === 2 && !myReady)

  const waveLayout = testIsCurrent && progress?.last_test_layout ? progress.last_test_layout : pieces
  const lensResult = testIsCurrent && progress?.last_test_result ? progress.last_test_result : liveEvaluation

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // A route change to another trail must not keep the previous stop's local drafts or result.
  useEffect(() => {
    setSelectedId(null)
    setDismissedTest(null)
    setGhost(null)
    setWorldState(INITIAL_WORLD_STATE)
    setPending(null)
    setNotice(null)
    setScanning(false)
    setHelp(false)
    mutating.current = false
  }, [sessionId])

  useEffect(() => {
    if (!selectedId) {
      if (myPieces.length > 0) setSelectedId(myPieces[0].id)
      return
    }
    if (!myPieces.some((piece) => piece.id === selectedId)) setSelectedId(myPieces[0]?.id ?? null)
  }, [myPieces, selectedId])

  useEffect(() => {
    // The SDK is prepared without a camera. This effect deliberately does not depend on pieces,
    // results, pending actions or lens/selection changes: those are queued into the live controller.
    if (!side || state.status !== 'ready' || clueUnlocked || !stageRef.current) return
    const controller = new BreakWavesWorldAr({
      container: stageRef.current,
      mySide: side,
      onState: setWorldState,
      onSelectPiece: (pieceId) => handlerRef.current.select(pieceId),
      onWaterTap: (point) => handlerRef.current.water(point),
    })
    controller.setPieces(pieces)
    controller.setWavePieces(waveLayout)
    controller.setSelected(selectedId)
    controller.setGhost(ghost)
    controller.setLens(lensOn ? lensId : null)
    controller.setEvaluation(lensResult)
    arRef.current = controller
    return () => {
      controller.dispose()
      if (arRef.current === controller) arRef.current = null
    }
  }, [side, state.status, sessionId, clueUnlocked])

  useEffect(() => {
    arRef.current?.setPieces(pieces)
    arRef.current?.setWavePieces(waveLayout)
    arRef.current?.setEvaluation(lensResult)
  }, [pieces, waveLayout, lensResult])

  useEffect(() => {
    arRef.current?.setSelected(selectedId)
  }, [selectedId])

  useEffect(() => {
    arRef.current?.setLens(lensOn ? lensId : null)
  }, [lensOn, lensId])

  useEffect(() => {
    arRef.current?.setGhost(ghost)
  }, [ghost])

  useEffect(() => {
    function leave() {
      if (document.visibilityState === 'hidden') arRef.current?.stop('paused')
    }
    function pageHide() {
      arRef.current?.stop('stopped')
    }
    function pageShow(event: PageTransitionEvent) {
      if (event.persisted) arRef.current?.stop('paused')
    }
    document.addEventListener('visibilitychange', leave)
    window.addEventListener('pagehide', pageHide)
    window.addEventListener('pageshow', pageShow)
    return () => {
      document.removeEventListener('visibilitychange', leave)
      window.removeEventListener('pagehide', pageHide)
      window.removeEventListener('pageshow', pageShow)
    }
  }, [])

  function stillCurrent() {
    return mounted.current && activeSessionId.current === sessionId
  }

  function selectPiece(pieceId: PieceId) {
    setSelectedId(pieceId)
    setNotice(null)
  }

  function candidateWith(piece: BreakWavesPiece, x: number, z: number, rotation: number) {
    return pieces.map((item) =>
      item.id === piece.id ? { ...item, placed: true, x, z, rotation: normaliseRotation(rotation) } : item,
    )
  }

  async function editPiece(piece: BreakWavesPiece, x: number, z: number, rotation: number) {
    // React's phase can lag the controller inside the same event (for example Re-place or loss).
    // The live controller is the authority for whether a mutation may start.
    if (!progress || !canEdit || arRef.current?.phase !== 'tracking') return
    const nextX = snapCoordinate(x)
    const nextZ = snapCoordinate(z)
    const nextRotation = normaliseRotation(rotation)
    const candidate = candidateWith(piece, nextX, nextZ, nextRotation)
    const check = evaluateBreakWaves(candidate)
    if (check.errors.length > 0) {
      setNotice(placementError(check))
      return
    }

    if (mutating.current) return
    mutating.current = true
    const actionId = crypto.randomUUID()
    const expected = progress.revision
    setPending({ kind: 'edit', pieceId: piece.id })
    setGhost({ owner: piece.owner, x: nextX, z: nextZ, rotation: nextRotation })
    setNotice(null)
    const { data, error } = await supabase.rpc('edit_break_waves_piece', {
      p_session_id: sessionId,
      p_action_id: actionId,
      p_expected_revision: expected,
      p_piece_id: piece.id,
      p_x: nextX,
      p_z: nextZ,
      p_rotation: nextRotation,
    })
    if (!stillCurrent()) return
    if (error) {
      await reload()
      if (!stillCurrent()) return
      setNotice('Could not confirm that placement. Check your connection and try again.')
      setGhost(null)
      setPending(null)
      mutating.current = false
      return
    }
    const row = firstRow(data)
    if (row?.stale) setNotice('The shared layout changed. Showing the newest accepted revision.')
    await reload()
    if (!stillCurrent()) return
    setGhost(null)
    setPending(null)
    mutating.current = false
  }

  async function returnPiece() {
    if (!progress || !selectedPiece || !canEdit || arRef.current?.phase !== 'tracking' || mutating.current) return
    mutating.current = true
    const actionId = crypto.randomUUID()
    setPending({ kind: 'return', pieceId: selectedPiece.id })
    setGhost(null)
    setNotice(null)
    const { data, error } = await supabase.rpc('return_break_waves_piece', {
      p_session_id: sessionId,
      p_action_id: actionId,
      p_expected_revision: progress.revision,
      p_piece_id: selectedPiece.id,
    })
    if (!stillCurrent()) return
    if (error) {
      await reload()
      if (!stillCurrent()) return
      setNotice('Could not confirm that return. Check your connection and try again.')
      setPending(null)
      mutating.current = false
      return
    }
    const row = firstRow(data)
    if (row?.stale) setNotice('The shared layout changed. Showing the newest accepted revision.')
    await reload()
    if (!stillCurrent()) return
    setPending(null)
    mutating.current = false
  }

  async function setReady() {
    if (
      !progress ||
      pending ||
      arPhase !== 'tracking' ||
      arRef.current?.phase !== 'tracking' ||
      !progress.opened_at ||
      progress.solved_at ||
      ownPlaced < 2
    ) {
      return
    }
    if (mutating.current) return
    mutating.current = true
    const actionId = crypto.randomUUID()
    setPending({ kind: 'ready' })
    setDismissedTest(null)
    setNotice(null)
    const { data, error } = await supabase.rpc('set_break_waves_ready', {
      p_session_id: sessionId,
      p_action_id: actionId,
      p_expected_revision: progress.revision,
      p_ready: true,
    })
    if (!stillCurrent()) return
    if (error) {
      await reload()
      if (!stillCurrent()) return
      setNotice('Could not confirm your ready check. Check your connection and try again.')
      setPending(null)
      mutating.current = false
      return
    }
    const row = firstRow(data)
    if (row?.stale) setNotice('The shared layout changed. Check the newest revision and ready again.')
    await reload()
    if (!stillCurrent()) return
    setPending(null)
    mutating.current = false
  }

  async function acknowledge() {
    if (!progress || !progress.solved_revision || pending || mutating.current) return
    mutating.current = true
    const actionId = crypto.randomUUID()
    setPending({ kind: 'ack' })
    setNotice(null)
    const { data, error } = await supabase.rpc('acknowledge_break_waves', {
      p_session_id: sessionId,
      p_action_id: actionId,
      p_result_revision: progress.solved_revision,
    })
    if (!stillCurrent()) return
    if (error) {
      await reload()
      if (!stillCurrent()) return
      setNotice('Could not confirm your acknowledgement. Check your connection and try again.')
      setPending(null)
      mutating.current = false
      return
    }
    const row = firstRow(data)
    if (row?.stale) setNotice('That result changed. Showing the newest shared result.')
    await reload()
    if (!stillCurrent()) return
    setPending(null)
    mutating.current = false
  }

  async function openScannedStop() {
    const { data, error } = await supabase.rpc('open_break_waves_stop', { p_session_id: sessionId })
    if (error || data !== true) return false
    if (!stillCurrent()) return false
    await reload()
    if (!stillCurrent()) return false
    setScanning(false)
    return true
  }

  function handleSelect(pieceId: PieceId) {
    if (!canEdit || arRef.current?.phase !== 'tracking') return
    if (side && myPieces.some((piece) => piece.id === pieceId)) selectPiece(pieceId)
  }

  function handleWaterTap(point: { x: number; z: number }) {
    if (!canEdit || arRef.current?.phase !== 'tracking' || !selectedPiece) return
    void editPiece(selectedPiece, point.x, point.z, selectedPiece.rotation)
  }

  handlerRef.current = { select: handleSelect, water: handleWaterTap }

  function rotateSelected() {
    if (!canEdit || arRef.current?.phase !== 'tracking' || !selectedPiece?.placed) return
    void editPiece(selectedPiece, selectedPiece.x, selectedPiece.z, selectedPiece.rotation + 15)
  }

  function openScanner() {
    // The scanner may open its own camera only after the AR engine has released its session.
    arRef.current?.stop('stopped')
    setScanning(true)
  }

  function startCamera() {
    if (scanning) return
    // XR8.run() must stay inside this click's user gesture; the controller never awaits first.
    arRef.current?.start()
  }

  function stopCamera() {
    arRef.current?.stop('stopped')
  }

  function rePlaceIsland() {
    // Local anchor/ghost only: accepted pieces, revision and ready checks are untouched.
    setGhost(null)
    arRef.current?.rePlace()
  }

  function resizeIsland(percent: number) {
    arRef.current?.setIslandSize(percent)
  }

  if (state.status === 'loading') return <p className="screen muted">Loading Break the waves…</p>
  if (state.status === 'not_found') {
    return (
      <main className="screen screen--centered">
        <p>This stop does not exist.</p>
        <Link to="/chats">Back to Chats</Link>
      </main>
    )
  }
  if (state.status === 'unsupported') {
    return (
      <main className="screen screen--centered">
        <p>This phone has a trail version this build does not support.</p>
        <Link to="/chats">Back to Chats</Link>
      </main>
    )
  }
  if (state.status === 'error') {
    return (
      <main className="screen screen--centered">
        <p role="alert">Could not load Break the waves. Check your connection and try again.</p>
        <button type="button" className="button button--primary" onClick={() => void reload()}>
          Try again
        </button>
        <Link to="/chats">Back to Chats</Link>
      </main>
    )
  }
  if (match.status === 'loading') return <p className="screen muted">Loading your partner…</p>
  if (match.status !== 'ready' || !side) {
    return (
      <main className="screen screen--centered">
        <p role="alert">Could not load your match. Check your connection and try again.</p>
        <Link to="/chats">Back to Chats</Link>
      </main>
    )
  }

  if (!progress) return <p className="screen muted">Loading Break the waves…</p>

  const partner = match.partner
  const cameraRunning = ['starting', 'placing', 'tracking', 'tracking-lost'].includes(arPhase)
  const showCameraSetup =
    !clueUnlocked &&
    !showResult &&
    !scanning &&
    progress.opened_at !== null &&
    (!cameraRunning || arPhase === 'starting')
  const showPlacement = !clueUnlocked && !showResult && !scanning && arPhase === 'placing'
  const showTrackingLost = !clueUnlocked && !showResult && !scanning && arPhase === 'tracking-lost'
  const showBuildSheet = !clueUnlocked && !showResult && !scanning && arPhase === 'tracking'
  const showScanPanel = !clueUnlocked && !scanning && progress.opened_at === null
  const trackingLabel =
    arPhase === 'tracking'
      ? 'Coast placed'
      : arPhase === 'placing'
        ? 'Tap floor to place'
        : arPhase === 'tracking-lost'
          ? 'Tracking limited'
          : arPhase === 'starting'
            ? 'Starting camera'
            : arPhase === 'preparing'
              ? 'Preparing engine'
              : arPhase === 'ready'
                ? 'Engine ready'
                : arPhase === 'denied'
                  ? 'Camera blocked'
                  : arPhase === 'unavailable'
                    ? 'Tracking unavailable'
                    : arPhase === 'failed'
                      ? 'AR needs attention'
                      : 'Camera off'

  if (clueUnlocked) {
    return (
      <div className="hunt hunt--clue" data-side={side}>
        <header className="hunt__header">
          <Link to={`/chats/${matchId}`} className="hunt__icon-button" aria-label="Back to the conversation">
            <BackIcon />
          </Link>
          <div className="hunt__title">
            <small>First stop complete</small>
            <h1>Break the waves</h1>
          </div>
        </header>
        <main className="hunt-clue">
          <p className="hunt-kicker">Our coast, our tomorrow</p>
          <h2>
            You sheltered
            <br />
            the shore.
          </h2>
          <p className="hunt-clue__body">
            Keep your conversation going. There is more to protecting a coast than one calm stretch of water.
          </p>
          <section className="hunt-clue__card" aria-labelledby="clue-title">
            <small id="clue-title">Your next clue · stop 2</small>
            <p>“The waves are calmer, but the water is rising. Find the Higher ground QR card.”</p>
            <footer>
              <span>Next challenge</span>
              <strong>Higher ground</strong>
            </footer>
          </section>
          <div className="hunt-clue__progress" aria-hidden="true">
            <span data-done="true" />
            <span />
            <span />
          </div>
          <p className="hunt-clue__not-built">
            <strong>Higher ground is not built yet.</strong> Stop 2 is not part of this demo, and no later stop has been
            simulated or unlocked.
          </p>
          <Link to={`/chats/${matchId}`} className="button button--primary button--full">
            Back to the conversation
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="hunt" data-side={side}>
      <div ref={stageRef} className={`hunt__stage ${cameraRunning ? 'hunt__stage--live' : ''}`} aria-hidden="true" />

      <header className="hunt__header">
        <Link to={`/chats/${matchId}`} className="hunt__icon-button" aria-label="Back to the conversation">
          <BackIcon />
        </Link>
        <div className="hunt__title">
          <small>Our coast, our tomorrow</small>
          <h1>Break the waves</h1>
        </div>
        <button type="button" className="hunt__icon-button" aria-label="Explain this stop" onClick={() => setHelp(!help)}>
          ?
        </button>
      </header>

      <section className="hunt__goal" aria-label="Stop goal">
        <div className="hunt__goal-head">
          <span>Stop 1 of 3</span>
          <span className="hunt__dots" aria-hidden="true">
            <i data-on="true" />
            <i />
            <i />
          </span>
        </div>
        <p>
          Shelter both beaches.
          <br />
          Keep the boat entrance open.
        </p>
      </section>

      <div className="hunt__tracking" data-state={arPhase}>
        <span aria-hidden="true" />
        <span>{trackingLabel}</span>
      </div>

      {showTrackingLost && (
        <div className="hunt__lost" role="status">
          <strong>Find your coast again</strong>
          <p>
            Tracking is limited. Move slowly over cracks, gravel, grass or a patterned rug. Construction pauses; your
            accepted pieces are safe.
          </p>
          <div className="hunt__lost-actions">
            <button type="button" className="button button--secondary" onClick={rePlaceIsland}>
              Re-place coast
            </button>
            <button type="button" className="button button--secondary" onClick={stopCamera}>
              Stop camera
            </button>
          </div>
          <EngineNotice />
        </div>
      )}

      {showScanPanel && (
        <section className="hunt__setup" aria-labelledby="scan-title">
          <span className="hunt__setup-icon" aria-hidden="true">
            <QrIcon size={30} />
          </span>
          <h2 id="scan-title">Find the stop card</h2>
          <p>
            Both of you scan the same <strong>Break the waves</strong> card. The scanner releases its camera before the
            floor AR camera can start, so only one camera is ever in use.
          </p>
          <button type="button" className="button button--primary button--full" onClick={openScanner}>
            <QrIcon />
            Scan the QR card
          </button>
          <p className="hunt__fine">You can also open the printed card's link with your phone camera.</p>
        </section>
      )}

      {showCameraSetup && (
        <section
          className={`hunt__setup ${['denied', 'unavailable', 'failed'].includes(arPhase) ? 'hunt__setup--warning' : ''}`}
          aria-label="Camera and placement status"
        >
          <span className="hunt__setup-icon" aria-hidden="true">
            <WaveIcon size={30} />
          </span>
          <WorldCameraControls
            state={worldState}
            showStart={!cameraRunning && arPhase !== 'unavailable'}
            showStop={arPhase === 'starting'}
            showRePlace={false}
            showSize={false}
            onStart={startCamera}
            onStop={stopCamera}
            onRePlace={rePlaceIsland}
            onSize={resizeIsland}
          />
        </section>
      )}

      {showPlacement && (
        <section className="hunt__setup hunt__setup--floor" aria-label="Coast placement">
          <span className="hunt__setup-icon" aria-hidden="true">
            <WaveIcon size={30} />
          </span>
          <WorldCameraControls
            state={worldState}
            showStart={false}
            showStop
            showRePlace={false}
            showSize
            onStart={startCamera}
            onStop={stopCamera}
            onRePlace={rePlaceIsland}
            onSize={resizeIsland}
          />
        </section>
      )}

      {showResult && currentResult && (
        <section className="hunt-sheet hunt-result" aria-labelledby="result-title">
          <span className={`hunt-result__kicker ${currentResult.passed ? '' : 'hunt-result__kicker--warning'}`}>
            {currentResult.passed ? <CheckIcon size={16} /> : <WaveIcon size={16} />}
            {currentResult.passed ? 'Protected together' : 'Wave test · try another layout'}
          </span>
          <h2 id="result-title">
            {currentResult.passed ? (
              <>
                A little teamwork.
                <br />A calmer coast.
              </>
            ) : (
              <>
                The coast still
                <br />
                needs work.
              </>
            )}
          </h2>
          <p className="hunt-result__summary">
            {currentResult.passed
              ? 'Your breakwaters shelter both beaches and the boat route is open. Both players contributed accepted pieces.'
              : 'Your accepted pieces stayed where you placed them. Change the layout and test again together.'}
          </p>
          <div className="hunt-result__checks">
            <span data-bad={currentResult.west_sheltered < 7}>
              {currentResult.west_sheltered < 7 ? '!' : '✓'} West {currentResult.west_sheltered}/7
            </span>
            <span data-bad={currentResult.east_sheltered < 7}>
              {currentResult.east_sheltered < 7 ? '!' : '✓'} East {currentResult.east_sheltered}/7
            </span>
            <span data-bad={!currentResult.corridor_clear}>
              {currentResult.corridor_clear ? '✓' : '!'} Boat route {currentResult.corridor_clear ? 'open' : 'blocked'}
            </span>
          </div>
          {arPhase === 'tracking' ? (
            <div className="hunt-result__session" aria-label="Camera and island controls">
              <div className="hunt-result__session-head">
                <strong>Camera and island</strong>
                <span>Still tracking</span>
              </div>
              <div className="hunt-camera-actions">
                <button type="button" className="button button--secondary" onClick={stopCamera}>
                  Stop camera
                </button>
                <button type="button" className="button button--secondary" onClick={rePlaceIsland}>
                  Re-place coast
                </button>
              </div>
              <IslandSizeControl id="result-island-size" value={worldState.sizePercent} onChange={resizeIsland} />
              <EngineNotice />
            </div>
          ) : (
            <div className="hunt-result__camera">
              <WorldCameraControls
                state={worldState}
                showStart={!cameraRunning && arPhase !== 'unavailable'}
                showStop={cameraRunning}
                showRePlace={arPhase === 'tracking-lost'}
                showSize={cameraRunning}
                onStart={startCamera}
                onStop={stopCamera}
                onRePlace={rePlaceIsland}
                onSize={resizeIsland}
              />
            </div>
          )}
          {!currentResult.passed && currentResult.failures.length > 0 && (
            <ul className="hunt-result__failures">
              {currentResult.failures.map((failure) => (
                <li key={failure}>{failureText[failure] ?? failure}</li>
              ))}
            </ul>
          )}
          {currentResult.passed && (
            <p className="hunt-result__fact">
              <strong>What you changed</strong>
              Breakwaters reduce wave energy before it reaches the beach. They do not stop flooding from higher sea
              levels.
            </p>
          )}
          <p className="hunt-result__revision">
            Tested revision {progress.last_test_revision} · attempt {progress.attempts}
          </p>
          {currentResult.passed ? (
            <>
              <button
                type="button"
                className="button button--primary button--full"
                disabled={myAck || pending?.kind === 'ack'}
                onClick={() => void acknowledge()}
              >
                {myAck ? 'Waiting for your partner…' : pending?.kind === 'ack' ? 'Saving…' : 'Continue together'}
              </button>
              <p className="hunt__fine">
                {myAck
                  ? `${partner.name} still needs to continue. The clue appears only after both of you acknowledge this result.`
                  : 'Both of you continue to unlock the next clue. The successful layout is locked.'}
              </p>
              {partnerAck && !myAck && <p className="hunt__fine">{partner.name} has continued.</p>}
            </>
          ) : (
            <div className="hunt-result__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={() => setDismissedTest(progress.attempts)}
              >
                Adjust the build
              </button>
              <button
                type="button"
                className="button button--secondary"
                disabled={Boolean(pending) || arPhase !== 'tracking'}
                onClick={() => {
                  setDismissedTest(progress.attempts)
                  void setReady()
                }}
              >
                Test this layout again
              </button>
            </div>
          )}
          {notice && (
            <p className="hunt__notice" role="alert">
              {notice}
            </p>
          )}
        </section>
      )}

      {showBuildSheet && (
        <section className="hunt-sheet" aria-label="Build controls">
          <div className="hunt-sheet__handle" aria-hidden="true" />
          <button
            type="button"
            className="hunt-lens"
            aria-pressed={lensOn}
            onClick={() => setLensOn(!lensOn)}
          >
            <span>
              <WaveIcon size={18} />
              Your {side === 'a' ? 'wave' : 'seabed'} lens
            </span>
            <span className="hunt-lens__switch" aria-hidden="true" />
          </button>

          <IslandSizeControl value={worldState.sizePercent} onChange={resizeIsland} />
          <div className="hunt-island-actions">
            <button type="button" className="button button--secondary" onClick={rePlaceIsland}>
              Re-place coast
            </button>
            <button type="button" className="button button--secondary" onClick={stopCamera}>
              Stop camera
            </button>
          </div>

          <div className="hunt-sheet__head">
            <strong>Your breakwaters</strong>
            <span>
              {ownPlaced} of 2 placed · revision {progress.revision}
            </span>
          </div>
          <div className="hunt-pieces">
            {myPieces.map((piece) => (
              <button
                key={piece.id}
                type="button"
                className="hunt-piece"
                data-selected={piece.id === selectedId}
                data-placed={piece.placed}
                aria-pressed={piece.id === selectedId}
                onClick={() => selectPiece(piece.id)}
              >
                <span className="hunt-piece__swatch" data-owner={piece.owner} aria-hidden="true" />
                <span>
                  <strong>{piece.id.toUpperCase()}</strong>
                  <small>{piece.placed ? 'Placed' : 'Not placed'}</small>
                </span>
                {piece.placed && <CheckIcon size={16} />}
              </button>
            ))}
          </div>

          <div className="hunt-controls">
            <button
              type="button"
              className="button button--secondary hunt-controls__button"
              disabled={!canEdit || !selectedPiece?.placed || pending?.kind === 'edit'}
              onClick={rotateSelected}
            >
              Rotate 15°
            </button>
            <button
              type="button"
              className="button button--secondary hunt-controls__button"
              disabled={!canEdit || !selectedPiece?.placed || pending?.kind === 'return'}
              onClick={() => void returnPiece()}
            >
              Return
            </button>
            <span className="hunt-controls__tip">
              {pending
                ? 'Saving accepted change…'
                : selectedPiece?.placed
                  ? 'Tap the water to move your selected piece.'
                  : 'Select a piece, then tap the water to place it.'}
            </span>
          </div>

          <div className="hunt-ready">
            <button
              type="button"
              className="button button--primary hunt-ready__button"
              disabled={!canReady || pending?.kind === 'ready'}
              onClick={() => void setReady()}
            >
              {pending?.kind === 'ready' ? 'Saving…' : myReady ? 'Ready · waiting' : 'Ready to test'}
            </button>
            <div className="hunt-partner">
              <Avatar name={partner.name} className="avatar avatar--small" />
              <span>
                Partner
                <strong>{partnerReady ? 'Ready ✓' : 'Building…'}</strong>
              </span>
            </div>
          </div>
          <p className="hunt-sheet__note">
            {notice ? (
              <span role="alert">{notice}</span>
            ) : pending ? (
              'Not accepted yet. Waiting for the database to confirm this change.'
            ) : (
              `Saved layout revision ${progress.revision}. ${myReady ? 'A change clears both ready checks.' : ownPlaced < 2 ? 'Place both of your pieces to ready the test.' : 'Test starts when you are both ready.'}`
            )}
          </p>
          <EngineNotice />
        </section>
      )}

      {help && (
        <section className="hunt-help" role="dialog" aria-modal="true" aria-labelledby="help-title">
          <h2 id="help-title">How this stop works</h2>
          <p>
            Waves travel from the open sea towards the two beaches. Each beach has seven sample points. A point is
            sheltered when a breakwater's long centreline crosses the line the wave travels along.
          </p>
          <p>
            Each beach needs at least two pieces, and one player's two pieces cannot shelter both. The boat corridor
            between the beaches must stay open. Both players need accepted pieces.
          </p>
          <p>
            The wave and seabed lenses show different information; both of you can still inspect and build. This is an
            illustrative model. Breakwaters reduce wave energy; they do not stop flooding from higher sea levels.
          </p>
          <p>
            The camera starts only when you press Start camera. Stand over a textured floor, then tap the floor once to
            place the coast. That first tap cannot place a piece. Moving the phone changes the real perspective; this is
            not a fixed camera angle. Island size and Re-place are local controls: they never change accepted pieces,
            readiness or the saved revision.
          </p>
          <p>
            Construction is saved in the trail and does not depend on the camera staying on. The app stores no camera
            frames or poses. The local 8th Wall engine processes frames for tracking; verify post-camera network
            behaviour on a phone before making a privacy claim.
          </p>
          <EngineNotice />
          <button type="button" className="button button--primary button--full" onClick={() => setHelp(false)}>
            Back to the coast
          </button>
        </section>
      )}

      {scanning && <HuntCardScanner onClose={() => setScanning(false)} onDetected={openScannedStop} />}
    </div>
  )
}
