import { Link, useParams } from 'react-router-dom'
import { useMatch } from '../chat/useMatch'
import { useOwnProfile } from '../profiles/ProfileProvider'

export function LobbyPage() {
  const { matchId = '' } = useParams()
  const match = useMatch(matchId)
  const { profile } = useOwnProfile()

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

  return (
    <div className="focus">
      <header className="focus__header">
        <Link to={`/chats/${matchId}`} className="back-link" aria-label="Back to the conversation">
          ←
        </Link>
        <h1>Trail lobby</h1>
      </header>
      <main className="screen lobby">
        <p className="lobby__pair">
          {profile?.name} and {match.partner.name}
        </p>
        <h2>Coastal Mystery</h2>
        {/* Placeholder until the story exists. */}
        <p>
          Together you will follow a short trail along the coast, solve a few puzzles that need both of you and
          uncover what is hidden there.
        </p>
        <p className="notice" role="note">
          The trail game is not available yet. Check back soon.
        </p>
      </main>
    </div>
  )
}
