import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Droplets, LayoutDashboard, LineChart, Settings, History } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Analytics from './components/Analytics';
import SettingsView from './components/SettingsView';
import MotorHistory from './components/MotorHistory';

const CustomSplashScreen = ({ onComplete }) => {
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const timer1 = setTimeout(() => {
      setOpacity(0);
    }, 1200);
    const timer2 = setTimeout(() => {
      onComplete();
    }, 1700);
    return () => { clearTimeout(timer1); clearTimeout(timer2); };
  }, [onComplete]);

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'var(--bg-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      opacity: opacity,
      transition: 'opacity 0.5s ease-out'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <Droplets color="#0070f3" size={80} strokeWidth={2} />
        <h1 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '2rem', fontWeight: 'bold', fontFamily: 'system-ui, sans-serif' }}>AquaSmart</h1>
      </div>
    </div>
  );
};

function Sidebar() {
  const location = useLocation();

  return (
    <div className="sidebar">
      <div className="brand">
        <Droplets size={28} />
        AquaSmart
      </div>
      <div className="nav-links">
        <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
          <LayoutDashboard size={20} /> <span className="nav-text">Dashboard</span>
        </Link>
        <Link to="/analytics" className={`nav-link ${location.pathname === '/analytics' ? 'active' : ''}`}>
          <LineChart size={20} /> <span className="nav-text">Analytics</span>
        </Link>
        <Link to="/history" className={`nav-link ${location.pathname === '/history' ? 'active' : ''}`}>
          <History size={20} /> <span className="nav-text">History</span>
        </Link>
        <Link to="/settings" className={`nav-link ${location.pathname === '/settings' ? 'active' : ''}`}>
          <Settings size={20} /> <span className="nav-text">Settings</span>
        </Link>
      </div>
    </div>
  );
}

function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });
  const [showSplash, setShowSplash] = useState(true);
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <>
      {showSplash && <CustomSplashScreen onComplete={() => setShowSplash(false)} />}
      <BrowserRouter>
      <div className="mobile-header">
        <Droplets size={24} />
        AquaSmart
      </div>
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/history" element={<MotorHistory />} />
            <Route path="/settings" element={<SettingsView theme={theme} toggleTheme={toggleTheme} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
    </>
  );
}

export default App;
