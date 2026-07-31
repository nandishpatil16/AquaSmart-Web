import React, { useState, useEffect } from 'react';
import { database, ref, onValue, set, remove, isFirebaseConfigured } from '../firebase';
import { Sun, Moon, Trash2 } from 'lucide-react';

export default function SettingsView({ theme, toggleTheme }) {
  const [saved, setSaved] = useState(false);
  const [capacity, setCapacity] = useState(500);
  const [height, setHeight] = useState(110);
  const [lowAlert, setLowAlert] = useState(20);

  useEffect(() => {
    if (isFirebaseConfigured) {
      const settingsRef = ref(database, 'settings');
      const unsubscribe = onValue(settingsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          if (data.capacity) setCapacity(data.capacity);
          if (data.height) setHeight(data.height);
          if (data.lowAlert) setLowAlert(data.lowAlert);
        }
      });
      return () => unsubscribe();
    }
  }, []);

  const handleSave = () => {
    if (isFirebaseConfigured) {
      set(ref(database, 'settings'), {
        capacity: Number(capacity),
        height: Number(height),
        lowAlert: Number(lowAlert)
      });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000); // hide after 3s
  };

  const handleResetAnalytics = () => {
    if (isFirebaseConfigured && window.confirm("Are you sure you want to clear all historical analytics data? This cannot be undone.")) {
      remove(ref(database, 'analytics'));
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Configure tank parameters and alerts.</p>
      </div>

      <div className="card" style={{maxWidth: '600px'}}>
        <h2>System Configuration</h2>
        
        <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem'}}>
          
          {/* Theme Toggle */}
          <div>
            <label style={{display:'block', marginBottom: '0.5rem', color: 'var(--text-muted)'}}>Theme Preference</label>
            <button onClick={toggleTheme} style={{
              width: '100%', padding: '0.8rem', borderRadius: '8px', 
              border: '1px solid var(--border-color)', background: 'var(--bg-color)', 
              color: 'var(--text-main)', cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: '0.5rem'
            }}>
              {theme === 'dark' ? <><Moon size={20} /> Dark Mode</> : <><Sun size={20} /> Light Mode</>}
            </button>
          </div>

          <div>
            <label style={{display:'block', marginBottom: '0.5rem', color: 'var(--text-muted)'}}>Tank Capacity (Liters)</label>
            <input 
              type="number" 
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              style={{width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-main)'}}
            />
          </div>

          <div>
            <label style={{display:'block', marginBottom: '0.5rem', color: 'var(--text-muted)'}}>Tank Height (cm)</label>
            <input 
              type="number" 
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              style={{width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-main)'}}
            />
          </div>
          
          <div>
            <label style={{display:'block', marginBottom: '0.5rem', color: 'var(--text-muted)'}}>Low Water Alert Threshold (%)</label>
            <input 
              type="number" 
              value={lowAlert}
              onChange={(e) => setLowAlert(e.target.value)}
              style={{width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-main)'}}
            />
          </div>

          <div style={{display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem'}}>
            <button onClick={handleSave} style={{
              padding: '1rem 2rem', 
              background: 'var(--primary)', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600'
            }}>Save Configuration</button>
            {saved && <span style={{color: 'var(--accent-green)', fontWeight: '600'}}>✓ Settings Saved!</span>}
          </div>
        </div>
      </div>

      <div className="card" style={{maxWidth: '600px', marginTop: '2rem', border: '1px solid var(--accent-red)'}}>
        <h2 style={{color: 'var(--accent-red)'}}>Danger Zone</h2>
        <p style={{fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem'}}>Irreversible actions for your system.</p>
        <button onClick={handleResetAnalytics} style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.8rem 1.5rem', background: 'transparent', color: 'var(--accent-red)',
          border: '1px solid var(--accent-red)', borderRadius: '8px', cursor: 'pointer'
        }}>
          <Trash2 size={18} /> Reset Analytics Data
        </button>
      </div>
    </div>
  );
}
