export interface Profile {
  name: string
  age: number
  gender: string
  bio: string
}

function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? '')
    .join('')
}

// Fills the space its parent gives it. Long bios scroll inside the card body.
export function ProfileCard({ profile }: { profile: Profile }) {
  return (
    <article className="card">
      <div className="card__initials" aria-hidden="true">
        {initialsOf(profile.name)}
      </div>
      <div className="card__body">
        <h1 className="card__name">
          {profile.name}, {profile.age}
        </h1>
        <p className="card__meta">{profile.gender}</p>
        <p className="card__bio">{profile.bio}</p>
      </div>
    </article>
  )
}
