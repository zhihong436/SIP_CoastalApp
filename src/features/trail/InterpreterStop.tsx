import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  budget,
  feedbackHeld,
  feedbackLost,
  overBudgetText,
  protections,
  resultText,
  sections,
  type Plan,
  type ProtectionId,
  type SectionId,
} from './holdTheShore'
import { ResultBadge } from './ResultBadge'
import type { StopProgress } from './useTrailSession'

interface Props {
  sessionId: string
  progress: StopProgress
  onChanged: () => void
}

const emptyPlan: Plan = { beach: null, path: null, car_park: null }

export function InterpreterStop({ sessionId, progress, onChanged }: Props) {
  // A new plan starts from the last one, so changing one stretch does not mean choosing all three again.
  const [plan, setPlan] = useState<Plan>(progress.last_plan ?? emptyPlan)
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState<'over_budget' | 'error' | null>(null)
  const solved = progress.solved_at !== null
  const used = Object.values(plan).reduce((total, id) => total + (protections.find((p) => p.id === id)?.cost ?? 0), 0)

  function choose(section: SectionId, protection: ProtectionId | null) {
    setPlan((current) => ({ ...current, [section]: protection }))
    setFeedback(null)
  }

  // The database decides whether the plan is allowed and what happened. This phone only shows its answer.
  async function submit() {
    setPending(true)
    setFeedback(null)
    const { data, error } = await supabase.rpc('submit_stop_answer', {
      p_session_id: sessionId,
      p_stop: progress.stop,
      p_plan: plan,
    })
    if (error) setFeedback('error')
    else if (data?.[0]?.over_budget) setFeedback('over_budget')
    onChanged()
    setPending(false)
  }

  return (
    <main className="screen stop">
      {!solved && (
        <p className={used > budget ? 'budget budget--over' : 'budget'} role="status">
          Points used {used} of {budget}
        </p>
      )}

      {progress.last_plan && progress.last_results && (
        <section className="block" aria-labelledby="storm-results">
          <p className="label" id="storm-results">
            The last storm
          </p>
          <ul className="storm-results">
            {sections.map((section) => (
              <li key={section.id}>
                <div className="storm-results__head">
                  <strong>{section.name}</strong>
                  <ResultBadge result={progress.last_results![section.id]} />
                </div>
                <p>{resultText[section.id][progress.last_plan![section.id] ?? 'empty']}</p>
              </li>
            ))}
          </ul>
          <p className="stop__feedback" role="status">
            {solved ? feedbackHeld : feedbackLost}
          </p>
        </section>
      )}

      {!solved && (
        <>
          <section className="block">
            <p className="label">Protections</p>
            <ul className="protections">
              {protections.map((protection) => (
                <li key={protection.id}>
                  <strong>
                    {protection.name} · {protection.cost} {protection.cost === 1 ? 'point' : 'points'}
                  </strong>
                  <p className="muted small">{protection.description}</p>
                </li>
              ))}
            </ul>
            <p className="muted small">You cannot see what each stretch needs. Ask your partner.</p>
          </section>

          {sections.map((section) => (
            <section className="block" key={section.id}>
              <p className="label">{section.name}</p>
              <div className="choices" role="group" aria-label={`Choose for the ${section.name}`}>
                {protections.map((protection) => (
                  <button
                    key={protection.id}
                    type="button"
                    className="choice"
                    aria-pressed={plan[section.id] === protection.id}
                    disabled={pending}
                    onClick={() => choose(section.id, protection.id)}
                  >
                    {protection.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="choice"
                  aria-pressed={plan[section.id] === null}
                  disabled={pending}
                  onClick={() => choose(section.id, null)}
                >
                  Empty
                </button>
              </div>
            </section>
          ))}

          <div className="stop__plan-bar">
            {feedback === 'over_budget' && (
              <p className="form-message form-message--error" role="alert">
                {overBudgetText}
              </p>
            )}
            {feedback === 'error' && (
              <p className="form-message form-message--error" role="alert">
                Could not check that plan. Check your connection and try again.
              </p>
            )}
            <button
              type="button"
              className="button button--primary button--full"
              disabled={pending}
              onClick={() => void submit()}
            >
              {pending ? 'Checking…' : 'Submit'}
            </button>
          </div>
        </>
      )}
    </main>
  )
}
