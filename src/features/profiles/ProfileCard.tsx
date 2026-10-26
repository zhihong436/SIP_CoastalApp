import { avatarOf } from '../../components/Avatar'

export interface Profile {
  name: string
  age: number
  gender: string
  bio: string
}

interface ProfileCardProps {
  profile: Profile
  // 0 to 1, how visible the LIKE and PASS stamps are while the card is dragged.
  likeOpacity?: number
  passOpacity?: number
}

// Fills the space its parent gives it. Long bios scroll inside the card.
export function ProfileCard({ profile, likeOpacity = 0, passOpacity = 0 }: ProfileCardProps) {
  const { initials, gradient } = avatarOf(profile.name)
  return (
    <article className="card">
      <div className="card__hero" style={{ background: gradient }}>
        <span className="card__initials" aria-hidden="true">
          {initials}
        </span>
        <span className="card__stamp card__stamp--like" style={{ opacity: likeOpacity }} aria-hidden="true">
          LIKE
        </span>
        <span className="card__stamp card__stamp--pass" style={{ opacity: passOpacity }} aria-hidden="true">
          PASS
        </span>
        <div className="card__identity">
          <h2 className="card__name">
            {profile.name}, {profile.age}
          </h2>
          <span className="chip">{profile.gender}</span>
        </div>
      </div>
      <div className="card__body">
        <p className="label">About</p>
        <p className="card__bio">{profile.bio}</p>
      </div>
    </article>
  )
}
