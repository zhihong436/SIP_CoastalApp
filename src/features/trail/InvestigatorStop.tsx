import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BackIcon } from '../../components/Icons'
import { capturePhoto, savePhoto, type DrawOnView } from '../camera/capturePhoto'
import { useCamera } from '../camera/useCamera'
import { SHORE_BOTTOM, SHORE_TOP } from './drawShore'
import { feedbackHeld, feedbackLost, resultLabels, sections, type SectionId } from './holdTheShore'
import { ResultBadge } from './ResultBadge'
import { ShoreCanvas } from './ShoreCanvas'
import type { StopProgress } from './useTrailSession'

interface Props {
  matchId: string
  progress: StopProgress
  partnerName: string
}

interface Photo {
  blob: Blob
  url: string
}

export function InvestigatorStop({ matchId, progress, partnerName }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const drawRef = useRef<DrawOnView | null>(null)
  const camera = useCamera(videoRef)
  const [tagId, setTagId] = useState<SectionId | null>(null)
  // The photo lives only in this phone's memory, so a reload loses it.
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [stormStartedAt, setStormStartedAt] = useState<number | null>(null)
  // The attempts this phone has already shown. A reload starts level with the saved attempts, so it shows the results
  // straight away, and only a plan submitted while this screen is open plays the storm first.
  const shownAttempts = useRef(progress.attempts)
  const solved = progress.solved_at !== null
  const results =
    progress.attempts > 0 && progress.attempts <= shownAttempts.current ? progress.last_results : null

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
  if (progress.attempts === 0) status = `Waiting for ${partnerName}'s plan`
  else if (results) status = solved ? feedbackHeld : feedbackLost

  return (
    <div className="camera">
      <video ref={videoRef} className="camera__video" playsInline muted />

      {photo ? (
        <img className="camera__video" src={photo.url} alt="The photo you took, with the drawn shore" />
      ) : (
        <>
          <ShoreCanvas
            plan={progress.last_plan}
            stormStartedAt={stormStartedAt}
            onStormEnd={endStorm}
            drawRef={drawRef}
          />
          {camera.status === 'live' &&
            sections.map((section, index) => {
              const result = results?.[section.id]
              return (
                <button
                  key={section.id}
                  type="button"
                  className={section.id === tagId ? 'camera__section camera__section--selected' : 'camera__section'}
                  style={{
                    left: `${(index / sections.length) * 100}%`,
                    width: `${100 / sections.length}%`,
                    top: `${SHORE_TOP * 100}%`,
                    height: `${(SHORE_BOTTOM - SHORE_TOP) * 100}%`,
                  }}
                  aria-label={result ? `${section.name}, ${resultLabels[result]}` : section.name}
                  aria-pressed={section.id === tagId}
                  onClick={() => setTagId(section.id === tagId ? null : section.id)}
                >
                  {result && <ResultBadge result={result} />}
                </button>
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

      <footer className="camera__bottom">
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
          <button
            type="button"
            className="button button--primary button--full"
            disabled={camera.status !== 'live' || busy}
            onClick={() => void takePhoto()}
          >
            {busy ? 'Taking photo…' : 'Take photo'}
          </button>
        )}
      </footer>
    </div>
  )
}
