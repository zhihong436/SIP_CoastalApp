import { NavLink, Outlet } from 'react-router-dom'
import { ChatsIcon, DiscoverIcon, MeIcon } from '../components/Icons'

// Discover, Chats and Me share one tab bar. Focused views such as a conversation sit outside it.
export function TabLayout() {
  return (
    <div className="shell">
      <div className="shell__main">
        <Outlet />
      </div>
      <nav className="tabs" aria-label="Main">
        <NavLink to="/discover" className="tabs__link">
          <DiscoverIcon size={24} />
          Discover
        </NavLink>
        <NavLink to="/chats" className="tabs__link">
          <ChatsIcon size={24} />
          Chats
        </NavLink>
        <NavLink to="/me" className="tabs__link">
          <MeIcon size={24} />
          Me
        </NavLink>
      </nav>
    </div>
  )
}
