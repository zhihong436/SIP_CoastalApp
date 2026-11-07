import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { breakWavesScanReceipt } from './breakWavesEntry'

type State =
  | { status: 'working' }
  | { status: 'error' }
  | { status: 'no_trail' }
  | { status: 'legacy_trail' }
  | { status: 'closed'; sessionId: string }
  | { status: 'done'; sessionId: string }

// The printed hunt card's link. It opens stop 1 only inside a new hunt-version trail that the caller is
// already active in. A legacy session is refused here instead of being silently converted.
export function HuntScanEntry() {
  const { session } = useAuth()
  const userId = session!.user.id
  const [state, setState] = useState<State>({ status: 'working' })
  const [attempt, setAttempt] = useState(0)

  const open = useCallback(async () => {
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
      .select('id, status, current_stop, game_version')
      .eq('id', member.session_id)
      .maybeSingle()
    if (trailError) return { status: 'error' } as const
    if (!trail) return { status: 'no_trail' } as const
    if (trail.game_version !== 'hunt-v1') return { status: 'legacy_trail' } as const
    if (trail.status !== 'active' || trail.current_stop !== 1) {
      return { status: 'closed', sessionId: trail.id } as const
    }

    const { data: opened, error: openError } = await supabase.rpc('open_break_waves_stop', {
      p_session_id: trail.id,
    })
    if (openError || opened !== true) return { status: 'error' } as const
    return { status: 'done', sessionId: trail.id } as const
  }, [userId])

  useEffect(() => {
    let cancelled = false
    setState({ status: 'working' })
    void open().then((result) => {
      if (!cancelled) setState(result)
    })
    return () => {
      cancelled = true
    }
  }, [open, attempt])

  if (state.status === 'done') {
    return <Navigate to={`/trail/${state.sessionId}`} replace state={breakWavesScanReceipt(state.sessionId)} />
  }
  if (state.status === 'working') return <p className="screen muted">Opening Break the waves…</p>

  return (
    <main className="screen screen--centered">
      {state.status === 'error' && (
        <>
          <p role="alert">Could not open the stop. Check your connection and try again.</p>
          <button type="button" className="button button--primary" onClick={() => setAttempt(attempt + 1)}>
            Try again
          </button>
        </>
      )}
      {state.status === 'no_trail' && <p>Start a trail with your match before scanning the stop card.</p>}
      {state.status === 'legacy_trail' && (
        <p>
          This card belongs to the new Break the waves hunt. Your current trail is the earlier version, so this card
          cannot open it.
        </p>
      )}
      {state.status === 'closed' && (
        <p>
          This stop is no longer open.{' '}
          <Link to={`/trail/${state.sessionId}`}>Return to the trail</Link> to see its current state.
        </p>
      )}
      <Link to="/chats">Go to Chats</Link>
    </main>
  )
}
