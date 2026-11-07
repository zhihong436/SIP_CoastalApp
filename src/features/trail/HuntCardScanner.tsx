import { useEffect, useRef, useState } from 'react'
import decodeQR from 'qr/decode.js'
import { CrossIcon } from '../../components/Icons'
import { useCamera } from '../camera/useCamera'
import { isBreakWavesCard } from './openCardProblem'

interface Props {
  onClose: () => void
  onDetected: () => Promise<boolean>
}

const SCAN_INTERVAL_MS = 250
const SCAN_WIDTH = 640
const NOTICE_MS = 3000

// The hunt scanner only accepts the canonical Break the waves card. The parent stops/releases the AR
// session before opening this component, and closes it before Start can run, so only one camera is used.
export function HuntCardScanner({ onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const camera = useCamera(videoRef)
  const [notice, setNotice] = useState<string | null>(null)
  const opening = useRef(false)
  const closeRef = useRef(onClose)
  const detectedRef = useRef(onDetected)
  closeRef.current = onClose
  detectedRef.current = onDetected

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

    async function read(text: string) {
      if (!isBreakWavesCard(text)) {
        setNotice('That is not the Break the waves card.')
        return
      }
      opening.current = true
      const opened = await detectedRef.current()
      if (!opened) {
        setNotice('Could not open the stop. Check your connection and try again.')
        opening.current = false
      }
    }

    function scan() {
      const video = videoRef.current
      if (opening.current || !video || video.videoWidth === 0) return
      const scale = Math.min(1, SCAN_WIDTH / video.videoWidth)
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      context!.drawImage(video, 0, 0, canvas.width, canvas.height)
      const image = context!.getImageData(0, 0, canvas.width, canvas.height)
      let text: string
      try {
        text = decodeQR(image)
      } catch {
        return
      }
      void read(text)
    }

    const timer = window.setInterval(scan, SCAN_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [camera.status])

  return (
    <div className="scanner hunt-scanner">
      <div className="camera">
        <video ref={videoRef} className="camera__video" playsInline muted />
        {camera.status === 'live' && (
          <>
            <div className="scanner__frame" aria-hidden="true" />
            <p className="scanner__hint">Point at the Break the waves QR code</p>
          </>
        )}

        {camera.status !== 'live' && (
          <div className="camera__cover">
            {camera.status === 'starting' && <p>Starting the camera…</p>}
            {camera.status === 'denied' && (
              <>
                <h2>The camera is blocked</h2>
                <p>
                  In Safari, open the aA menu in the address bar, choose Website Settings, set Camera to Allow, then
                  try again.
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

        <header className="camera__top">
          <button type="button" className="camera__back" aria-label="Close the scanner" onClick={closeRef.current}>
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
