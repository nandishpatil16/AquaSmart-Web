import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Droplets, LayoutDashboard, LineChart, Settings, Sun, Moon, History } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Analytics from './components/Analytics';
import SettingsView from './components/SettingsView';
import MotorHistory from './components/MotorHistory';

function Sidebar({ theme, toggleTheme }) {
  const location = useLocation();

  return (
    <div className="sidebar">
      <div className="brand">
        <Droplets size={28} />
        AquaSmart
      </div>
      <div className="nav-links">
        <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
          <LayoutDashboard size={20} /> Dashboard
        </Link>
        <Link to="/analytics" className={`nav-link ${location.pathname === '/analytics' ? 'active' : ''}`}>
          <LineChart size={20} /> Analytics
        </Link>
        <Link to="/history" className={`nav-link ${location.pathname === '/history' ? 'active' : ''}`}>
          <History size={20} /> Motor History
        </Link>
        <Link to="/settings" className={`nav-link ${location.pathname === '/settings' ? 'active' : ''}`}>
          <Settings size={20} /> Settings
        </Link>
      </div>
      
      <div style={{marginTop: 'auto'}}>
        <button onClick={toggleTheme} className="nav-link" style={{width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left'}}>
          {theme === 'dark' ? <><Moon size={20} /> Dark Mode</> : <><Sun size={20} /> Light Mode</>}
        </button>
      </div>
    </div>
  );
}

function App() {
  const [theme, setTheme] = useState('dark');
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <BrowserRouter>
      <div className="app-container">
        <Sidebar theme={theme} toggleTheme={toggleTheme} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/history" element={<MotorHistory />} />
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
