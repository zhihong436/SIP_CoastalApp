import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import type { Profile } from './ProfileCard'

type ProfileStatus = 'loading' | 'ready' | 'error'

interface ProfileState {
  // Null while loading, on error, or when the account has no profile yet.
  profile: Profile | null
  status: ProfileStatus
  reload: () => void
  save: (values: Profile) => Promise<string | null>
}

const ProfileContext = createContext<ProfileState | null>(null)

// Mount this under a key of the user id, so switching accounts never shows the previous profile.
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session!.user.id
  const [profile, setProfile] = useState<Profile | null>(null)
  const [status, setStatus] = useState<ProfileStatus>('loading')

  const load = useCallback(async () => {
    setStatus('loading')
    const { data, error } = await supabase
      .from('profiles')
      .select('name, age, gender, bio')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      setStatus('error')
      return
    }
    setProfile(data)
    setStatus('ready')
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  // Returns an error message, or null when the profile was saved.
  async function save(values: Profile) {
    const query = profile
      ? supabase.from('profiles').update(values).eq('user_id', userId)
      : supabase.from('profiles').insert(values)
    const { error } = await query
    if (error) return 'Could not save your profile. Check your connection and try again.'
    setProfile(values)
    return null
  }

  return <ProfileContext value={{ profile, status, reload: load, save }}>{children}</ProfileContext>
}

export function useOwnProfile() {
  const value = useContext(ProfileContext)
  if (!value) throw new Error('useOwnProfile must be used inside ProfileProvider')
  return value
}
