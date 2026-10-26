import { Link, Navigate, useParams } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { BackIcon, WaveIcon } from '../../components/Icons'
import { useMatch, type Partner } from '../chat/useMatch'
import { useOwnProfile } from '../profiles/ProfileProvider'
import { useLobby } from './useLobby'

export function LobbyPage() {
  const { matchId = '' } = useParams()
  const match = useMatch(matchId)

  if (match.status === 'loading') return <p className="screen muted">Loading…</p>
  if (match.status !== 'ready') {
    return (
      <main className="screen screen--centered">
        <p role={match.status === 'error' ? 'alert' : undefined}>
          {match.status === 'error'
            ? 'Could not load the trail lobby. Check your connection and try again.'
            : 'This trail lobby does not exist.'}
        </p>
        <Link to="/chats">Back to Chats</Link>
      </main>
    )
  }
  return <Lobby matchId={matchId} partner={match.partner} />
}

function Lobby({ matchId, partner }: { matchId: string; partner: Partner }) {
  const { profile } = useOwnProfile()
  const lobby = useLobby(matchId)

  // A trail that has started takes both people straight to their stop.
  if (lobby.status === 'ready' && lobby.started && lobby.sessionId) {
    return <Navigate to={`/trail/${lobby.sessionId}`} replace />
  }

  const partnerReady = lobby.readyIds.includes(partner.id)

  return (
    <div className="focus">
      <header className="focus__header">
        <Link to={`/chats/${matchId}`} className="back-link" aria-label="Back to the conversation">
          <BackIcon />
        </Link>
        <h1>Trail lobby</h1>
      </header>
      <main className="screen lobby">
        <section className="block lobby__intro">
          <span className="lobby__icon" aria-hidden="true">
            <WaveIcon size={32} />
          </span>
          <p className="lobby__pair">
            {profile?.name} and {partner.name}
          </p>
          <h2>Coastal Mystery</h2>
          {/* Placeholder until the story exists. */}
          <p>
            Together you will follow a short trail along the coast, solve a few puzzles that need both of you and
            uncover what is hidden there.
          </p>
        </section>

        {lobby.status === 'loading' && <p className="muted">Loading…</p>}
        {lobby.status === 'error' && (
          <div className="empty-state">
            <p role="alert">Could not load the lobby. Check your connection and try again.</p>
            <button type="button" className="button button--primary" onClick={lobby.reload}>
              Try again
            </button>
          </div>
        )}
        {lobby.status === 'ready' && (
          <>
            <section className="block">
              <p className="label">Ready to start</p>
              <ul className="ready-list">
                <ReadyRow name={profile?.name ?? 'You'} isYou ready={lobby.myReady} />
                <ReadyRow name={partner.name} ready={partnerReady} />
              </ul>
              <p className="muted small">
                {lobby.myReady && !partnerReady
                  ? `Waiting for ${partner.name} to be ready. The trail starts as soon as you both are.`
                  : 'The trail starts as soon as you both are ready. You can change your mind until then.'}
              </p>
            </section>
            {lobby.message && (
              <p className="form-message form-message--error" role="alert">
                {lobby.message}
              </p>
            )}
            <button
              type="button"
              className={`button button--full ${lobby.myReady ? 'button--secondary' : 'button--primary'}`}
              disabled={lobby.pending}
              onClick={() => void lobby.setReady(!lobby.myReady)}
            >
              {lobby.pending ? 'Saving…' : lobby.myReady ? 'Not ready' : 'Ready'}
            </button>
          </>
        )}
      </main>
    </div>
  )
}

function ReadyRow({ name, isYou, ready }: { name: string; isYou?: boolean; ready: boolean }) {
  return (
    <li className="ready-list__row">
      <Avatar name={name} className="avatar avatar--small" />
      <span className="ready-list__name">{isYou ? `${name} (you)` : name}</span>
      <span className={ready ? 'ready-list__status ready-list__status--ready' : 'ready-list__status'}>
        {ready ? 'Ready' : 'Not ready'}
      </span>
    </li>
  )
}
