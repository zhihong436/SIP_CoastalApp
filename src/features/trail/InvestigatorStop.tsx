import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BackIcon } from '../../components/Icons'
import { supabase } from '../../lib/supabase'
import { capturePhoto, savePhoto, type DrawOnView } from '../camera/capturePhoto'
import { useCamera } from '../camera/useCamera'
import { SEA_BOTTOM, SHORE_BOTTOM, SHORE_TOP } from './drawShore'
import {
  feedbackHeld,
  feedbackLost,
  overBudgetText,
  planFromBuild,
  protections,
  resultLabels,
  sections,
  type SectionId,
} from './holdTheShore'
import { ProtectionPicture } from './ProtectionPicture'
import { ResultBadge } from './ResultBadge'
import { ShoreCanvas } from './ShoreCanvas'
import type { StopProgress } from './useTrailSession'

interface Props {
  sessionId: string
  matchId: string
  progress: StopProgress
  onChanged: () => void
}

interface Photo {
  blob: Blob
  url: string
}

// A placed item is tapped through a button over its drawing. These offsets cover the tallest drawing, in pixels
// above and below the line where the sea meets the sand.
const PLACED_ABOVE = 36
const PLACED_HEIGHT = 76
const PLACED_INSET = 12

const protectionName = (id: string) => protections.find((protection) => protection.id === id)!.name

