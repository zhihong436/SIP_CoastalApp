import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useResync } from '../../lib/useResync'
import type { Plan, ResultId, SectionId } from './holdTheShore'

export interface TrailSession {
  id: string
  match_id: string
  status: 'lobby' | 'active' | 'paused'
  // Null means the pair is on the board.
  current_stop: number | null
}

export interface StopProgress {
  stop: number
  interpreter_id: string
  investigator_id: string
  // Every checked plan, so a rise tells the Investigator's phone to play the storm.
  attempts: number
  last_plan: Plan | null
  last_results: Record<SectionId, ResultId> | null
  solved_at: string | null
  interpreter_acknowledged_at: string | null
  investigator_acknowledged_at: string | null
}

type TrailState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'not_found' }
  | { status: 'ready'; session: TrailSession; stops: StopProgress[] }

// Reads a trail session the caller belongs to and the progress of every problem opened so far.
export function useTrailSession(sessionId: string) {
  const [state, setState] = useState<TrailState>({ status: 'loading' })

  const load = useCallback(async () => {
    const { data: session, error } = await supabase
      .from('trail_sessions')
      .select('id, match_id, status, current_stop')
      .eq('id', sessionId)
      .maybeSingle()
    if (error) {
      // 22P02 means the URL did not hold a valid id. A failed refresh keeps what is already on screen.
      if (error.code === '22P02') setState({ status: 'not_found' })
      else setState((current) => (current.status === 'ready' ? current : { status: 'error' }))
      return
    }
    if (!session) {
      setState({ status: 'not_found' })
      return
    }
    const { data: stops, error: progressError } = await supabase
      .from('stop_progress')
      .select(
        'stop, interpreter_id, investigator_id, attempts, last_plan, last_results, solved_at, interpreter_acknowledged_at, investigator_acknowledged_at',
      )
      .eq('session_id', sessionId)
    if (progressError) {
      setState((current) => (current.status === 'ready' ? current : { status: 'error' }))
      return
    }
    setState({ status: 'ready', session: session as TrailSession, stops: stops as StopProgress[] })
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load])

  useResync(() => void load())

  // Row-level security limits these events to this person's own trail. Realtime only says something changed.
  useEffect(() => {
    const channel = supabase
      .channel(`trail-${sessionId}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trail_sessions' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stop_progress' }, () => void load())
      .subscribe((subscription) => {
        // Fetch right after subscribing, so nothing that changed before the subscription is missed.
        if (subscription === 'SUBSCRIBED') void load()
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [sessionId, load])

  return { state, reload: () => void load() }
}
