import { useState } from 'react'
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
        <h1>Edit profile</h1>
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
      <h1>Me</h1>
      <dl className="details">
        <dt>Name</dt>
        <dd>{profile.name}</dd>
        <dt>Age</dt>
        <dd>{profile.age}</dd>
        <dt>Gender</dt>
        <dd>{profile.gender}</dd>
        <dt>Bio</dt>
        <dd>{profile.bio}</dd>
      </dl>
      <div className="actions">
        <button type="button" className="button button--secondary" onClick={() => setEditing(true)}>
          Edit profile
        </button>
        <button type="button" className="button button--secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </main>
  )
}
