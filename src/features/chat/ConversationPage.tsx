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
  const rootRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const canSend = text.trim().length > 0
  const outgoingState = outgoing.map((message) => message.status).join('|')

  // Start at the newest message, and follow new ones. Delivery states are included so
  // the failed retry control is not left below the composer after the row grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [saved.length, outgoing.length, outgoingState])

  // On iOS the layout viewport can stay full height behind the keyboard.
  // Shrinking the conversation to the visual viewport keeps the composer reachable.
  useEffect(() => {
    const viewport = window.visualViewport
    const root = rootRef.current
    if (!viewport || !root) return
    let frame = 0
    let lastHeight = viewport.height

    const syncKeyboard = () => {
      const inset = window.innerHeight - viewport.height
      // Android shrinks the layout viewport too, so the inset alone does not identify its keyboard.
      const shrankWithComposerFocused =
        lastHeight - viewport.height > 80 && document.activeElement?.id === 'conversation-message'
      lastHeight = viewport.height
      if (inset > 80) {
        root.style.setProperty('--conversation-height', `${Math.round(viewport.height)}px`)
      } else {
        root.style.removeProperty('--conversation-height')
      }
      if (inset > 80 || shrankWithComposerFocused) {
        window.cancelAnimationFrame(frame)
        frame = window.requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end' }))
      }
    }

    syncKeyboard()
    viewport.addEventListener('resize', syncKeyboard)
    return () => {
      viewport.removeEventListener('resize', syncKeyboard)
      window.cancelAnimationFrame(frame)
      root.style.removeProperty('--conversation-height')
    }
  }, [])

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
    <div className="focus conversation" ref={rootRef}>
      <header className="focus__header conversation__header">
        <Link to="/chats" className="back-link" aria-label="Back to Chats">
          <BackIcon />
        </Link>
        <Avatar name={partnerName} className="avatar avatar--conversation" background="var(--color-mist)" />
        <div className="conversation__identity">
          <span className="conversation__context">Your conversation</span>
          <h1 title={partnerName}>{partnerName}</h1>
        </div>
      </header>
      <Link to={`/chats/${matchId}/trail`} className="trail-panel conversation__trail">
        <span className="trail-panel__icon" aria-hidden="true">
          <WaveIcon size={20} />
        </span>
        <span className="trail-panel__text">
          <strong>Coastal trail</strong>
          <span>Open the trail lobby</span>
        </span>
        <ChevronIcon size={18} />
      </Link>
      <div className="messages" role="log" aria-label={`Conversation with ${partnerName}`}>
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
          <p className="muted">No messages yet. Say hello.</p>
        )}
        {saved.map((message, index) => {
          const own = message.sender_id === userId
          // Unconfirmed messages are always the user's own, so they continue a run of own messages.
          const nextSender = saved[index + 1]?.sender_id ?? (outgoing.length > 0 ? userId : undefined)
          const startsGroup = index === 0 || saved[index - 1].sender_id !== message.sender_id
          const endsGroup = nextSender !== message.sender_id
          const classes = [
            'message',
            own && 'message--own',
            startsGroup && 'message--group-start',
            endsGroup && 'message--group-end',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <div key={message.id} className={classes}>
              <div className={own ? 'bubble bubble--own' : 'bubble'}>
                <p>{message.body}</p>
              </div>
              {endsGroup && (
                <span className="message__meta">
                  <time className="message__time" dateTime={message.created_at}>
                    {formatTime(message.created_at)}
                  </time>
                </span>
              )}
            </div>
          )
        })}
        {outgoing.map((message, index) => {
          const startsGroup = index === 0 && saved.at(-1)?.sender_id !== userId
          const endsGroup = index === outgoing.length - 1
          const classes = [
            'message',
            'message--own',
            startsGroup && 'message--group-start',
            endsGroup && 'message--group-end',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <div key={message.clientId} className={classes}>
              <div className={`bubble bubble--own bubble--${message.status}`}>
                <p>{message.body}</p>
              </div>
              <span className="message__meta">
                {message.status === 'sending' && <span className="message__status">Sending…</span>}
                {message.status === 'failed' && (
                  <button type="button" className="message__retry" onClick={() => retry(message.clientId)}>
                    <AlertIcon />
                    Not sent. Tap to retry.
                  </button>
                )}
              </span>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={handleSubmit}>
        <div className="composer__row">
          <input
            id="conversation-message"
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            maxLength={2000}
            placeholder="Message"
            aria-label="Message"
            aria-describedby="composer-hint"
            enterKeyHint="send"
            autoComplete="off"
          />
          <button type="submit" className="send-button" aria-label="Send message" disabled={!canSend}>
            <SendIcon />
          </button>
        </div>
        <p className="composer__hint" id="composer-hint">
          {canSend ? 'Press Enter to send.' : 'Write a message to send.'}
        </p>
      </form>
    </div>
  )
}
