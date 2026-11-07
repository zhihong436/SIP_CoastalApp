import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { BackIcon } from '../../components/Icons'
import { useAuth } from '../auth/AuthProvider'
import { useMatch } from '../chat/useMatch'
import { BoardPage } from './BoardPage'
import { BreakWavesPage } from './BreakWavesPage'
import { InterpreterStop } from './InterpreterStop'
import { InvestigatorStop } from './InvestigatorStop'
import { StopIntro, roleNames, type Role } from './StopIntro'
import { useTrailSession, type StopProgress, type TrailSession } from './useTrailSession'

export function TrailPage() {
  const { sessionId = '' } = useParams()
  // The key makes a session-ID route change a real unmount. Otherwise the previous trail page,
  // its loads, local action closures, delayed mutation refreshes and AR controller could survive
  // into the next session.
  return <TrailSessionPage key={sessionId} sessionId={sessionId} />
}

function TrailSessionPage({ sessionId }: { sessionId: string }) {
  const { state, reload } = useTrailSession(sessionId)

  if (state.status === 'loading') return <p className="screen muted">Loading…</p>
  if (state.status === 'error') {
    return (
      <main className="screen screen--centered">
        <p role="alert">Could not load the trail. Check your connection and try again.</p>
        <button type="button" className="button button--primary" onClick={reload}>
          Try again
        </button>
        <Link to="/chats">Back to Chats</Link>
      </main>
    )
  }
  if (state.status === 'not_found') {
    return (
      <main className="screen screen--centered">
        <p>This trail does not exist.</p>
        <Link to="/chats">Back to Chats</Link>
      </main>
    )
  }
  // A trail that has not started belongs in the lobby.
  if (state.session.status === 'lobby') {
    return <Navigate to={`/chats/${state.session.match_id}/trail`} replace />
  }
  if (state.session.game_version === 'hunt-v1') {
    return <BreakWavesPage sessionId={state.session.id} matchId={state.session.match_id} />
  }
  if ((state.session.game_version as string) !== 'legacy') {
    return (
      <main className="screen screen--centered">
        <p>This trail uses a version this build does not support.</p>
        <Link to="/chats">Back to Chats</Link>
      </main>
    )
  }
  const progress = state.stops.find((stop) => stop.stop === state.session.current_stop)
  if (!progress) return <BoardPage session={state.session} stops={state.stops} onChanged={reload} />
  return <Stop session={state.session} progress={progress} onChanged={reload} />
}

// Whether this phone has passed the intro survives a reload, so reloading mid-stop does not repeat it.
function introKey(sessionId: string, stop: number) {
  return `trail-intro-done-${sessionId}-${stop}`
}

function readIntroDone(key: string) {
  try {
    return sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function Stop({
  session,
  progress,
  onChanged,
}: {
  session: TrailSession
  progress: StopProgress
  onChanged: () => void
}) {
  const { session: auth } = useAuth()
  const userId = auth!.user.id
  const match = useMatch(session.match_id)
  const key = introKey(session.id, progress.stop)
  const [introDone, setIntroDone] = useState(() => readIntroDone(key))
  const role: Role = progress.interpreter_id === userId ? 'interpreter' : 'investigator'

  if (match.status === 'loading') return <p className="screen muted">Loading…</p>
  if (match.status !== 'ready') {
    return (
      <main className="screen screen--centered">
        <p role="alert">Could not load the trail. Check your connection and try again.</p>
        <Link to="/chats">Back to Chats</Link>
      </main>
    )
  }

  function begin() {
    try {
      sessionStorage.setItem(key, '1')
    } catch {
      // The intro only shows again after a reload.
    }
    setIntroDone(true)
  }

  // The camera screen fills the whole phone and has its own back control.
  if (introDone && role === 'investigator') {
    return (
      <InvestigatorStop sessionId={session.id} matchId={session.match_id} progress={progress} onChanged={onChanged} />
    )
  }

  return (
    <div className="focus">
      <header className="focus__header">
        <Link to={`/chats/${session.match_id}`} className="back-link" aria-label="Back to the conversation">
          <BackIcon />
        </Link>
        <h1>{introDone ? `Hold the shore · ${roleNames[role]}` : 'Hold the shore'}</h1>
      </header>
      {!introDone ? (
        <StopIntro role={role} onBegin={begin} />
      ) : (
        <InterpreterStop sessionId={session.id} progress={progress} onChanged={onChanged} />
      )}
    </div>
  )
}
