import { Link } from 'react-router-dom'
import { PreviewBanner } from '../../components/PreviewBanner'

// Made-up person, never real tester data, and not for acceptance checks.
const sampleProfile = {
  name: 'Sample Person',
  age: 27,
  gender: 'Sample gender',
  bio: 'Sample bio. Likes sea breezes, long walks and puzzles that need two people.',
}

export function ProfileCardPreviewPage() {
  return (
    <main className="screen">
      <PreviewBanner>This card shows made-up sample data to review the layout.</PreviewBanner>
      <article className="card">
        <h1 className="card__name">
          {sampleProfile.name}, {sampleProfile.age}
        </h1>
        <p className="card__meta">{sampleProfile.gender}</p>
        <p className="card__bio">{sampleProfile.bio}</p>
      </article>
      <div className="actions">
        <button type="button" className="button button--secondary" disabled>
          Pass
        </button>
        <button type="button" className="button button--primary" disabled>
          Like
        </button>
      </div>
      <p className="muted small">The buttons do nothing in this preview.</p>
      <p className="small">
        <Link to="/sign-in">Back to sign in</Link>
      </p>
    </main>
  )
}
