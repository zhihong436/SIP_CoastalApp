import { useEffect, useRef, useState } from 'react'
import { avatarOf } from '../../components/Avatar'
import { CoastalPortraitArt } from '../../components/CoastalArt'

export interface Profile {
  name: string
  age: number
  gender: string
  bio: string
}

// The app has no photo source yet. A genuine URL can be passed in presentation-only;
// the quiet initials panel stays as the fallback when it is absent or fails.
export function ProfileCard({ profile, photoUrl }: { profile: Profile; photoUrl?: string }) {
  // A missing name still needs a readable identity and meaningful image alt text.
  const validName = profile.name.trim()
  const displayName = validName || 'Anonymous'
  const { initials } = avatarOf(validName)
  const photo = photoUrl?.trim() || null
  const [photoFailed, setPhotoFailed] = useState(false)
  const lastPhoto = useRef(photo)
  const lastName = useRef(profile.name)
  const bioScroll = useRef<HTMLDivElement>(null)
  const [bioScrollable, setBioScrollable] = useState(false)
  const [bioAtEnd, setBioAtEnd] = useState(false)
  const hasBio = profile.bio.trim().length > 0

  // A new photo source or person starts fresh, so an earlier broken image cannot hide it.
  // The refs skip the first render, when there is nothing stale to clear.
  useEffect(() => {
    if (lastPhoto.current === photo && lastName.current === profile.name) return
    lastPhoto.current = photo
    lastName.current = profile.name
    setPhotoFailed(false)
  }, [photo, profile.name])

  // Only put the bio in the tab order when it actually overflows, so a short About is not a dead stop.
  useEffect(() => {
    const node = bioScroll.current
    if (!node) {
      setBioScrollable(false)
      return
    }
    const update = () => {
      const scrollable = node.scrollHeight > node.clientHeight + 1
      setBioScrollable(scrollable)
      setBioAtEnd(!scrollable || node.scrollTop + node.clientHeight >= node.scrollHeight - 2)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    node.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      node.removeEventListener('scroll', update)
    }
  }, [hasBio, profile.bio])

  const shownPhoto = photo && !photoFailed ? photo : null

  return (
    <article className={`card ${shownPhoto ? 'card--photo' : 'card--fallback'}`}>
      <div className="card__hero">
        <div className="card__hero-art">
          {shownPhoto ? (
            <img
              key={shownPhoto}
              className="card__photo"
              src={shownPhoto}
              alt={`Photo of ${displayName}`}
              draggable={false}
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <>
              <CoastalPortraitArt />
              <span className="card__portrait-initials" aria-hidden="true">
                {initials || '?'}
              </span>
            </>
          )}
        </div>
        <div className="card__identity">
          <h2 className="card__name">
            {displayName}
            <span className="card__age">, {profile.age}</span>
          </h2>
          <p className="card__meta">
            <span className="card__gender">{profile.gender}</span>
          </p>
        </div>
      </div>
      {hasBio && (
        <div className="card__details">
          <p className="label card__label">About</p>
          <div className={`card__bio-frame${bioScrollable && !bioAtEnd ? ' card__bio-frame--more' : ''}`}>
            <div
              ref={bioScroll}
              className="card__bio-scroll"
              tabIndex={bioScrollable ? 0 : undefined}
              role={bioScrollable ? 'region' : undefined}
              aria-label={bioScrollable ? `About ${displayName}` : undefined}
            >
              <p className="card__bio">{profile.bio}</p>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}
