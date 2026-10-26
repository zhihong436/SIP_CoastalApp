import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { CrossIcon, DiscoverIcon, HeartIcon } from '../../components/Icons'
import { ProfileCard } from '../profiles/ProfileCard'
import { useOwnProfile } from '../profiles/ProfileProvider'
import { useDiscover, type Candidate } from './useDiscover'

type Direction = 'like' | 'pass'

const FLY_DISTANCE = 560
const FLY_DURATION = 260

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// The fly-off is presentation only. useDiscover saves the decision and moves the queue on.
export function DiscoverPage() {
  const { status, current, next, pending, decisionError, newMatch, closeMatch, decide, reload } = useDiscover()
  const { profile: ownProfile } = useOwnProfile()
  const navigate = useNavigate()

  // The card being decided flies off at once. It stays mounted until the save is known, so a failure can bring it back.
  const [departing, setDeparting] = useState<{ candidate: Candidate; direction: Direction } | null>(null)
  const [flyDone, setFlyDone] = useState(false)
  const [instant, setInstant] = useState(false)
  const flyTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(flyTimer.current), [])

  // Once the decision is no longer pending, the queue having moved on means it saved.
  useEffect(() => {
    if (!departing || pending) return
    if (current?.user_id === departing.candidate.user_id) {
      window.clearTimeout(flyTimer.current)
      setDeparting(null)
      return
    }
    if (!flyDone) return
    // The next card takes the top spot without sliding.
    setInstant(true)
    setDeparting(null)
    requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)))
  }, [departing, pending, current, flyDone])

  function startDecision(direction: Direction) {
    if (!current || pending || departing) return
    setDeparting({ candidate: current, direction })
    setFlyDone(false)
    flyTimer.current = window.setTimeout(() => setFlyDone(true), prefersReducedMotion() ? 0 : FLY_DURATION)
    void decide(direction)
  }

  const top = departing?.candidate ?? current
  // After a save the queue has moved on, so `current` is the card waiting behind the departing one.
  const saved = departing && current?.user_id !== departing.candidate.user_id
  const underneath = saved ? current : next
  const flyX = departing ? (departing.direction === 'like' ? FLY_DISTANCE : -FLY_DISTANCE) : 0
  const transition = instant || prefersReducedMotion() ? 'none' : 'transform var(--swipe-duration) ease'
  const busy = pending || !!departing

  return (
    <main className="discover">
      <h1 className="screen-title">Discover</h1>
      {status === 'loading' && <p className="muted discover__message">Loading…</p>}
      {status === 'error' && (
        <div className="empty-state">
          <p role="alert">Could not load profiles. Check your connection and try again.</p>
          <button type="button" className="button button--primary" onClick={reload}>
            Try again
          </button>
        </div>
      )}
      {status === 'ready' && !top && (
        <div className="empty-state">
          <span className="empty-state__icon">
            <DiscoverIcon size={40} />
          </span>
          <p className="empty-state__title">You&rsquo;re all caught up</p>
          <p className="muted">There is no one new to see right now.</p>
          <button type="button" className="button button--secondary" onClick={reload}>
            Check again
          </button>
        </div>
      )}
      {status === 'ready' && top && (
        <>
          <div className="deck">
            {underneath && (
              <div
                key={underneath.user_id}
                className="deck__card"
                style={{
                  transform: departing ? 'none' : 'scale(0.95) translateY(12px)',
                  transition,
                }}
              >
                <ProfileCard profile={underneath} />
              </div>
            )}
            <div
              key={top.user_id}
              className="deck__card"
              style={{ transform: `translateX(${flyX}px) rotate(${flyX / 18}deg)`, transition }}
            >
              <ProfileCard profile={top} />
            </div>
          </div>
          {decisionError && (
            <p className="form-message form-message--error discover__error" role="alert">
              {decisionError}
            </p>
          )}
          <div className="round-actions">
            <button
              type="button"
              className="round-button round-button--pass"
              aria-label="Pass"
              disabled={busy}
              onClick={() => startDecision('pass')}
            >
              <CrossIcon />
            </button>
            <button
              type="button"
              className="round-button round-button--like"
              aria-label="Like"
              disabled={busy}
              onClick={() => startDecision('like')}
            >
              <HeartIcon />
            </button>
          </div>
        </>
      )}
      {newMatch && (
        <div className="panel-backdrop">
          <section className="panel" role="dialog" aria-modal="true" aria-labelledby="match-title">
            <div className="panel__avatars">
              <Avatar name={ownProfile?.name ?? ''} className="avatar avatar--large avatar--tilt-left" />
              <Avatar name={newMatch.name} className="avatar avatar--large avatar--tilt-right" />
            </div>
            <h2 id="match-title">It&rsquo;s a match!</h2>
            <p className="muted">You and {newMatch.name} liked each other.</p>
            <button
              type="button"
              className="button button--primary button--full"
              onClick={() => navigate(`/chats/${newMatch.matchId}`)}
            >
              Open chat
            </button>
            <button type="button" className="button button--secondary button--full" onClick={closeMatch}>
              Keep browsing
            </button>
          </section>
        </div>
      )}
    </main>
  )
}
