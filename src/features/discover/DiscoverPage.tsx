import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { CrossIcon, DiscoverIcon, HeartIcon } from '../../components/Icons'
import { ProfileCard } from '../profiles/ProfileCard'
import { useOwnProfile } from '../profiles/ProfileProvider'
import { useDiscover, type Candidate } from './useDiscover'

type Direction = 'like' | 'pass'

const FLY_DISTANCE = 560
const FULL_STAMP_DISTANCE = 120
const FLY_DURATION = 260

// Swipe is presentation only. The card follows the finger, then useDiscover saves the decision.
export function DiscoverPage() {
  const { status, current, next, pending, decisionError, newMatch, closeMatch, decide, reload } = useDiscover()
  const { profile: ownProfile } = useOwnProfile()
  const navigate = useNavigate()

  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  // The card being decided stays on top until it has flown off or sprung back.
  const [departing, setDeparting] = useState<{ candidate: Candidate; direction: Direction } | null>(null)
  const [instant, setInstant] = useState(false)
  const startX = useRef(0)
  const cardWidth = useRef(0)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // Once the decision is no longer pending, the queue having moved on means it saved.
  useEffect(() => {
    if (!departing || pending) return
    if (current?.user_id === departing.candidate.user_id) {
      setDeparting(null)
      setDx(0)
      return
    }
    function finish() {
      // The next card takes the top spot without sliding.
      setInstant(true)
      setDeparting(null)
      setDx(0)
      requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)))
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish()
      return
    }
    setDx(departing.direction === 'like' ? FLY_DISTANCE : -FLY_DISTANCE)
    timer.current = window.setTimeout(finish, FLY_DURATION)
  }, [departing, pending, current])

  function startDecision(direction: Direction) {
    if (!current || pending || departing) return
    setDragging(false)
    setDeparting({ candidate: current, direction })
    void decide(direction)
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (pending || departing || event.button > 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    startX.current = event.clientX
    cardWidth.current = event.currentTarget.offsetWidth
    setDragging(true)
    setDx(0)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragging) setDx(event.clientX - startX.current)
  }

  function onPointerUp() {
    if (!dragging) return
    setDragging(false)
    if (Math.abs(dx) > cardWidth.current / 3) startDecision(dx > 0 ? 'like' : 'pass')
    else setDx(0)
  }

  function onPointerCancel() {
    setDragging(false)
    setDx(0)
  }

  const top = departing?.candidate ?? current
  // After a save the queue has moved on, so `current` is the card waiting behind the departing one.
  const decided = departing && current?.user_id !== departing.candidate.user_id
  const underneath = decided ? current : next
  const progress = Math.min(Math.abs(dx) / FULL_STAMP_DISTANCE, 1)
  const transition = dragging || instant ? 'none' : 'transform var(--swipe-duration) ease'
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
                  transform: `scale(${0.95 + 0.05 * progress}) translateY(${12 - 12 * progress}px)`,
                  transition,
                }}
              >
                <ProfileCard profile={underneath} />
              </div>
            )}
            <div
              key={top.user_id}
              className="deck__card deck__card--top"
              style={{ transform: `translateX(${dx}px) rotate(${dx / 18}deg)`, transition }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
            >
              <ProfileCard
                profile={top}
                likeOpacity={Math.max(0, Math.min(dx / FULL_STAMP_DISTANCE, 1))}
                passOpacity={Math.max(0, Math.min(-dx / FULL_STAMP_DISTANCE, 1))}
              />
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
