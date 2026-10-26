import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { clearDrafts } from '../chat/drafts'
import { supabase } from '../../lib/supabase'

interface AuthState {
  session: Session | null
  // True until Supabase has restored any saved session, so guards never redirect too early.
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // The first event restores the saved session. Only state is set here, because awaiting
    // Supabase calls inside this callback can deadlock the client.
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_OUT') clearDrafts()
      setSession(newSession)
      setLoading(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.removeAllChannels()
    await supabase.auth.signOut()
  }

  return <AuthContext value={{ session, loading, signOut }}>{children}</AuthContext>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
