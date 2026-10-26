import { WaveIcon } from '../../components/Icons'
import { introAll, introInterpreter, introInvestigator } from './stop1'

export type Role = 'interpreter' | 'investigator'

export const roleNames: Record<Role, string> = { interpreter: 'Interpreter', investigator: 'Investigator' }

// Begin only affects this phone. The partner's phone does not wait for it.
export function StopIntro({ role, onBegin }: { role: Role; onBegin: () => void }) {
  return (
    <main className="screen trail-intro">
      <section className="block trail-intro__block">
        <span className="lobby__icon" aria-hidden="true">
          <WaveIcon size={32} />
        </span>
        <p className="label">Stop 1</p>
        <h2>The water line</h2>
        <p>{introAll}</p>
        <p className="role-badge">You are the {roleNames[role]}</p>
        <p>{role === 'interpreter' ? introInterpreter : introInvestigator}</p>
      </section>
      <button type="button" className="button button--primary button--full" onClick={onBegin}>
        Begin
      </button>
    </main>
  )
}
