import { useEffect, useRef, useState } from 'react'
import decodeQR from 'qr/decode.js'
import { CrossIcon } from '../../components/Icons'
import { useCamera } from '../camera/useCamera'
import { cardLinkFromText, openCardProblem } from './openCardProblem'

interface Props {
  sessionId: string
  onClose: () => void
  // Called after a card was read and its problem was asked for, so the board can load whatever the database did.
  onOpened: () => void
}

// Decoding is the slow part, so the picture is read a few times a second at a reduced size, not every frame.
const SCAN_INTERVAL_MS = 250
const SCAN_WIDTH = 640
const NOTICE_MS = 3000

export function CardScanner({ sessionId, onClose, onOpened }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const camera = useCamera(videoRef)
  const [notice, setNotice] = useState<string | null>(null)
  // Set while a card's problem is being opened, so the same card is not sent twice.
  const opening = useRef(false)
  // Kept in refs so the scan timer is not restarted whenever the parent renders.
  const closeRef = useRef(onClose)
  const openedRef = useRef(onOpened)
  closeRef.current = onClose
  openedRef.current = onOpened

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (camera.status !== 'live') return
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return

    async function open(cardLink: string) {
      opening.current = true
      const ok = await openCardProblem(sessionId, cardLink)
      if (ok) {
        // Closing first stops the camera, so the Investigator screen can start it again.
        closeRef.current()
        openedRef.current()
        return
      }
      setNotice('Could not open that problem. Check your connection and try again.')
      opening.current = false
    }

    function scan() {
      const video = videoRef.current
      if (opening.current || !video || video.videoWidth === 0) return
      const scale = Math.min(1, SCAN_WIDTH / video.videoWidth)
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      context!.drawImage(video, 0, 0, canvas.width, canvas.height)
      const image = context!.getImageData(0, 0, canvas.width, canvas.height)
      // The decoder throws when the picture holds no readable code, which is the usual case between scans.
      let text: string
      try {
        text = decodeQR(image)
      } catch {
        return
      }
      const cardLink = cardLinkFromText(text)
      if (cardLink) void open(cardLink)
      else setNotice('That is not a trail card')
    }

    const timer = window.setInterval(scan, SCAN_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [camera.status, sessionId])

  return (
    <div className="scanner">
      <div className="camera">
        <video ref={videoRef} className="camera__video" playsInline muted />
        {camera.status === 'live' && (
          <>
            <div className="scanner__frame" aria-hidden="true" />
            <p className="scanner__hint">Point at the QR code on a card</p>
          </>
        )}

        {camera.status !== 'live' && (
          <div className="camera__cover">
            {camera.status === 'starting' && <p>Starting the camera…</p>}
            {camera.status === 'denied' && (
              <>
                <h2>The camera is blocked</h2>
                <p>
                  To scan a card, tap the aA button in the address bar, choose Website Settings, set Camera to Allow,
                  then try again. Or close this and tap "Can't find the code?".
                </p>
                <button type="button" className="button button--primary" onClick={camera.retry}>
                  Try again
                </button>
              </>
            )}
            {camera.status === 'unavailable' && (
              <>
                <h2>The camera could not start</h2>
                <p>
                  Close other apps that use the camera, check this page is open over HTTPS, then try again. Or close this
                  and tap "Can't find the code?".
                </p>
                <button type="button" className="button button--primary" onClick={camera.retry}>
                  Try again
                </button>
              </>
            )}
          </div>
        )}

        <header className="camera__top">
          <button type="button" className="camera__back" aria-label="Close the scanner" onClick={onClose}>
            <CrossIcon />
          </button>
          {notice && (
            <p className="chip" role="status">
              {notice}
            </p>
          )}
        </header>
      </div>
    </div>
  )
}
