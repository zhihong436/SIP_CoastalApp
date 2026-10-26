import { useNavigate } from 'react-router-dom'
import { ProfileCard } from '../profiles/ProfileCard'
import { useDiscover } from './useDiscover'

export function DiscoverPage() {
  const { status, current, pending, decisionError, newMatch, closeMatch, decide, reload } = useDiscover()
  const navigate = useNavigate()

  return (
    <main className="screen screen--fill">
      {status === 'loading' && <p className="muted">Loading…</p>}
      {status === 'error' && (
        <div className="empty-state">
          <p role="alert">Could not load profiles. Check your connection and try again.</p>
          <button type="button" className="button button--primary" onClick={reload}>
            Try again
          </button>
        </div>
      )}
      {status === 'ready' && !current && (
        <div className="empty-state">
          <p>There is no one new to see right now.</p>
          <button type="button" className="button button--secondary" onClick={reload}>
            Check again
          </button>
        </div>
      )}
      {status === 'ready' && current && (
        <>
          <ProfileCard profile={current} />
          {decisionError && (
            <p className="form-message form-message--error" role="alert">
              {decisionError}
            </p>
          )}
          <div className="actions">
            <button
              type="button"
              className="button button--secondary"
              disabled={pending}
              onClick={() => void decide('pass')}
            >
              Pass
            </button>
            <button
              type="button"
              className="button button--primary"
              disabled={pending}
              onClick={() => void decide('like')}
            >
              Like
            </button>
          </div>
        </>
      )}
      {newMatch && (
        <div className="panel-backdrop">
          <section className="panel" role="dialog" aria-modal="true" aria-labelledby="match-title">
            <h2 id="match-title">It is a match</h2>
            <p>You and {newMatch.name} liked each other.</p>
            <div className="actions">
              <button type="button" className="button button--secondary" onClick={closeMatch}>
                Keep browsing
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => navigate(`/chats/${newMatch.matchId}`)}
              >
                Open chat
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
