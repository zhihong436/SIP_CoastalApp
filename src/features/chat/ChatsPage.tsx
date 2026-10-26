import { Link } from 'react-router-dom'
import { formatTimeOrDate } from './formatTime'
import { useConversations } from './useConversations'

export function ChatsPage() {
  const { status, rows, reload } = useConversations()

  return (
    <main className="screen">
      <h1>Chats</h1>
      {status === 'loading' && <p className="muted">Loading…</p>}
      {status === 'error' && (
        <div className="empty-state">
          <p role="alert">Could not load your chats. Check your connection and try again.</p>
          <button type="button" className="button button--primary" onClick={reload}>
            Try again
          </button>
        </div>
      )}
      {status === 'ready' && rows.length === 0 && (
        <p className="muted">
          No matches yet. Find someone on <Link to="/discover">Discover</Link>.
        </p>
      )}
      {status === 'ready' && rows.length > 0 && (
        <ul className="chat-list">
          {rows.map((row) => (
            <li key={row.match_id}>
              <Link to={`/chats/${row.match_id}`} className="chat-row">
                <span className="chat-row__top">
                  <strong>{row.partner_name}</strong>
                  <span className="muted small">{formatTimeOrDate(row.last_at ?? row.matched_at)}</span>
                </span>
                <span className="chat-row__preview">{row.last_body ?? 'You matched. Say hello.'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
