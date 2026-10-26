import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useResync } from '../../lib/useResync'
import { useAuth } from '../auth/AuthProvider'

export interface ServerMessage {
  id: string
  sender_id: string
  client_message_id: string
  body: string
  created_at: string
}

// A message this phone has sent but the server has not confirmed.
export interface OutgoingMessage {
  clientId: string
  body: string
  status: 'sending' | 'failed'
}

type Status = 'loading' | 'ready' | 'error'

const columns = 'id, sender_id, client_message_id, body, created_at'

function byTimeThenId(a: ServerMessage, b: ServerMessage) {
  return Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id)
}

export function useConversation(matchId: string) {
  const { session } = useAuth()
  const userId = session!.user.id
  const [status, setStatus] = useState<Status>('loading')
  const [saved, setSaved] = useState<ServerMessage[]>([])
  const [outgoing, setOutgoing] = useState<OutgoingMessage[]>([])

  // Adds confirmed messages without duplicates and drops any outgoing copy they replace.
  const merge = useCallback(
    (incoming: ServerMessage[]) => {
      setSaved((current) => {
        const byId = new Map(current.map((message) => [message.id, message]))
        for (const message of incoming) byId.set(message.id, message)
        return [...byId.values()].sort(byTimeThenId)
      })
      setOutgoing((current) =>
        current.filter(
          (item) => !incoming.some((m) => m.sender_id === userId && m.client_message_id === item.clientId),
        ),
      )
    },
    [userId],
  )

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select(columns)
      .eq('match_id', matchId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(50)
    if (error) {
      // A failed refresh keeps what is already on screen.
      setStatus((current) => (current === 'ready' ? current : 'error'))
      return
    }
    merge(data)
    setStatus('ready')
  }, [matchId, merge])

  useEffect(() => {
    void load()
  }, [load])

  useResync(() => void load())

  useEffect(() => {
    const channel = supabase
      .channel(`messages-${matchId}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        (payload) => merge([payload.new as ServerMessage]),
      )
      .subscribe((subscription) => {
        // Fetch right after subscribing, so nothing sent before the subscription is missed.
        if (subscription === 'SUBSCRIBED') void load()
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [matchId, load, merge])

  function setOutgoingStatus(clientId: string, next: OutgoingMessage['status']) {
    setOutgoing((current) => current.map((item) => (item.clientId === clientId ? { ...item, status: next } : item)))
  }

  // Safe to repeat with the same client id: the server keeps one message per sender and id.
  async function deliver(clientId: string, body: string) {
    const { error } = await supabase
      .from('messages')
      .upsert(
        { match_id: matchId, client_message_id: clientId, body },
        { onConflict: 'sender_id,client_message_id', ignoreDuplicates: true },
      )
    if (!error) {
      const { data } = await supabase
        .from('messages')
        .select(columns)
        .eq('sender_id', userId)
        .eq('client_message_id', clientId)
        .maybeSingle()
      if (data) {
        merge([data])
        return
      }
    }
    // Delivery is only shown once the server has the message.
    setOutgoingStatus(clientId, 'failed')
  }

  function send(body: string) {
    const clientId = crypto.randomUUID()
    setOutgoing((current) => [...current, { clientId, body, status: 'sending' }])
    void deliver(clientId, body)
  }

  function retry(clientId: string) {
    const item = outgoing.find((candidate) => candidate.clientId === clientId)
    if (!item || item.status !== 'failed') return
    setOutgoingStatus(clientId, 'sending')
    void deliver(clientId, item.body)
  }

  return { status, saved, outgoing, send, retry, reload: () => void load() }
}
