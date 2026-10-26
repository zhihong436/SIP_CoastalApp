import { Link } from 'react-router-dom'
import { PreviewBanner } from '../../components/PreviewBanner'
import { ProfileCard, type Profile } from './ProfileCard'

// Made-up person, never real tester data, and not for acceptance checks.
const sampleProfile: Profile = {
  name: 'Sample Person',
  age: 27,
  gender: 'Sample gender',
  bio: 'Sample bio. Likes sea breezes, long walks and puzzles that need two people.',
}

export function ProfileCardPreviewPage() {
  return (
    <main className="screen screen--fill">
      <PreviewBanner>Made-up sample data to review the layout. The buttons do nothing.</PreviewBanner>
      <ProfileCard profile={sampleProfile} />
      <div className="actions">
        <button type="button" className="button button--secondary">
          Pass
        </button>
        <button type="button" className="button button--primary">
          Like
        </button>
      </div>
      <p className="small">
        <Link to="/sign-in">Back to sign in</Link>
      </p>
    </main>
  )
}
