import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

export interface Partner {
  id: string
  name: string
}

// Not found covers a match that does not exist and one the caller does not belong to.
type MatchState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'not_found' }
  | { status: 'ready'; partner: Partner }

// Reads a match the caller belongs to and the other member's name.
export function useMatch(matchId: string) {
  const { session } = useAuth()
  const userId = session!.user.id
  const [state, setState] = useState<MatchState>({ status: 'loading' })

  const load = useCallback(async () => {
    const { data: match, error } = await supabase
      .from('matches')
      .select('participant_a, participant_b')
      .eq('id', matchId)
      .maybeSingle()
    // 22P02 means the URL did not hold a valid id.
    if (error) {
      setState({ status: error.code === '22P02' ? 'not_found' : 'error' })
      return
    }
    if (!match) {
      setState({ status: 'not_found' })
      return
    }
    const partnerId = match.participant_a === userId ? match.participant_b : match.participant_a
    const { data: partner, error: partnerError } = await supabase
      .from('profiles')
      .select('name')
      .eq('user_id', partnerId)
      .maybeSingle()
    if (partnerError || !partner) {
      setState({ status: 'error' })
      return
    }
    setState({ status: 'ready', partner: { id: partnerId, name: partner.name } })
  }, [matchId, userId])

  useEffect(() => {
    void load()
  }, [load])

  return state
}
