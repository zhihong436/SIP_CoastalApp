import { Navigate, Route, Routes } from 'react-router-dom'
import { SignInPage } from '../features/auth/SignInPage'
import { ProfileCardPreviewPage } from '../features/profiles/ProfileCardPreviewPage'

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/preview/profile-card" element={<ProfileCardPreviewPage />} />
      <Route path="*" element={<Navigate to="/sign-in" replace />} />
    </Routes>
  )
}
