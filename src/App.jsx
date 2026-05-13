import { Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Bracket from './pages/Bracket.jsx';
import Schedule from './pages/Schedule.jsx';
import Players from './pages/Players.jsx';
import Admin from './pages/Admin.jsx';

function Header() {
  const navItem = ({ isActive }) =>
    'nav-link' + (isActive ? ' nav-link-active' : '');
  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-ink-100">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img src="/brand/logo.png" alt="NASA International Schools" className="h-9 w-auto" />
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-brand-600">PS League</span>
            <span className="text-xs text-ink-500">FC26 Tournament</span>
          </div>
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={navItem}>Home</NavLink>
          <NavLink to="/bracket" className={navItem}>Bracket</NavLink>
          <NavLink to="/schedule" className={navItem}>Schedule</NavLink>
          <NavLink to="/players" className={navItem}>Players</NavLink>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  const location = useLocation();
  // Hide footer on admin to keep the focus tight
  if (location.pathname.startsWith('/admin')) return null;
  return (
    <footer className="mt-16 border-t border-ink-100 bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-ink-500">
        <div className="flex items-center gap-3">
          <img src="/brand/logo.png" alt="" className="h-7 w-auto opacity-80" />
          <span>NASA International Schools · PS League</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/admin" className="hover:text-brand-600">Admin</Link>
          <span className="text-ink-300">·</span>
          <span>Home of Visionaries</span>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/bracket" element={<Bracket />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/players" element={<Players />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-24 text-center">
      <h1 className="text-3xl font-bold text-ink-800">Page not found</h1>
      <p className="mt-2 text-ink-500">That route doesn't exist.</p>
      <Link to="/" className="btn-primary mt-6">Back to home</Link>
    </div>
  );
}
