import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'

export function SignInPage() {
  const { session, loading } = useAuth()
  const location = useLocation()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  if (loading) return <p className="screen muted">Loading…</p>
  // Signed-in users go back to the page that sent them here, or to Discover. The profile guard sends anyone
  // without a profile to setup.
  const from = (location.state as { from?: string } | null)?.from
  if (session) return <Navigate to={from ?? '/discover'} replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: String(form.get('email')).trim(),
      password: String(form.get('password')),
    })
    if (signInError) {
      // One general message, so the screen never reveals which field was wrong.
      setError(
        isAuthRetryableFetchError(signInError)
          ? 'Could not reach the server. Check your connection and try again.'
          : 'The email or password is not right.',
      )
      setPending(false)
    }
    // On success the session change redirects, so the form stays disabled until then.
  }

  return (
    <main className="screen screen--centered">
      <h1 className="brand">Coastal Mystery</h1>
      <p className="muted">Sign in with the account your team gave you.</p>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field-card">
          <span className="label">Email</span>
          <input type="email" name="email" autoComplete="email" required />
        </label>
        <label className="field-card">
          <span className="label">Password</span>
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        <button type="submit" className="button button--primary button--full" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
        {error && (
          <p className="form-message form-message--error" role="alert">
            {error}
          </p>
        )}
      </form>
      <p className="muted small">
        <a href="/spike.html">Camera spike</a>
      </p>
    </main>
  )
}
