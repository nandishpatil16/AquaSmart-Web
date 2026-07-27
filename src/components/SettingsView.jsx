import React, { useState } from 'react';

export default function SettingsView() {
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000); // hide after 3s
  };

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Configure tank parameters and alerts.</p>
      </div>

      <div className="card" style={{maxWidth: '600px'}}>
        <h2>Tank Configuration</h2>
        
        <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem'}}>
          <div>
            <label style={{display:'block', marginBottom: '0.5rem', color: 'var(--text-muted)'}}>Tank Capacity (Liters)</label>
            <input 
              type="number" 
              defaultValue="1000" 
              style={{width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-main)'}}
            />
          </div>

          <div>
            <label style={{display:'block', marginBottom: '0.5rem', color: 'var(--text-muted)'}}>Tank Height (cm)</label>
            <input 
              type="number" 
              defaultValue="150" 
              style={{width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-main)'}}
            />
          </div>
          
          <div>
            <label style={{display:'block', marginBottom: '0.5rem', color: 'var(--text-muted)'}}>Low Water Alert Threshold (%)</label>
            <input 
              type="number" 
              defaultValue="20" 
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
    </div>
  );
}
