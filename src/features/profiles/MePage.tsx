import { useState } from 'react'
import { Avatar } from '../../components/Avatar'
import { PencilIcon } from '../../components/Icons'
import { useAuth } from '../auth/AuthProvider'
import { ProfileForm } from './ProfileForm'
import { useOwnProfile } from './ProfileProvider'

export function MePage() {
  const { signOut } = useAuth()
  const { profile, save } = useOwnProfile()
  const [editing, setEditing] = useState(false)

  // The profile guard guarantees a profile on this route.
  if (!profile) return null

  if (editing) {
    return (
      <main className="screen">
        <h1 className="page-title">Edit profile</h1>
        <ProfileForm
          initial={profile}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSave={async (values) => {
            const message = await save(values)
            if (!message) setEditing(false)
            return message
          }}
        />
      </main>
    )
  }

  return (
    <main className="screen">
      <h1 className="page-title">Me</h1>
      <section className="block block--profile">
        <Avatar name={profile.name} className="avatar avatar--profile" />
        <h2 className="block__name">
          {profile.name}, {profile.age}
        </h2>
      </section>
      <section className="block">
        <h2 className="label">About me</h2>
        <p className="block__text">{profile.bio}</p>
      </section>
      <section className="block block--rows">
        <h2 className="label">Basics</h2>
        <dl className="rows">
          <div className="rows__item">
            <dt>Age</dt>
            <dd>{profile.age}</dd>
          </div>
          <div className="rows__item">
            <dt>Gender</dt>
            <dd>{profile.gender}</dd>
          </div>
        </dl>
      </section>
      <button type="button" className="button button--secondary button--with-icon" onClick={() => setEditing(true)}>
        <PencilIcon />
        Edit profile
      </button>
      <button type="button" className="text-button" onClick={() => void signOut()}>
        Sign out
      </button>
    </main>
  )
}
