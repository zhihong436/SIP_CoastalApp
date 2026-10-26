import { Link } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { ChatsIcon } from '../../components/Icons'
import { formatTimeOrDate } from './formatTime'
import { useConversations } from './useConversations'

export function ChatsPage() {
  const { status, rows, reload } = useConversations()

  return (
    <main className="screen">
      <h1 className="page-title">Chats</h1>
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
        <div className="empty-state">
          <span className="empty-state__icon">
            <ChatsIcon size={40} />
          </span>
          <p className="muted">
            No matches yet. Find someone on <Link to="/discover">Discover</Link>.
          </p>
        </div>
      )}
      {status === 'ready' && rows.length > 0 && (
        <ul className="chat-list">
          {rows.map((row) => (
            <li key={row.match_id}>
              <Link to={`/chats/${row.match_id}`} className="chat-row">
                <Avatar name={row.partner_name} className="avatar avatar--row" />
                <span className="chat-row__text">
                  <strong className="chat-row__name">{row.partner_name}</strong>
                  <span className="chat-row__preview">{row.last_body ?? 'You matched. Say hello.'}</span>
                </span>
                <span className="chat-row__time">{formatTimeOrDate(row.last_at ?? row.matched_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
