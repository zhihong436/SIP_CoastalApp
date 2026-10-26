import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PreviewBanner } from '../../components/PreviewBanner'

// Layout only. Real sign-in arrives with identity and profiles in increment 2.
export function SignInPage() {
  const [notice, setNotice] = useState('')

  return (
    <main className="screen screen--centered">
      <PreviewBanner>Sign-in is not connected yet, so this layout does nothing.</PreviewBanner>
      <h1 className="brand">Coastal Mystery</h1>
      <p className="muted">Sign in with the account your team gave you.</p>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault()
          setNotice('Sign-in is not connected yet.')
        }}
      >
        <label className="field">
          <span>Email</span>
          <input type="email" name="email" autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        <button type="submit" className="button button--primary">
          Sign in
        </button>
        {notice && (
          <p className="form-message" role="status">
            {notice}
          </p>
        )}
      </form>
      <p className="muted small">
        <Link to="/preview/profile-card">Profile card preview</Link>
        {' · '}
        <a href="/spike.html">Camera spike</a>
      </p>
    </main>
  )
}