export function InvestigatorStop({ sessionId, matchId, progress, onChanged }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const drawRef = useRef<DrawOnView | null>(null)
  const camera = useCamera(videoRef)
  const [tagId, setTagId] = useState<SectionId | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The photo lives only in this phone's memory, so a reload loses it.
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [busy, setBusy] = useState(false)
  // True while a placement or the storm is being saved. Nothing changes on screen until the database confirms.
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [stormStartedAt, setStormStartedAt] = useState<number | null>(null)
  // The storms this phone has already shown. A reload starts level with the saved attempts, so it shows the results
  // straight away, and only a storm started while this screen is open plays first.
  const shownAttempts = useRef(progress.attempts)
  const solved = progress.solved_at !== null
  const results =
    progress.attempts > 0 && progress.attempts <= shownAttempts.current ? progress.last_results : null
  const toolbox = progress.build.filter((item) => item.section === null)
  // The Interpreter may have returned the selected item since it was tapped.
  const selected = toolbox.find((item) => item.id === selectedId) ?? null
  const locked = pending || solved || stormStartedAt !== null

  useEffect(() => {
    if (progress.attempts > shownAttempts.current && stormStartedAt === null) setStormStartedAt(performance.now())
  }, [progress.attempts, stormStartedAt])

  useEffect(() => {
    const url = photo?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [photo])

  function endStorm() {
    shownAttempts.current = progress.attempts
    setStormStartedAt(null)
  }

  // The database checks the Investigator is allowed and that the item and section exist.
  async function place(itemId: string, section: SectionId | null) {
    setPending(true)
    setMessage(null)
    const { error } = await supabase.rpc('place_protection', {
      p_session_id: sessionId,
      p_stop: progress.stop,
      p_item_id: itemId,
      p_section: section,
    })
    if (error) setMessage('Could not place that. Check your connection and try again.')
    setSelectedId(null)
    onChanged()
    setPending(false)
  }

  async function startStorm() {
    setPending(true)
    setMessage(null)
    setTagId(null)
    const { data, error } = await supabase.rpc('submit_stop_answer', {
      p_session_id: sessionId,
      p_stop: progress.stop,
    })
    if (error) setMessage('Could not start the storm. Check your connection and try again.')
    else if (data?.[0]?.over_budget) setMessage(overBudgetText)
    onChanged()
    setPending(false)
  }

  function tapSection(section: SectionId) {
    if (selected) void place(selected.id, section)
    else setTagId(section === tagId ? null : section)
  }

  async function takePhoto() {
    if (!videoRef.current || !drawRef.current) return
    setBusy(true)
    setMessage(null)
    const blob = await capturePhoto(videoRef.current, drawRef.current)
    if (blob) {
      setPhoto({ blob, url: URL.createObjectURL(blob) })
      setTagId(null)
    } else {
      setMessage('Could not take the photo. Try again.')
    }
    setBusy(false)
  }

  async function save() {
    if (!photo) return
    const saved = await savePhoto(photo.blob, 'hold-the-shore.jpg')
    if (!saved) setMessage('Could not save the photo. Try again.')
  }

  const tag = sections.find((section) => section.id === tagId)
  let status: string | null = null
  if (results) status = solved ? feedbackHeld : feedbackLost

  return (
    <div className="camera">
      <video ref={videoRef} className="camera__video" playsInline muted />

      {photo ? (
        <img className="camera__video" src={photo.url} alt="The photo you took, with the drawn shore" />
      ) : (
        <>
          <ShoreCanvas
            plan={planFromBuild(progress.build)}
            stormStartedAt={stormStartedAt}
            onStormEnd={endStorm}
            drawRef={drawRef}
          />
          {camera.status === 'live' &&
            sections.map((section, index) => {
              const result = results?.[section.id]
              const placed = progress.build.find((item) => item.section === section.id)
              const column = { left: `${(index / sections.length) * 100}%`, width: `${100 / sections.length}%` }
              let className = 'camera__section'
              if (section.id === tagId) className += ' camera__section--selected'
              if (selected) className += ' camera__section--target'
              return (
                <div key={section.id}>
                  <button
                    type="button"
                    className={className}
                    style={{
                      ...column,
                      top: `${SHORE_TOP * 100}%`,
                      height: `${(SHORE_BOTTOM - SHORE_TOP) * 100}%`,
                    }}
                    aria-label={result ? `${section.name}, ${resultLabels[result]}` : section.name}
                    aria-pressed={selected ? undefined : section.id === tagId}
                    disabled={selected ? locked : false}
                    onClick={() => tapSection(section.id)}
                  >
                    {result && <ResultBadge result={result} />}
                  </button>
                  {placed && (
                    <button
                      type="button"
                      className="camera__placed"
                      style={{
                        left: `calc(${column.left} + ${PLACED_INSET}px)`,
                        width: `calc(${column.width} - ${PLACED_INSET * 2}px)`,
                        top: `calc(${SEA_BOTTOM * 100}% - ${PLACED_ABOVE}px)`,
                        height: `${PLACED_HEIGHT}px`,
                      }}
                      aria-label={
                        selected
                          ? `Swap the selected item onto the ${section.name}`
                          : `Send the ${protectionName(placed.protection)} on the ${section.name} back to the toolbox`
                      }
                      disabled={locked}
                      onClick={() => (selected ? void place(selected.id, section.id) : void place(placed.id, null))}
                    />
                  )}
                </div>
              )
            })}
        </>
      )}

      <header className="camera__top">
        <Link to={`/chats/${matchId}`} className="camera__back" aria-label="Back to the conversation">
          <BackIcon />
        </Link>
        {status && (
          <p className="chip" role="status">
            {status}
          </p>
        )}
      </header>

      {!photo && camera.status !== 'live' && (
        <div className="camera__cover">
          {camera.status === 'starting' && <p>Starting the camera…</p>}
          {camera.status === 'denied' && (
            <>
              <h2>The camera is blocked</h2>
              <p>
                This stop needs your camera. Tap the aA button in the address bar, choose Website Settings, set Camera to
                Allow, then try again.
              </p>
              <button type="button" className="button button--primary" onClick={camera.retry}>
                Try again
              </button>
            </>
          )}
          {camera.status === 'unavailable' && (
            <>
              <h2>The camera could not start</h2>
              <p>Close other apps that use the camera, check this page is open over HTTPS, then try again.</p>
              <button type="button" className="button button--primary" onClick={camera.retry}>
                Try again
              </button>
            </>
          )}
        </div>
      )}

      <div className="camera__notes" style={{ bottom: `${(1 - SHORE_TOP) * 100}%` }}>
        {tag && !photo && (
          <p className="camera__tag" role="status">
            {tag.tag}
          </p>
        )}
        {message && (
          <p className="camera__tag camera__tag--error" role="alert">
            {message}
          </p>
        )}
      </div>

      <footer className="camera__bottom">
        {photo ? (
          <div className="camera__actions">
            <button type="button" className="button button--primary" onClick={() => void save()}>
              Save photo
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setPhoto(null)
                setMessage(null)
              }}
            >
              Retake
            </button>
          </div>
        ) : (
          camera.status === 'live' && (
            <>
              <div className="toolbox" role="group" aria-label="Toolbox">
                {toolbox.length === 0 ? (
                  <p className="toolbox__empty">
                    {progress.build.length === 0 ? 'Ask your partner to buy protections' : 'Everything bought is on the shore'}
                  </p>
                ) : (
                  toolbox.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="toolbox__item"
                      aria-pressed={item.id === selected?.id}
                      disabled={locked}
                      onClick={() => setSelectedId(item.id === selected?.id ? null : item.id)}
                    >
                      <ProtectionPicture protection={item.protection} />
                      {protectionName(item.protection)}
                    </button>
                  ))
                )}
              </div>
              <div className="camera__actions">
                <button
                  type="button"
                  className="button button--primary camera__storm"
                  disabled={locked}
                  onClick={() => void startStorm()}
                >
                  {pending ? 'Saving…' : 'Start the storm'}
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  disabled={busy}
                  onClick={() => void takePhoto()}
                >
                  {busy ? 'Taking…' : 'Take photo'}
                </button>
              </div>
            </>
          )
        )}
      </footer>
    </div>
  )
}
