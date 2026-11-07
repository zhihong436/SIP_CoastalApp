import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { HuntScanEntry } from './HuntScanEntry'
import { breakWavesCardName, openCardProblem } from './openCardProblem'

type ScanState =
  | { status: 'working' }
  | { status: 'error' }
  | { status: 'no_trail' }
  | { status: 'hunt_trail'; sessionId: string }
  | { status: 'done'; sessionId: string }

// The card route is shared by the legacy problem cards and the new hunt card. Break the waves has its
// own active-session check and never calls the legacy open_stop function.
export function ScanPage() {
  const { problem = '' } = useParams()
  if (problem === breakWavesCardName) return <HuntScanEntry />
  return <LegacyScanPage problem={problem} />
}

// A printed legacy card's link. It opens that problem in the caller's active trail, then shows the trail.
function LegacyScanPage({ problem }: { problem: string }) {
  const { session } = useAuth()
  const userId = session!.user.id
  const [state, setState] = useState<ScanState>({ status: 'working' })
  const [attempt, setAttempt] = useState(0)

  const openProblem = useCallback(async () => {
    const { data: member, error } = await supabase
      .from('trail_members')
      .select('session_id')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle()
    if (error) return { status: 'error' } as const
    if (!member) return { status: 'no_trail' } as const

    const { data: trail, error: trailError } = await supabase
      .from('trail_sessions')
      .select('game_version')
      .eq('id', member.session_id)
      .maybeSingle()
    if (trailError) return { status: 'error' } as const
    if (trail?.game_version === 'hunt-v1') {
      return { status: 'hunt_trail', sessionId: member.session_id } as const
    }

    if (!(await openCardProblem(member.session_id, problem))) return { status: 'error' } as const
    return { status: 'done', sessionId: member.session_id } as const
  }, [problem, userId])

  useEffect(() => {
    let cancelled = false
    setState({ status: 'working' })
    void openProblem().then((result) => {
      if (!cancelled) setState(result)
    })
    return () => {
      cancelled = true
    }
  }, [openProblem, attempt])

  if (state.status === 'done') return <Navigate to={`/trail/${state.sessionId}`} replace />
  if (state.status === 'working') return <p className="screen muted">Opening the problem…</p>
  return (
    <main className="screen screen--centered">
      {state.status === 'error' && (
        <>
          <p role="alert">Could not open that problem. Check your connection and try again.</p>
          <button type="button" className="button button--primary" onClick={() => setAttempt(attempt + 1)}>
            Try again
          </button>
        </>
      )}
      {state.status === 'no_trail' && <p>Start a trail with your match first.</p>}
      {state.status === 'hunt_trail' && (
        <p>
          That card belongs to the earlier trail version. Your active trail uses Break the waves.{' '}
          <Link to={`/trail/${state.sessionId}`}>Open your trail</Link>.
        </p>
      )}
      <Link to="/chats">Go to Chats</Link>
    </main>
  )
}
