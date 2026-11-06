import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useResync } from '../../lib/useResync'
import type { BreakWavesPiece, BreakWavesResult } from './breakWaves'

export interface HuntTrailSession {
  id: string
  match_id: string
  status: 'lobby' | 'active' | 'paused'
  current_stop: number | null
  game_version: 'legacy' | 'hunt-v1'
}

export interface BreakWavesProgress {
  session_id: string
  revision: number
  pieces: BreakWavesPiece[]
  ready_a: boolean
  ready_b: boolean
  attempts: number
  last_test_revision: number | null
  last_test_layout: BreakWavesPiece[] | null
  last_test_result: BreakWavesResult | null
  solved_revision: number | null
  solved_at: string | null
  ack_a_at: string | null
  ack_b_at: string | null
  clue_unlocked_at: string | null
  opened_at: string | null
  updated_at: string
}

type BreakWavesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'not_found' }
  | { status: 'unsupported' }
  | { status: 'ready'; session: HuntTrailSession; progress: BreakWavesProgress }

const progressColumns = [
  'session_id',
  'revision',
  'pieces',
  'ready_a',
  'ready_b',
  'attempts',
  'last_test_revision',
  'last_test_layout',
  'last_test_result',
  'solved_revision',
  'solved_at',
  'ack_a_at',
  'ack_b_at',
  'clue_unlocked_at',
  'opened_at',
  'updated_at',
].join(', ')

// Reads the hunt stop and its accepted shared construction. Every call is tagged, so a late response
// from an old session or a superseded refresh cannot overwrite newer state. Realtime only says that
// something changed; the database row is fetched again and remains the source of truth.
export function useBreakWaves(sessionId: string) {
  const [state, setState] = useState<BreakWavesState>({ status: 'loading' })
  const request = useRef(0)
  const mounted = useRef(true)

  const load = useCallback(async () => {
    const mine = ++request.current
    const { data: session, error } = await supabase
      .from('trail_sessions')
      .select('id, match_id, status, current_stop, game_version')
      .eq('id', sessionId)
      .maybeSingle()
    if (!mounted.current || mine !== request.current) return
    if (error) {
      if (error.code === '22P02') setState({ status: 'not_found' })
      else setState((current) => (current.status === 'ready' ? current : { status: 'error' }))
      return
    }
    if (!session) {
      setState({ status: 'not_found' })
      return
    }
    if (session.game_version !== 'hunt-v1') {
      setState({ status: 'unsupported' })
      return
    }

    const { data: progress, error: progressError } = await supabase
      .from('break_waves_progress')
      .select(progressColumns)
      .eq('session_id', sessionId)
      .maybeSingle()
    if (!mounted.current || mine !== request.current) return
    if (progressError) {
      setState((current) => (current.status === 'ready' ? current : { status: 'error' }))
      return
    }
    if (!progress) {
      setState({ status: 'not_found' })
      return
    }
    setState({
      status: 'ready',
      session: session as HuntTrailSession,
      progress: progress as unknown as BreakWavesProgress,
    })
  }, [sessionId])

  useEffect(() => {
    mounted.current = true
    setState({ status: 'loading' })
    void load()
    return () => {
      mounted.current = false
      request.current += 1
    }
  }, [load])

  useResync(() => void load())

  useEffect(() => {
    const channel = supabase
      .channel(`break-waves-${sessionId}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'break_waves_progress', filter: `session_id=eq.${sessionId}` },
        () => void load(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trail_sessions', filter: `id=eq.${sessionId}` }, () =>
        void load(),
      )
      .subscribe((subscription) => {
        if (subscription === 'SUBSCRIBED') void load()
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [sessionId, load])

  return { state, reload: load }
}
