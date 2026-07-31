import React, { useState, useEffect } from 'react';
import { database, ref, onValue, isFirebaseConfigured } from '../firebase';
import { Power, Timer, Droplets } from 'lucide-react';

export default function MotorHistory() {
  const [history, setHistory] = useState([]);
  const [liveStatus, setLiveStatus] = useState(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    // Timer to update live duration every second
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isFirebaseConfigured) {
      const historyRef = ref(database, 'motor_history');
      const unsubsHistory = onValue(historyRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const formattedData = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          })).sort((a, b) => b.timestamp - a.timestamp); // Sort newest first
          setHistory(formattedData);
        } else {
          setHistory([]);
        }
      });
      
      const statusRef = ref(database, 'tank_status');
      const unsubsStatus = onValue(statusRef, (snapshot) => {
        setLiveStatus(snapshot.val());
      });
      
      return () => { unsubsHistory(); unsubsStatus(); };
    }
  }, []);

  const formatDuration = (ms) => {
    if (!ms) return 'Unknown';
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}m ${s}s`;
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div>
      <div className="page-header">
        <h1>Motor History</h1>
        <p>Record of automatic and manual pump cycles.</p>
      </div>

      <div className="card">
        {liveStatus && liveStatus.motor_state && liveStatus.cycle_start_time && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'rgba(0, 112, 243, 0.05)', padding: '1.5rem', borderRadius: '12px',
            border: '2px solid var(--primary-light)', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem',
            animation: 'pulse 2s infinite'
          }}>
            <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
              <div style={{ background: 'var(--primary)', padding: '1rem', borderRadius: '50%', color: '#fff' }}>
                <Droplets size={24} />
              </div>
              <div>
                <h4 style={{margin: '0 0 0.3rem 0', fontSize: '1.1rem', color: 'var(--primary-light)'}}>Pump is Running...</h4>
                <span style={{color: 'var(--text-muted)', fontSize: '0.9rem'}}>Live Tracker</span>
              </div>
            </div>
            
            <div style={{display: 'flex', gap: '2rem', flexWrap: 'wrap'}}>
              <div style={{textAlign: 'center'}}>
                <span style={{color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block'}}>Live Duration</span>
                <strong style={{fontSize: '1.2rem', color: 'var(--primary-light)'}}>
                  {formatDuration(currentTime - liveStatus.cycle_start_time)}
                </strong>
              </div>
              <div style={{textAlign: 'center'}}>
                <span style={{color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block'}}>Started At</span>
                <strong style={{fontSize: '1.2rem', color: 'var(--accent-red)'}}>{liveStatus.cycle_start_pct || 0}%</strong>
              </div>
              <div style={{textAlign: 'center'}}>
                <span style={{color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block'}}>Current Level</span>
                <strong style={{fontSize: '1.2rem', color: 'var(--primary-light)'}}>{liveStatus.level_pct || 0}%</strong>
              </div>
              <div style={{textAlign: 'center'}}>
                <span style={{color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block'}}>Live Fill</span>
                <strong style={{fontSize: '1.2rem', color: 'var(--accent-green)'}}>+{(liveStatus.level_pct || 0) - (liveStatus.cycle_start_pct || 0)}%</strong>
              </div>
            </div>
          </div>
        )}
        
        {history.length === 0 && (!liveStatus || !liveStatus.motor_state) ? (
          <div style={{textAlign: 'center', padding: '3rem', color: 'var(--text-muted)'}}>
            <Power size={48} style={{opacity: 0.2, marginBottom: '1rem'}} />
            <h3>No History Yet</h3>
            <p>Motor cycles will be logged here automatically.</p>
          </div>
        ) : (
          <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
            {history.map(item => (
              <div key={item.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--bg-color)',
                padding: '1.5rem',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                flexWrap: 'wrap',
                gap: '1rem'
              }}>
                <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
                  <div style={{
                    background: 'rgba(0, 112, 243, 0.1)',
                    padding: '1rem',
                    borderRadius: '50%',
                    color: 'var(--primary)'
                  }}>
                    <Droplets size={24} />
                  </div>
                  <div>
                    <h4 style={{margin: '0 0 0.3rem 0', fontSize: '1.1rem'}}>Pump Cycle</h4>
                    <span style={{color: 'var(--text-muted)', fontSize: '0.9rem'}}>{formatTime(item.timestamp)}</span>
                  </div>
                </div>

                <div style={{display: 'flex', gap: '2rem', flexWrap: 'wrap'}}>
                  <div style={{textAlign: 'center'}}>
                    <span style={{color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block'}}>Duration</span>
                    <strong style={{fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center'}}>
                      <Timer size={16} color="var(--text-muted)"/> {formatDuration(item.duration_ms)}
                    </strong>
                  </div>
                  <div style={{textAlign: 'center'}}>
                    <span style={{color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block'}}>Started At</span>
                    <strong style={{fontSize: '1.2rem', color: 'var(--accent-red)'}}>{item.start_pct}%</strong>
                  </div>
                  <div style={{textAlign: 'center'}}>
                    <span style={{color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block'}}>Finished At</span>
                    <strong style={{fontSize: '1.2rem', color: 'var(--accent-green)'}}>{item.end_pct}%</strong>
                  </div>
                  <div style={{textAlign: 'center'}}>
                    <span style={{color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block'}}>Total Fill</span>
                    <strong style={{fontSize: '1.2rem', color: 'var(--primary-light)'}}>+{item.end_pct - item.start_pct}%</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
