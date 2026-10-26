import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useResync } from '../../lib/useResync'
import { useAuth } from '../auth/AuthProvider'

type Status = 'loading' | 'ready' | 'error'

// The trail session for a match. It does not exist until someone first marks ready.
export function useLobby(matchId: string) {
  const { session } = useAuth()
  const userId = session!.user.id
  const [status, setStatus] = useState<Status>('loading')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [readyIds, setReadyIds] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: trail, error } = await supabase
      .from('trail_sessions')
      .select('id, status')
      .eq('match_id', matchId)
      .maybeSingle()
    if (error) {
      // A failed refresh keeps what is already on screen.
      setStatus((current) => (current === 'ready' ? current : 'error'))
      return
    }
    if (!trail) {
      setSessionId(null)
      setStarted(false)
      setReadyIds([])
      setStatus('ready')
      return
    }
    const { data: members, error: membersError } = await supabase
      .from('trail_members')
      .select('user_id, ready')
      .eq('session_id', trail.id)
    if (membersError) {
      setStatus((current) => (current === 'ready' ? current : 'error'))
      return
    }
    setSessionId(trail.id)
    setStarted(trail.status !== 'lobby')
    setReadyIds(members.filter((member) => member.ready).map((member) => member.user_id))
    setStatus('ready')
  }, [matchId])

  useEffect(() => {
    void load()
  }, [load])

  useResync(() => void load())

  // Row-level security limits these events to this person's own trail. Realtime only says something changed.
  useEffect(() => {
    const channel = supabase
      .channel(`lobby-${matchId}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trail_sessions' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trail_members' }, () => void load())
      .subscribe((subscription) => {
        // Fetch right after subscribing, so nothing that changed before the subscription is missed.
        if (subscription === 'SUBSCRIBED') void load()
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [matchId, load])

  // The phone shows the change only after the database has confirmed it.
  async function setReady(ready: boolean) {
    setPending(true)
    setMessage(null)
    const { data, error } = await supabase.rpc('set_trail_ready', { p_match_id: matchId, p_ready: ready })
    if (error) {
      setMessage('Could not save that. Check your connection and try again.')
    } else if (data?.[0]?.blocked) {
      setMessage('One of you is already on another trail, so this trail cannot start.')
    }
    await load()
    setPending(false)
  }

  return {
    status,
    sessionId,
    started,
    myReady: readyIds.includes(userId),
    readyIds,
    pending,
    message,
    setReady,
    reload: () => void load(),
  }
}
