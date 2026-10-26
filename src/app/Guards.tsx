import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { ProfileLoadError } from '../features/profiles/ProfileSetupPage'
import { ProfileProvider, useOwnProfile } from '../features/profiles/ProfileProvider'

// Guards only prevent accidental access. The database policies are the real boundary.

// Everything signed in. Keyed by user id, so switching accounts discards the previous person's state.
export function RequireSignIn() {
  const { session, loading } = useAuth()
  if (loading) return <p className="screen muted">Loading…</p>
  if (!session) return <Navigate to="/sign-in" replace />
  return (
    <ProfileProvider key={session.user.id}>
      <Outlet />
    </ProfileProvider>
  )
}

// Everything that needs a saved profile.
export function RequireProfile() {
  const { profile, status, reload } = useOwnProfile()
  if (status === 'loading') return <p className="screen muted">Loading…</p>
  if (status === 'error') return <ProfileLoadError onRetry={reload} />
  if (!profile) return <Navigate to="/profile/setup" replace />
  return <Outlet />
}
