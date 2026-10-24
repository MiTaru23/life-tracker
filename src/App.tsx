import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import TodayPage from './pages/TodayPage'
import JournalPage from './pages/JournalPage'
import TrackerPage from './pages/TrackerPage'
import SuggestionsPage from './pages/SuggestionsPage'
import StatsPage from './pages/StatsPage'
import SettingsPage from './pages/SettingsPage'

const NAV = [
  { to: '/', label: 'Today', icon: '☀️' },
  { to: '/journal', label: 'Journal', icon: '📓' },
  { to: '/tracker', label: 'Tracker', icon: '✅' },
  { to: '/suggestions', label: 'For you', icon: '💡' },
  { to: '/stats', label: 'Stats', icon: '📈' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function App() {
  return (
    // HashRouter: works on static hosting (GitHub Pages) without server rewrites.
    <HashRouter>
      <div className="shell">
        <nav className="nav">
          <div className="brand">Life</div>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="nav-link">
              <span className="nav-icon" aria-hidden>{n.icon}</span>
              <span className="nav-label">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/journal" element={<JournalPage />} />
            <Route path="/tracker" element={<TrackerPage />} />
            <Route path="/suggestions" element={<SuggestionsPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
