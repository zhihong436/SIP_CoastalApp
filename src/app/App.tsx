import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../features/auth/AuthProvider'
import { SignInPage } from '../features/auth/SignInPage'
import { ChatsPage } from '../features/chat/ChatsPage'
import { ConversationPage } from '../features/chat/ConversationPage'
import { DiscoverPage } from '../features/discover/DiscoverPage'
import { LobbyPage } from '../features/trail/LobbyPage'
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
              <Route path="/discover" element={<DiscoverPage />} />
              <Route path="/chats" element={<ChatsPage />} />
              <Route path="/me" element={<MePage />} />
            </Route>
            <Route path="/chats/:matchId" element={<ConversationPage />} />
            <Route path="/chats/:matchId/trail" element={<LobbyPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    </AuthProvider>
  )
}
