import React, { useState, useEffect, useRef } from 'react';
import { Droplets, Power, Activity, ShieldAlert, CheckCircle2, TrendingUp, TrendingDown, Minus, WifiOff } from 'lucide-react';
import { database, ref, onValue, set, isFirebaseConfigured } from '../firebase'; 

// Global state to persist online status across page navigations
let globalLastUpdate = 0;
let globalSystemOnline = false;
let globalIsConnecting = true;
let globalLastHeartbeat = null;
let globalNotifCooldown = { online: 0, offline: 0 };
const NOTIF_COOLDOWN = 60000; // 60 second cooldown between same notification type

export default function Dashboard() {
  const [levelPct, setLevelPct] = useState(0);
  const [levelLiters, setLevelLiters] = useState(0);
  const [motorOn, setMotorOn] = useState(false);
  const [motorMode, setMotorMode] = useState('manual');
  const [trend, setTrend] = useState('Stable');
  
  // Init directly from globals — no flicker when navigating back!
  const [systemOnline, setSystemOnline] = useState(globalSystemOnline);
  const [isConnecting, setIsConnecting] = useState(globalIsConnecting);
  const [alerts, setAlerts] = useState([
    { id: 1, type: 'success', title: 'System Initialized', message: 'Dashboard is ready.', time: new Date().toLocaleTimeString() }
  ]);

  const prevLevelRef = useRef(0);
  const prevMotorRef = useRef(false);
  const isFirstLoad = useRef(true);
  const justMounted = useRef(true); // Prevents false-offline on navigation

  const addAlert = (type, title, message) => {
    setAlerts(prev => [{ id: Date.now(), type, title, message, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 5));
    
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body: message, icon: '/favicon.svg' });
      }
    } catch (e) {
      console.warn("Mobile notifications blocked or unsupported", e);
    }
  };

  // Request Notification Permissions on load
  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, []);

  // Online/offline status checker — runs every 3s
  useEffect(() => {
    // After navigation, give 2s before reading online state to let Firebase confirm heartbeat
    const mountTimer = setTimeout(() => { justMounted.current = false; }, 2000);

    // Grace period: only run once globally on very first app open
    if (globalIsConnecting) {
      setTimeout(() => {
        globalIsConnecting = false;
        setIsConnecting(false);
      }, 5000);
    }

    const checker = setInterval(() => {
      if (globalIsConnecting) return;
      if (justMounted.current) return; // Skip first ticks after navigation

      const isOnline = globalLastUpdate > 0 && (Date.now() - globalLastUpdate) < 45000;
      setSystemOnline(isOnline); // Sync local state

      if (isOnline !== globalSystemOnline) {
        globalSystemOnline = isOnline;
        if (!isFirstLoad.current) {
          const now = Date.now();
          if (isOnline && now - globalNotifCooldown.online > NOTIF_COOLDOWN) {
            globalNotifCooldown.online = now;
            addAlert('success', 'System Online', 'Connection to ESP32 restored.');
          } else if (!isOnline && now - globalNotifCooldown.offline > NOTIF_COOLDOWN) {
            globalNotifCooldown.offline = now;
            addAlert('danger', 'System Offline', 'Lost connection to ESP32 sensor node.');
          }
        }
      }
      isFirstLoad.current = false;
    }, 3000);
    return () => { clearInterval(checker); clearTimeout(mountTimer); };
  }, []);

  // Determine trend based on previous level
  useEffect(() => {
    if (levelPct > prevLevelRef.current) setTrend('Filling');
    else if (levelPct < prevLevelRef.current) setTrend('Draining');
    else setTrend('Stable');
    
    if (levelPct >= 95 && prevLevelRef.current < 95) addAlert('warning', 'Tank Full', 'Water reached 95% capacity.');
    if (levelPct <= 20 && prevLevelRef.current > 20) addAlert('danger', 'Tank Low', 'Water dropped below 20% capacity.');
    
    prevLevelRef.current = levelPct;
  }, [levelPct]);

  // Alert logic for Motor
  useEffect(() => {
    if (systemOnline && !isFirstLoad.current) {
      if (motorOn && !prevMotorRef.current) addAlert('warning', 'Pump Started', `Motor turned ON (${motorMode} mode).`);
      else if (!motorOn && prevMotorRef.current) addAlert('success', 'Pump Stopped', `Motor turned OFF (${motorMode} mode).`);
    }
    prevMotorRef.current = motorOn;
  }, [motorOn, motorMode, systemOnline]);

  // Real Firebase Integration or Fallback Simulation
  useEffect(() => {
    if (isFirebaseConfigured) {
      const tankRef = ref(database, 'tank_status');
      const unsubscribe = onValue(tankRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setLevelPct(data.level_pct || 0);
          setLevelLiters(data.level_liters || 0);
          setMotorOn(data.motor_state || false);
          setMotorMode(data.motor_mode || 'manual');
          
          // Only update lastUpdate if the heartbeat VALUE has changed.
          // This prevents stale cached Firebase data from marking ESP32 as Online!
          if (globalLastHeartbeat === null) {
            // Very first data load — memorize heartbeat but don't go online yet
            globalLastHeartbeat = data.heartbeat;
          } else if (data.heartbeat && data.heartbeat !== globalLastHeartbeat) {
            // Heartbeat changed = ESP32 is actively pushing new data!
            globalLastHeartbeat = data.heartbeat;
            globalLastUpdate = Date.now();
            
            // If still in grace period, snap to Online immediately
            if (globalIsConnecting) {
              globalIsConnecting = false;
              setIsConnecting(false);
              setSystemOnline(true);
              globalSystemOnline = true;
            }
          }
        }
      });
      return () => unsubscribe();
    } else {
      const interval = setInterval(() => {
        setLevelPct((prev) => {
          let next = motorOn ? Math.min(prev + 2, 100) : Math.max(prev - 1, 0);
          setLevelLiters(next * 10);
          return next;
        });
        globalLastUpdate = Date.now();
      }, 1000); 
      return () => clearInterval(interval);
    }
  }, [motorOn]); 

  // Handle Safety and Auto Mode Logic
  useEffect(() => {
    if (levelPct >= 95 && motorOn) {
      handleMotorToggle({ target: { checked: false } }, true);
    } else if (motorMode === 'auto' && levelPct <= 20 && !motorOn) {
      handleMotorToggle({ target: { checked: true } }, true);
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
      if (mode === 'auto') {
        setMotorOn(false);
        set(ref(database, 'tank_status/motor_state'), false);
      }
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
          <div className="val" style={{display:'flex', alignItems:'center', gap:'0.5rem', color: isConnecting ? 'var(--text-muted)' : (systemOnline ? 'var(--accent-green)' : 'var(--accent-red)')}}>
            {isConnecting ? 'Connecting...' : (systemOnline ? 'Online' : <><WifiOff size={24}/> Offline</>)}
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h2>Live Tank Status</h2>
          <div className="tank-visualizer">
            <div className="water-wave" style={{ transform: `translateY(${100 - levelPct}%)` }}></div>
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
                <button onClick={() => handleModeChange('manual')} style={{padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: motorMode === 'manual' ? 'var(--card-bg)' : 'transparent', color: motorMode === 'manual' ? 'var(--text-main)' : 'var(--text-muted)', boxShadow: motorMode === 'manual' ? '0 2px 5px rgba(0,0,0,0.2)' : 'none', cursor: 'pointer', fontWeight: '600'}}>Manual</button>
                <button onClick={() => handleModeChange('auto')} style={{padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: motorMode === 'auto' ? 'var(--card-bg)' : 'transparent', color: motorMode === 'auto' ? 'var(--text-main)' : 'var(--text-muted)', boxShadow: motorMode === 'auto' ? '0 2px 5px rgba(0,0,0,0.2)' : 'none', cursor: 'pointer', fontWeight: '600'}}>Auto</button>
              </div>
            </div>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '1rem'}}>
              <div className={`motor-status ${(systemOnline && motorOn && !isConnecting) ? 'on' : 'off'}`}>
                <Power size={16} />
                {(systemOnline && motorOn && !isConnecting) ? 'RUNNING' : 'STOPPED'}
              </div>
              <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
                {motorMode === 'auto' ? (
                  <span style={{fontSize: '0.95rem', color: 'var(--primary-light)', fontWeight: 'bold'}}>Controlled by Sensors</span>
                ) : (
                  <label className="switch" style={{opacity: !systemOnline ? 0.5 : 1}}>
                    <input type="checkbox" checked={(systemOnline && !isConnecting) ? motorOn : false} onChange={handleMotorToggle} disabled={!systemOnline || isConnecting}/>
                    <span className="slider"></span>
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>

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
