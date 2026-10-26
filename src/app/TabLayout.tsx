import { NavLink, Outlet } from 'react-router-dom'

// Discover, Chats and Me share one tab bar. Focused views such as a conversation sit outside it.
export function TabLayout() {
  return (
    <div className="shell">
      <div className="shell__main">
        <Outlet />
      </div>
      <nav className="tabs" aria-label="Main">
        <NavLink to="/discover" className="tabs__link">
          Discover
        </NavLink>
        <NavLink to="/chats" className="tabs__link">
          Chats
        </NavLink>
        <NavLink to="/me" className="tabs__link">
          Me
        </NavLink>
      </nav>
    </div>
  )
}
