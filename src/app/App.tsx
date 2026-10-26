import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../features/auth/AuthProvider'
import { SignInPage } from '../features/auth/SignInPage'
import { MePage } from '../features/profiles/MePage'
import { ProfileSetupPage } from '../features/profiles/ProfileSetupPage'
import { RequireProfile, RequireSignIn } from './Guards'
import { TabLayout } from './TabLayout'

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route element={<RequireSignIn />}>
          <Route path="/profile/setup" element={<ProfileSetupPage />} />
          <Route element={<RequireProfile />}>
            <Route element={<TabLayout />}>
              <Route path="/discover" element={<main className="screen">Discover is coming next.</main>} />
              <Route path="/me" element={<MePage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    </AuthProvider>
  )
}
