import { useRef } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { ProfileLoadError } from '../features/profiles/ProfileSetupPage'
import { ProfileProvider, useOwnProfile } from '../features/profiles/ProfileProvider'

// Guards only prevent accidental access. The database policies are the real boundary.

// Everything signed in. Keyed by user id, so switching accounts discards the previous person's state.
export function RequireSignIn() {
  const { session, loading } = useAuth()
  const location = useLocation()
  // Someone who signs out should not be sent back to the page they left when the next person signs in.
  const hadSession = useRef(false)
  if (session) hadSession.current = true
  if (loading) return <p className="screen muted">Loading…</p>
  if (!session) {
    // Sign-in returns to the page that sent the person here, such as a card link.
    const from = hadSession.current ? undefined : location.pathname + location.search
    return <Navigate to="/sign-in" replace state={{ from }} />
  }
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
