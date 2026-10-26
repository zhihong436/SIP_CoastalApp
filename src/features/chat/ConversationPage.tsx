import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { getDraft, setDraft } from './drafts'
import { formatTime } from './formatTime'
import { useConversation } from './useConversation'
import { useMatch } from './useMatch'

export function ConversationPage() {
  const { matchId = '' } = useParams()
  const match = useMatch(matchId)

  if (match.status === 'loading') return <p className="screen muted">Loading…</p>
  if (match.status === 'error') {
    return (
      <main className="screen screen--centered">
        <p role="alert">Could not load this conversation. Check your connection and try again.</p>
        <Link to="/chats">Back to Chats</Link>
      </main>
    )
  }
  if (match.status === 'not_found') {
    return (
      <main className="screen screen--centered">
        <p>This conversation does not exist.</p>
        <Link to="/chats">Back to Chats</Link>
      </main>
    )
  }
  return <Conversation matchId={matchId} partnerName={match.partner.name} />
}

function Conversation({ matchId, partnerName }: { matchId: string; partnerName: string }) {
  const { session } = useAuth()
  const userId = session!.user.id
  const { status, saved, outgoing, send, retry, reload } = useConversation(matchId)
  const [text, setText] = useState(() => getDraft(matchId))
  const endRef = useRef<HTMLDivElement>(null)

  // Start at the newest message, and follow new ones.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [saved.length, outgoing.length])

  function handleChange(value: string) {
    setText(value)
    setDraft(matchId, value)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const body = text.trim()
    if (!body) return
    send(body)
    handleChange('')
  }

  return (
    <div className="focus">
      <header className="focus__header">
        <Link to="/chats" className="back-link" aria-label="Back to Chats">
          ←
        </Link>
        <h1>{partnerName}</h1>
      </header>
      <Link to={`/chats/${matchId}/trail`} className="trail-panel">
        <strong>Coastal trail</strong>
        <span>Open the trail lobby for you and {partnerName}</span>
      </Link>
      <div className="messages" role="log">
        {status === 'loading' && <p className="muted">Loading…</p>}
        {status === 'error' && (
          <div className="empty-state">
            <p role="alert">Could not load messages. Check your connection and try again.</p>
            <button type="button" className="button button--primary" onClick={reload}>
              Try again
            </button>
          </div>
        )}
        {status === 'ready' && saved.length === 0 && outgoing.length === 0 && (
          <p className="muted">No messages yet. Say hello to {partnerName}.</p>
        )}
        {saved.map((message) => (
          <div key={message.id} className={message.sender_id === userId ? 'bubble bubble--own' : 'bubble'}>
            <p>{message.body}</p>
            <span className="bubble__time">{formatTime(message.created_at)}</span>
          </div>
        ))}
        {outgoing.map((message) => (
          <div
            key={message.clientId}
            className={message.status === 'sending' ? 'bubble bubble--own bubble--sending' : 'bubble bubble--own'}
          >
            <p>{message.body}</p>
            {message.status === 'failed' && (
              <button type="button" className="bubble__retry" onClick={() => retry(message.clientId)}>
                Not sent. Tap to retry.
              </button>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={handleSubmit}>
        <input
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          maxLength={2000}
          placeholder="Message"
          aria-label="Message"
        />
        <button type="submit" className="button button--primary" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
