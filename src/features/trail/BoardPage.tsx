import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BackIcon, CheckIcon } from '../../components/Icons'
import { supabase } from '../../lib/supabase'
import { boardHeading, boardIntro, problems } from './problems'
import type { StopProgress, TrailSession } from './useTrailSession'

interface Props {
  session: TrailSession
  stops: StopProgress[]
  onChanged: () => void
}

// A problem is done once both people have acknowledged its result.
const isDone = (stops: StopProgress[], stop: number) =>
  stops.some((row) => row.stop === stop && row.interpreter_acknowledged_at && row.investigator_acknowledged_at)

export function BoardPage({ session, stops, onChanged }: Props) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)

  // The database picks the roles and opens the problem on both phones.
  async function open(stop: number) {
    setPending(true)
    setError(false)
    const { error: openError } = await supabase.rpc('open_stop', { p_session_id: session.id, p_stop: stop })
    if (openError) setError(true)
    onChanged()
    setPending(false)
  }

  return (
    <div className="focus">
      <header className="focus__header">
        <Link to={`/chats/${session.match_id}`} className="back-link" aria-label="Back to the conversation">
          <BackIcon />
        </Link>
        <h1>{boardHeading}</h1>
      </header>
      <main className="screen stop">
        <p>{boardIntro}</p>
        <ul className="problems">
          {problems.map((problem) => {
            const done = problem.stop !== undefined && isDone(stops, problem.stop)
            const playable = problem.stop !== undefined && !done
            return (
              <li key={problem.title} className={playable ? 'problem' : 'problem problem--muted'}>
                <div className="problem__text">
                  <h2>{problem.title}</h2>
                  {playable && problem.landmark && <p className="muted small">Card: {problem.landmark}</p>}
                  {!playable && !done && <p className="muted small">Coming soon</p>}
                </div>
                {done && (
                  <span className="problem__done" role="img" aria-label="Done">
                    <CheckIcon />
                  </span>
                )}
                {playable && (
                  <button
                    type="button"
                    className="text-button problem__open"
                    disabled={pending}
                    onClick={() => void open(problem.stop!)}
                  >
                    {pending ? 'Opening…' : "Can't find the code?"}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        {error && (
          <p className="form-message form-message--error" role="alert">
            Could not open that problem. Check your connection and try again.
          </p>
        )}
      </main>
    </div>
  )
}
