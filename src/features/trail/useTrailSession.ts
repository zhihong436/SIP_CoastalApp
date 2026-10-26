import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useResync } from '../../lib/useResync'

export interface TrailSession {
  id: string
  match_id: string
  status: 'lobby' | 'active' | 'paused'
  current_stop: number
}

export interface StopProgress {
  stop: number
  interpreter_id: string
  investigator_id: string
  answer_correct: boolean
  photo_taken: boolean
  solved_at: string | null
}

type TrailState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'not_found' }
  | { status: 'ready'; session: TrailSession; progress: StopProgress | null }

// Reads a trail session the caller belongs to and the progress of its current stop.
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
    const { data: progress, error: progressError } = await supabase
      .from('stop_progress')
      .select('stop, interpreter_id, investigator_id, answer_correct, photo_taken, solved_at')
      .eq('session_id', sessionId)
      .eq('stop', session.current_stop)
      .maybeSingle()
    if (progressError) {
      setState((current) => (current.status === 'ready' ? current : { status: 'error' }))
      return
    }
    setState({ status: 'ready', session: session as TrailSession, progress })
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
