import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useResync } from '../../lib/useResync'

export interface ConversationRow {
  match_id: string
  partner_name: string
  matched_at: string
  last_body: string | null
  last_at: string | null
}

type Status = 'loading' | 'ready' | 'error'

export function useConversations() {
  const [status, setStatus] = useState<Status>('loading')
  const [rows, setRows] = useState<ConversationRow[]>([])

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_conversations')
    if (error) {
      // A failed refresh keeps what is already on screen.
      setStatus((current) => (current === 'ready' ? current : 'error'))
      return
    }
    setRows(data)
    setStatus('ready')
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useResync(() => void load())

  // A new match or message changes this list. Realtime only sends rows the user may read.
  useEffect(() => {
    const channel = supabase
      .channel(`conversations-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, () => void load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => void load())
      .subscribe((subscription) => {
        if (subscription === 'SUBSCRIBED') void load()
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load])

  return { status, rows, reload: () => void load() }
}
