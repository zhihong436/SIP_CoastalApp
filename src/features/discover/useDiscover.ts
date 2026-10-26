import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import type { Profile } from '../profiles/ProfileCard'

export interface Candidate extends Profile {
  user_id: string
}

export interface NewMatch {
  matchId: string
  name: string
}

type Status = 'loading' | 'ready' | 'error'

function shuffle<T>(items: T[]) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// The tester pool is tiny, so the whole queue is loaded once in random order.
export function useDiscover() {
  const { session } = useAuth()
  const userId = session!.user.id
  const [status, setStatus] = useState<Status>('loading')
  const [queue, setQueue] = useState<Candidate[]>([])
  const [pending, setPending] = useState(false)
  const [decisionError, setDecisionError] = useState('')
  const [newMatch, setNewMatch] = useState<NewMatch | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    const [profiles, decisions] = await Promise.all([
      supabase.from('profiles').select('user_id, name, age, gender, bio').neq('user_id', userId),
      supabase.from('profile_decisions').select('target_id').eq('actor_id', userId),
    ])
    if (profiles.error || decisions.error) {
      setStatus('error')
      return
    }
    const decided = new Set(decisions.data.map((row) => row.target_id))
    setQueue(shuffle(profiles.data.filter((candidate) => !decided.has(candidate.user_id))))
    setStatus('ready')
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  async function decide(decision: 'like' | 'pass') {
    const candidate = queue[0]
    if (!candidate || pending) return
    setPending(true)
    setDecisionError('')
    const { data, error } = await supabase.rpc('submit_decision', {
      p_target: candidate.user_id,
      p_decision: decision,
    })
    setPending(false)
    // Without a confirmed decision the same card stays, so the person can retry.
    if (error || !data?.[0]) {
      setDecisionError('That did not go through. Check your connection and try again.')
      return
    }
    setQueue((current) => current.slice(1))
    if (data[0].new_match_id) setNewMatch({ matchId: data[0].new_match_id, name: candidate.name })
  }

  return {
    status,
    current: queue[0] ?? null,
    pending,
    decisionError,
    newMatch,
    closeMatch: () => setNewMatch(null),
    decide,
    reload: load,
  }
}
