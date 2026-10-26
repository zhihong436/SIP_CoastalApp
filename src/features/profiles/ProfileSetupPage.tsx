import { Navigate, useNavigate } from 'react-router-dom'
import { ProfileForm } from './ProfileForm'
import { useOwnProfile } from './ProfileProvider'

export function ProfileSetupPage() {
  const { profile, status, reload, save } = useOwnProfile()
  const navigate = useNavigate()

  if (status === 'loading') return <p className="screen muted">Loading…</p>
  if (status === 'error') return <ProfileLoadError onRetry={reload} />
  if (profile) return <Navigate to="/discover" replace />

  return (
    <main className="screen">
      <h1>Create your profile</h1>
      <p className="muted">Other testers will see these four details.</p>
      <ProfileForm
        submitLabel="Save profile"
        onSave={async (values) => {
          const message = await save(values)
          if (!message) navigate('/discover', { replace: true })
          return message
        }}
      />
    </main>
  )
}

export function ProfileLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="screen screen--centered">
      <p role="alert">Could not load your profile. Check your connection and try again.</p>
      <button type="button" className="button button--primary" onClick={onRetry}>
        Try again
      </button>
    </main>
  )
}
