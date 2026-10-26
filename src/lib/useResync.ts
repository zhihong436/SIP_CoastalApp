import { useEffect, useRef } from 'react'

// Calls back when the app returns to the foreground or the connection comes back,
// so saved state is fetched again after anything a live subscription may have missed.
export function useResync(callback: () => void) {
  const latest = useRef(callback)
  useEffect(() => {
    latest.current = callback
  })

  useEffect(() => {
    const resync = () => {
      if (document.visibilityState === 'visible') latest.current()
    }
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('online', resync)
    return () => {
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('online', resync)
    }
  }, [])
}
