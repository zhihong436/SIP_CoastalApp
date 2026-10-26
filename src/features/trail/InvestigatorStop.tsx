import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BackIcon } from '../../components/Icons'
import { capturePhoto, savePhoto } from '../camera/capturePhoto'
import { useCamera } from '../camera/useCamera'
import { supabase } from '../../lib/supabase'
import { drawWaterLines } from './drawWaterLines'
import { objects, STOP_NUMBER, type ObjectId } from './stop1'
import type { StopProgress } from './useTrailSession'

interface Props {
  sessionId: string
  matchId: string
  progress: StopProgress
  partnerName: string
  onChanged: () => void
}

interface Photo {
  blob: Blob
  url: string
}

export function InvestigatorStop({ sessionId, matchId, progress, partnerName, onChanged }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const camera = useCamera(videoRef)
  const [tagId, setTagId] = useState<ObjectId | null>(null)
  // The photo lives only in this phone's memory, so a reload loses it.
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const solved = progress.solved_at !== null

  useEffect(() => {
    const url = photo?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [photo])

  async function recordPhoto() {
    const { error } = await supabase.rpc('record_stop_photo', { p_session_id: sessionId, p_stop: STOP_NUMBER })
    setMessage(error ? 'Could not tell the app the photo was taken. Check your connection and try again.' : null)
    onChanged()
  }

  async function takePhoto() {
    if (!videoRef.current) return
    setBusy(true)
    setMessage(null)
    const blob = await capturePhoto(videoRef.current, drawWaterLines)
    if (blob) {
      setPhoto({ blob, url: URL.createObjectURL(blob) })
      setTagId(null)
      await recordPhoto()
    } else {
      setMessage('Could not take the photo. Try again.')
    }
    setBusy(false)
  }

  async function save() {
    if (!photo) return
    const saved = await savePhoto(photo.blob, 'water-line.jpg')
    if (!saved) setMessage('Could not save the photo. Try again.')
  }

  const tag = objects.find((object) => object.id === tagId)
  const partnerStatus = solved
    ? 'Stop solved'
    : progress.answer_correct
      ? `${partnerName} has found it`
      : `Waiting for ${partnerName}'s answer`

  return (
    <div className="camera">
      <video ref={videoRef} className="camera__video" playsInline muted />

      {photo ? (
        <img className="camera__video" src={photo.url} alt="The photo you took, with the Today and 2100 lines" />
      ) : (
        <>
          <LinesOverlay />
          {camera.status === 'live' &&
            objects.map((object) => (
              <button
                key={object.id}
                type="button"
                className={object.id === tagId ? 'camera__object camera__object--selected' : 'camera__object'}
                style={{ left: `${object.x * 100}%`, top: `${object.y * 100}%` }}
                aria-label={`Object from 2100, ${Math.round((1 - object.y) * 100)} percent up the view`}
                aria-pressed={object.id === tagId}
                onClick={() => setTagId(object.id === tagId ? null : object.id)}
              >
                <ObjectGlyph id={object.id} />
              </button>
            ))}
        </>
      )}

      <header className="camera__top">
        <Link to={`/chats/${matchId}`} className="camera__back" aria-label="Back to the conversation">
          <BackIcon />
        </Link>
        <p className="chip" role="status">
          {partnerStatus}
        </p>
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
        {photo && !progress.photo_taken && !busy && !solved && (
          <button type="button" className="button button--secondary button--full" onClick={() => void recordPhoto()}>
            Try again
          </button>
        )}
        {photo ? (
          <div className="camera__actions">
            <button type="button" className="button button--primary" onClick={() => void save()}>
              Save photo
            </button>
            {!solved && (
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
            )}
          </div>
        ) : (
          !solved && (
            <button
              type="button"
              className="button button--primary button--full"
              disabled={camera.status !== 'live' || busy}
              onClick={() => void takePhoto()}
            >
              {busy ? 'Taking photo…' : 'Take photo'}
            </button>
          )
        )}
      </footer>
    </div>
  )
}

// The lines are drawn on a canvas by the same code that draws them into the saved photo.
function LinesOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    function redraw() {
      const { clientWidth: width, clientHeight: height } = canvas
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      const context = canvas.getContext('2d')!
      context.scale(ratio, ratio)
      drawWaterLines(context, width, height)
    }
    redraw()
    const observer = new ResizeObserver(redraw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  return <canvas ref={canvasRef} className="camera__lines" aria-hidden="true" />
}

// Simple outlines, so the objects read as faint sketches rather than real things.
const glyphPaths: Record<ObjectId, string> = {
  bench: 'M4 11h16M5 7h14M6 11v7M18 11v7',
  barbecue_pit: 'M5 10h14a7 7 0 0 1-14 0zM9 18l-2 4M15 18l2 4',
  shelter: 'M3 10l9-6 9 6zM6 10v10M18 10v10',
  lamp_post: 'M12 22V6M8 22h8M12 6h5M17 6v3',
  palm_tree: 'M12 22V11M12 11c-2-4-6-4-8-1M12 11c2-4 6-4 8-1M12 11c-1-4 0-7 0-8',
}

function ObjectGlyph({ id }: { id: ObjectId }) {
  return (
    <svg
      aria-hidden="true"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={glyphPaths[id]} />
    </svg>
  )
}
