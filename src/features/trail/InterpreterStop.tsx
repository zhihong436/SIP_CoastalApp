import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { StopProgress } from './useTrailSession'
import { clues, objects, rightAnswerText, STOP_NUMBER, wrongAnswerText, type ObjectId } from './stop1'

interface Props {
  sessionId: string
  progress: StopProgress
  partnerName: string
  onChanged: () => void
}

export function InterpreterStop({ sessionId, progress, partnerName, onChanged }: Props) {
  const [choice, setChoice] = useState<ObjectId | null>(null)
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState<'wrong' | 'error' | null>(null)

  async function submit() {
    if (!choice) return
    setPending(true)
    setFeedback(null)
    const { data, error } = await supabase.rpc('submit_stop_answer', {
      p_session_id: sessionId,
      p_stop: STOP_NUMBER,
      p_choice: choice,
    })
    if (error) setFeedback('error')
    else if (!data?.[0]?.correct) setFeedback('wrong')
    onChanged()
    setPending(false)
  }

  return (
    <main className="screen stop">
      <section className="block">
        <p className="label">The message</p>
        <ol className="clues">
          {clues.map((clue) => (
            <li key={clue}>{clue}</li>
          ))}
        </ol>
        <p className="muted small">The clues only make sense with what {partnerName} can see. Talk it through.</p>
      </section>

      {progress.answer_correct ? (
        <section className="block stop__found" role="status">
          <h2>{rightAnswerText}</h2>
        </section>
      ) : (
        <section className="block">
          <p className="label">Where is the sender?</p>
          <div className="choices" role="group" aria-label="Choose an object">
            {objects.map((object) => (
              <button
                key={object.id}
                type="button"
                className="choice"
                aria-pressed={choice === object.id}
                disabled={pending}
                onClick={() => {
                  setChoice(object.id)
                  setFeedback(null)
                }}
              >
                {object.name}
              </button>
            ))}
          </div>
          {feedback === 'wrong' && (
            <p className="stop__feedback" role="status">
              {wrongAnswerText}
            </p>
          )}
          {feedback === 'error' && (
            <p className="form-message form-message--error" role="alert">
              Could not check that. Check your connection and try again.
            </p>
          )}
          <button
            type="button"
            className="button button--primary button--full stop__submit"
            disabled={!choice || pending}
            onClick={() => void submit()}
          >
            {pending ? 'Checking…' : 'Submit'}
          </button>
        </section>
      )}

      <p className="muted" role="status">
        {progress.photo_taken ? 'Photo taken' : `Waiting for ${partnerName} to take the photo`}
      </p>
      {progress.solved_at && <p className="notice">This stop is solved.</p>}
    </main>
  )
}
