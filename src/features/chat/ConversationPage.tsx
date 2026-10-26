import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { AlertIcon, BackIcon, ChevronIcon, SendIcon, WaveIcon } from '../../components/Icons'
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
          <BackIcon />
        </Link>
        <Avatar name={partnerName} className="avatar avatar--small" />
        <h1>{partnerName}</h1>
      </header>
      <Link to={`/chats/${matchId}/trail`} className="trail-panel">
        <span className="trail-panel__icon" aria-hidden="true">
          <WaveIcon />
        </span>
        <span className="trail-panel__text">
          <strong>Coastal trail</strong>
          <span>Open the trail lobby for you and {partnerName}</span>
        </span>
        <ChevronIcon />
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
        {saved.map((message, index) => {
          const own = message.sender_id === userId
          // Unconfirmed messages are always the user's own, so they continue a run of own messages.
          const nextSender = saved[index + 1]?.sender_id ?? (outgoing.length > 0 ? userId : undefined)
          return (
            <div key={message.id} className={own ? 'message message--own' : 'message'}>
              <div className={own ? 'bubble bubble--own' : 'bubble'}>
                <p>{message.body}</p>
              </div>
              {nextSender !== message.sender_id && (
                <span className="message__time">{formatTime(message.created_at)}</span>
              )}
            </div>
          )
        })}
        {outgoing.map((message) => (
          <div key={message.clientId} className="message message--own">
            <div className={`bubble bubble--own bubble--${message.status}`}>
              <p>{message.body}</p>
            </div>
            {message.status === 'failed' && (
              <button type="button" className="message__retry" onClick={() => retry(message.clientId)}>
                <AlertIcon />
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
        <button type="submit" className="send-button" aria-label="Send" disabled={!text.trim()}>
          <SendIcon />
        </button>
      </form>
    </div>
  )
}
