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
  type ProtectionId,
} from './holdTheShore'
import { ProtectionPicture } from './ProtectionPicture'
import { ResultBadge } from './ResultBadge'
import type { StopProgress } from './useTrailSession'

interface Props {
  sessionId: string
  progress: StopProgress
  onChanged: () => void
}

function pointsText(cost: number) {
  return `${cost} ${cost === 1 ? 'point' : 'points'}`
}

export function InterpreterStop({ sessionId, progress, onChanged }: Props) {
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState<'over_budget' | 'error' | null>(null)
  const solved = progress.solved_at !== null
  const used = progress.build.reduce(
    (total, item) => total + protections.find((p) => p.id === item.protection)!.cost,
    0,
  )
  const pointsLeft = budget - used

  // The database decides whether a purchase is allowed. This phone shows only what it saved.
  async function buy(protection: ProtectionId) {
    setPending(true)
    setFeedback(null)
    const { data, error } = await supabase.rpc('buy_protection', {
      p_session_id: sessionId,
      p_stop: progress.stop,
      p_protection: protection,
    })
    if (error) setFeedback('error')
    else if (data?.[0]?.over_budget) setFeedback('over_budget')
    onChanged()
    setPending(false)
  }

  async function giveBack(itemId: string) {
    setPending(true)
    setFeedback(null)
    const { error } = await supabase.rpc('return_protection', {
      p_session_id: sessionId,
      p_stop: progress.stop,
      p_item_id: itemId,
    })
    if (error) setFeedback('error')
    onChanged()
    setPending(false)
  }

  return (
    <main className="screen stop">
      {!solved && (
        <p className="budget" role="status">
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
          {feedback === 'over_budget' && (
            <p className="form-message form-message--error" role="alert">
              {overBudgetText}
            </p>
          )}
          {feedback === 'error' && (
            <p className="form-message form-message--error" role="alert">
              Could not save that. Check your connection and try again.
            </p>
          )}

          <section className="block" aria-labelledby="shop-list">
            <p className="label" id="shop-list">
              Shop
            </p>
            <ul className="shop">
              {protections.map((protection) => (
                <li key={protection.id} className="shop__item">
                  <ProtectionPicture protection={protection.id} />
                  <div className="shop__text">
                    <strong>
                      {protection.name} · {pointsText(protection.cost)}
                    </strong>
                    <p className="muted small">{protection.description}</p>
                  </div>
                  <button
                    type="button"
                    className="button button--primary shop__button"
                    disabled={pending || protection.cost > pointsLeft}
                    aria-label={`Buy ${protection.name}`}
                    onClick={() => void buy(protection.id)}
                  >
                    Buy
                  </button>
                </li>
              ))}
            </ul>
            <p className="muted small">You cannot see what each stretch needs. Ask your partner.</p>
          </section>

          <section className="block" aria-labelledby="bought-list">
            <p className="label" id="bought-list">
              Bought
            </p>
            {progress.build.length === 0 ? (
              <p className="muted small">Nothing bought yet.</p>
            ) : (
              <ul className="shop">
                {progress.build.map((item) => {
                  const protection = protections.find((p) => p.id === item.protection)!
                  return (
                    <li key={item.id} className="shop__item">
                      <ProtectionPicture protection={item.protection} />
                      <div className="shop__text">
                        <strong>{protection.name}</strong>
                        <p className="muted small">{pointsText(protection.cost)}</p>
                      </div>
                      <button
                        type="button"
                        className="text-button shop__button"
                        disabled={pending}
                        aria-label={`Return ${protection.name}`}
                        onClick={() => void giveBack(item.id)}
                      >
                        Return
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  )
}
