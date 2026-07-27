import React, { useState, useEffect, useRef } from 'react';
import { Droplets, Power, Activity, ShieldAlert, CheckCircle2, TrendingUp, TrendingDown, Minus, WifiOff } from 'lucide-react';
import { database, ref, onValue, set, isFirebaseConfigured } from '../firebase'; 

export default function Dashboard() {
  const [levelPct, setLevelPct] = useState(0);
  const [levelLiters, setLevelLiters] = useState(0);
  const [motorOn, setMotorOn] = useState(false);
  const [motorMode, setMotorMode] = useState('manual');
  const [trend, setTrend] = useState('Stable');
  
  // Systematic States
  const [lastUpdate, setLastUpdate] = useState(0); // Start at 0 so it's initially offline
  const [systemOnline, setSystemOnline] = useState(false);
  const [alerts, setAlerts] = useState([
    { id: 1, type: 'success', title: 'System Initialized', message: 'Dashboard is ready.', time: new Date().toLocaleTimeString() }
  ]);

  const prevLevelRef = useRef(0);
  const prevMotorRef = useRef(false);

  const addAlert = (type, title, message) => {
    setAlerts(prev => [{ id: Date.now(), type, title, message, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 5));
    
    // Trigger mobile/desktop push notification
    if (Notification.permission === 'granted') {
      new Notification(title, { body: message, icon: '/favicon.svg' });
    }
  };

  // Request Notification Permissions on load
  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, []);

  // Check System Online Status
  useEffect(() => {
    const checker = setInterval(() => {
      const isOnline = (Date.now() - lastUpdate) < 15000; // 15 seconds without update = offline
      if (systemOnline !== isOnline) {
        setSystemOnline(isOnline);
        if (!isOnline) addAlert('danger', 'System Offline', 'Lost connection to ESP32 sensor node.');
        else addAlert('success', 'System Online', 'Connection to ESP32 restored.');
      }
    }, 2000);
    return () => clearInterval(checker);
  }, [lastUpdate, systemOnline]);

  // Determine trend based on previous level
  useEffect(() => {
    if (levelPct > prevLevelRef.current) setTrend('Filling');
    else if (levelPct < prevLevelRef.current) setTrend('Draining');
    else setTrend('Stable');
    
    // Alert logic for levels
    if (levelPct >= 95 && prevLevelRef.current < 95) addAlert('warning', 'Tank Full', 'Water reached 95% capacity.');
    if (levelPct <= 20 && prevLevelRef.current > 20) addAlert('danger', 'Tank Low', 'Water dropped below 20% capacity.');
    
    prevLevelRef.current = levelPct;
  }, [levelPct]);

  // Alert logic for Motor
  useEffect(() => {
    if (systemOnline) {
      if (motorOn && !prevMotorRef.current) addAlert('warning', 'Pump Started', `Motor turned ON (${motorMode} mode).`);
      else if (!motorOn && prevMotorRef.current) addAlert('success', 'Pump Stopped', `Motor turned OFF (${motorMode} mode).`);
    }
    prevMotorRef.current = motorOn;
  }, [motorOn, motorMode, systemOnline]);

  const prevHeartbeatRef = useRef(null);

  // Real Firebase Integration or Fallback Simulation
  useEffect(() => {
    if (isFirebaseConfigured) {
      // Connect to Firebase
      const tankRef = ref(database, 'tank_status');
      const unsubscribe = onValue(tankRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setLevelPct(data.level_pct || 0);
          setLevelLiters(data.level_liters || 0);
          setMotorOn(data.motor_state || false);
          setMotorMode(data.motor_mode || 'manual');
          
          // ESP32 sends millis() which is a small number. 
          // We must check if the heartbeat changed to know it's alive.
          if (data.heartbeat && data.heartbeat !== prevHeartbeatRef.current) {
            prevHeartbeatRef.current = data.heartbeat;
            setLastUpdate(Date.now()); // Set current web time!
          }
        }
      });
      return () => unsubscribe();
    } else {
      // Fallback: Demonstration Simulation Logic
      const interval = setInterval(() => {
        setLevelPct((prev) => {
          let next = prev;
          if (motorOn) next += 2; // pump filling
          else next -= 1; // normal usage draining
          
          if (next > 100) next = 100;
          if (next < 0) next = 0;
          
          setLevelLiters(next * 10); // assuming 1000L capacity
          return next;
        });
        setLastUpdate(Date.now()); // ping
      }, 1000); 
      return () => clearInterval(interval);
    }
  }, [motorOn]); 

  // Handle Safety and Auto Mode Logic (Works for both Firebase & Fallback)
  useEffect(() => {
    // Universal Safety Stop: Always stop at 95% regardless of mode
    if (levelPct >= 95 && motorOn) {
      handleMotorToggle({ target: { checked: false } }, true); // Force stop pump
    } 
    // Auto Mode Start: Only start at 20% if in Auto Mode
    else if (motorMode === 'auto' && levelPct <= 20 && !motorOn) {
      handleMotorToggle({ target: { checked: true } }, true); // Auto start pump
    }
  }, [levelPct, motorMode, motorOn]);

  const handleMotorToggle = (e, force = false) => {
    if (motorMode !== 'auto' || force) {
      const newState = e.target.checked;
      setMotorOn(newState);
      if (isFirebaseConfigured) {
        set(ref(database, 'tank_status/motor_state'), newState);
      }
    }
  };

  const handleModeChange = (mode) => {
    setMotorMode(mode);
    if (isFirebaseConfigured) {
      set(ref(database, 'tank_status/motor_mode'), mode);
    }
  };

  const getAlertIcon = (type) => {
    if (type === 'success') return <CheckCircle2 color="var(--accent-green)" />;
    if (type === 'danger') return <ShieldAlert color="var(--accent-red)" />;
    if (type === 'warning') return <Activity color="#ff9800" />;
    return <Activity />;
  };

  return (
    <div>
      <div className="page-header">
        <h1>Overview</h1>
        <p>Live water tank monitoring & controls</p>
      </div>

      <div className="stats-row">
        <div className="stat-box">
          <h4>Water Level</h4>
          <div className="val">{levelPct}%</div>
        </div>
        <div className="stat-box">
          <h4>Volume Remaining</h4>
          <div className="val">{levelLiters} L</div>
        </div>
        <div className="stat-box">
          <h4>System Status</h4>
          <div className="val" style={{display:'flex', alignItems:'center', gap:'0.5rem', color: systemOnline ? 'var(--accent-green)' : 'var(--accent-red)'}}>
            {systemOnline ? 'Online' : <><WifiOff size={24}/> Offline</>}
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        
        {/* Left Column: Tank & Motor */}
        <div className="card" style={{
          boxShadow: levelPct <= 20 ? 'inset 0 0 50px rgba(255, 75, 75, 0.1)' : levelPct >= 95 ? 'inset 0 0 50px rgba(0, 230, 118, 0.1)' : 'none',
          transition: 'box-shadow 0.5s ease',
          opacity: systemOnline ? 1 : 0.6 // Dim when offline
        }}>
          <h2>Live Tank Status</h2>
          
          <div className="tank-visualizer" style={{
            boxShadow: levelPct <= 20 ? '0 0 40px rgba(255, 75, 75, 0.2)' : levelPct >= 95 ? '0 0 40px rgba(0, 230, 118, 0.2)' : '0 0 40px rgba(0, 112, 243, 0.1)'
          }}>
            <div 
              className="water-wave" 
              style={{ transform: `translateY(${100 - levelPct}%)` }}
            ></div>
            <div className="tank-text">
              <div className="tank-pct">{levelPct}%</div>
              <div className="tank-liters">{levelLiters} L</div>
            </div>
          </div>

          <div className="motor-control" style={{flexDirection: 'column', gap: '1.5rem', alignItems: 'flex-start'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '1rem'}}>
              <div className="motor-info">
                <h3>Water Pump</h3>
                <p>Mode: {motorMode.charAt(0).toUpperCase() + motorMode.slice(1)}</p>
              </div>
              
              <div style={{display: 'flex', gap: '0.5rem', background: 'var(--bg-color)', padding: '0.3rem', borderRadius: '8px', border: '1px solid var(--border-color)'}}>
                <button 
                  onClick={() => handleModeChange('manual')}
                  style={{
                    padding: '0.5rem 1rem', 
                    borderRadius: '6px', 
                    border: 'none', 
                    background: motorMode === 'manual' ? 'var(--card-bg)' : 'transparent',
                    color: motorMode === 'manual' ? 'var(--text-main)' : 'var(--text-muted)',
                    boxShadow: motorMode === 'manual' ? '0 2px 5px rgba(0,0,0,0.2)' : 'none',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  Manual
                </button>
                <button 
                  onClick={() => handleModeChange('auto')}
                  style={{
                    padding: '0.5rem 1rem', 
                    borderRadius: '6px', 
                    border: 'none', 
                    background: motorMode === 'auto' ? 'var(--card-bg)' : 'transparent',
                    color: motorMode === 'auto' ? 'var(--text-main)' : 'var(--text-muted)',
                    boxShadow: motorMode === 'auto' ? '0 2px 5px rgba(0,0,0,0.2)' : 'none',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  Auto
                </button>
              </div>
            </div>
            
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '1rem'}}>
              <div className={`motor-status ${motorOn ? 'on' : 'off'}`}>
                <Power size={16} />
                {motorOn ? 'RUNNING' : 'STOPPED'}
              </div>
              
              <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
                {motorMode === 'auto' ? (
                  <span style={{fontSize: '0.95rem', color: 'var(--primary-light)', fontWeight: 'bold'}}>Controlled by Sensors</span>
                ) : (
                  <label className="switch" style={{opacity: !systemOnline ? 0.5 : 1}}>
                    <input 
                      type="checkbox" 
                      checked={systemOnline ? motorOn : false} 
                      onChange={handleMotorToggle}
                      disabled={!systemOnline}
                    />
                    <span className="slider"></span>
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Recent Activity */}
        <div className="card">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem'}}>
            <h2 style={{marginBottom: 0}}>Activity Log</h2>
            <div style={{display:'flex', alignItems:'center', gap:'0.5rem', color: trend === 'Filling' ? 'var(--primary-light)' : trend === 'Draining' ? 'var(--accent-red)' : 'var(--text-muted)', fontSize: '0.9rem'}}>
              {trend === 'Filling' ? <TrendingUp size={16} /> : trend === 'Draining' ? <TrendingDown size={16} /> : <Minus size={16} />}
              {trend}
            </div>
          </div>
          
          <div className="alerts-list">
            {alerts.map(alert => (
              <div key={alert.id} className={`alert-item ${alert.type}`}>
                <div className="icon">{getAlertIcon(alert.type)}</div>
                <div className="alert-text" style={{width: '100%'}}>
                  <div style={{display:'flex', justifyContent: 'space-between', gap: '1rem'}}>
                    <h4 style={{margin: 0}}>{alert.title}</h4>
                    <span style={{fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap'}}>{alert.time}</span>
                  </div>
                  <p>{alert.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
