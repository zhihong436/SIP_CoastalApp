import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export type CameraStatus = 'starting' | 'live' | 'denied' | 'unavailable'

// Opens the rear camera in the given video element and closes it when the screen is left.
// Locking the phone or switching apps can end the stream, so it restarts when the page is visible again.
export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const [status, setStatus] = useState<CameraStatus>('starting')
  const streamRef = useRef<MediaStream | null>(null)
  // Stops a start that finishes after the screen was left from keeping the camera on.
  const attempt = useRef(0)

  const stop = useCallback(() => {
    attempt.current += 1
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const start = useCallback(async () => {
    const video = videoRef.current
    if (!video) return
    stop()
    const mine = attempt.current
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable')
      return
    }
    setStatus('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      if (mine !== attempt.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      video.srcObject = stream
      await video.play()
      if (mine === attempt.current) setStatus('live')
    } catch (error) {
      if (mine !== attempt.current) return
      setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'unavailable')
    }
  }, [videoRef, stop])

  useEffect(() => {
    void start()
    return stop
  }, [start, stop])

  useEffect(() => {
    function restartIfEnded() {
      if (document.visibilityState !== 'visible') return
      const stream = streamRef.current
      const live = stream !== null && stream.getTracks().every((track) => track.readyState === 'live')
      if (!live || videoRef.current?.paused) void start()
    }
    document.addEventListener('visibilitychange', restartIfEnded)
    return () => document.removeEventListener('visibilitychange', restartIfEnded)
  }, [start, videoRef])

  return { status, retry: () => void start() }
}
