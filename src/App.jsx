import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Droplets, LayoutDashboard, LineChart, Settings, History } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Analytics from './components/Analytics';
import SettingsView from './components/SettingsView';
import MotorHistory from './components/MotorHistory';

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
  const [theme, setTheme] = useState('dark');
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
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
  );
}

export default App;
