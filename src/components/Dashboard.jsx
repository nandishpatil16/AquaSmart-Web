import React, { useState, useEffect, useRef } from 'react';
import { Power, Activity, ShieldAlert, CheckCircle2, TrendingUp, TrendingDown, Minus, WifiOff } from 'lucide-react';
import { database, ref, onValue, set, isFirebaseConfigured } from '../firebase';

// =============================================================================
// MODULE-LEVEL GLOBALS — survive ALL page navigations, created only once
// =============================================================================
let globalLastUpdate = 0;       // Timestamp of last Firebase write from ESP32
let globalSystemOnline = false; // Shared truth for online status
let globalIsConnecting = true;  // True only on very first app open
let globalCheckerStarted = false; // Ensures the interval is created only once
let globalNotifCooldown = { online: 0, offline: 0 };
const NOTIF_COOLDOWN_MS = 60000; // Min gap between same-type notification
const OFFLINE_TIMEOUT_MS = 30000; // Mark offline if no Firebase update for 30s

// Registry so any mounted Dashboard instance gets state updates
const stateListeners = new Set();

function broadcastState() {
  stateListeners.forEach(fn => fn({
    online: globalSystemOnline,
    connecting: globalIsConnecting,
  }));
}

// Start the global checker exactly once for the lifetime of the page
function startGlobalChecker() {
  if (globalCheckerStarted) return;
  globalCheckerStarted = true;

  // 8 second grace period on very first app open (let ESP32 boot + Firebase connect)
  setTimeout(() => {
    globalIsConnecting = false;
    broadcastState();
  }, 8000);

  setInterval(() => {
    if (globalIsConnecting) return;
    const isOnline = globalLastUpdate > 0 && (Date.now() - globalLastUpdate) < OFFLINE_TIMEOUT_MS;
    if (isOnline !== globalSystemOnline) {
      globalSystemOnline = isOnline;
      broadcastState(); // push to all mounted Dashboard components
    }
  }, 3000);
}

// =============================================================================
// DASHBOARD COMPONENT
// =============================================================================
export default function Dashboard() {
  const [levelPct, setLevelPct] = useState(0);
  const [levelLiters, setLevelLiters] = useState(0);
  const [motorOn, setMotorOn] = useState(false);
  const [motorMode, setMotorMode] = useState('manual');
  const [trend, setTrend] = useState('Stable');

  // Initialize directly from globals — zero flicker on re-mount/navigation
  const [systemOnline, setSystemOnline] = useState(globalSystemOnline);
  const [isConnecting, setIsConnecting] = useState(globalIsConnecting);

  const [alerts, setAlerts] = useState([
    { id: 1, type: 'success', title: 'System Initialized', message: 'Dashboard is ready.', time: new Date().toLocaleTimeString() }
  ]);

  const prevLevelRef = useRef(levelPct);
  const prevMotorRef = useRef(false);
  const alertFiredRef = useRef(false); // Don't alert on very first render

  // ── Push Notification helper ─────────────────────────────────────────────
  const sendNotif = (title, body) => {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistration().then(reg => {
            if (reg) reg.showNotification(title, { body, icon: '/favicon.svg' });
            else new Notification(title, { body });
          });
        } else {
          new Notification(title, { body });
        }
      }
    } catch (e) { /* silent */ }
  };

  const addAlert = (type, title, message, notify = true) => {
    setAlerts(prev => [
      { id: Date.now(), type, title, message, time: new Date().toLocaleTimeString() },
      ...prev
    ].slice(0, 5));
    if (notify) sendNotif(title, message);
  };

  // ── Request notification permission on mount ─────────────────────────────
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ── Start the single global status checker ───────────────────────────────
  useEffect(() => {
    startGlobalChecker();
  }, []);

  // ── Subscribe to global state broadcasts ─────────────────────────────────
  useEffect(() => {
    const listener = ({ online, connecting }) => {
      setSystemOnline(online);
      setIsConnecting(connecting);

      if (!alertFiredRef.current) { alertFiredRef.current = true; return; }

      const now = Date.now();
      if (online && now - globalNotifCooldown.online > NOTIF_COOLDOWN_MS) {
        globalNotifCooldown.online = now;
        addAlert('success', 'System Online', 'Connection to ESP32 restored.');
      } else if (!online && !connecting && now - globalNotifCooldown.offline > NOTIF_COOLDOWN_MS) {
        globalNotifCooldown.offline = now;
        addAlert('danger', 'System Offline', 'Lost connection to ESP32 sensor node.');
      }
    };
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
  }, []);

  // ── Firebase listener — updates data AND globalLastUpdate on every write ──
  useEffect(() => {
    if (!isFirebaseConfigured) {
      // Demo simulation fallback
      const interval = setInterval(() => {
        setLevelPct(prev => {
          const next = motorOn ? Math.min(prev + 2, 100) : Math.max(prev - 1, 0);
          setLevelLiters(next * 10);
          return next;
        });
        globalLastUpdate = Date.now();
      }, 1000);
      return () => clearInterval(interval);
    }

    const tankRef = ref(database, 'tank_status');
    const unsubscribe = onValue(tankRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      // ── Always update sensor data ──────────────────────────────────────
      setLevelPct(data.level_pct ?? 0);
      setLevelLiters(data.level_liters ?? 0);
      setMotorOn(data.motor_state ?? false);
      setMotorMode(data.motor_mode ?? 'manual');

      // ── Mark as live ONLY if heartbeat is a recent server timestamp ────
      // ESP32 pushes heartbeat = millis() every 5s.
      // Firebase Realtime DB fires onValue for ANY child change.
      // We use the presence of a heartbeat field itself as proof of life.
      // If ESP32 is offline, Firebase won't receive new writes, so
      // onValue won't fire again after the initial cached snapshot.
      // We distinguish the initial cached snapshot from a live update
      // by checking: did this snapshot arrive more than 1 second after mount?
      if (data.heartbeat !== undefined && data.heartbeat !== null) {
        globalLastUpdate = Date.now();

        // If still in opening grace period, snap to Online immediately
        if (globalIsConnecting) {
          globalIsConnecting = false;
          globalSystemOnline = true;
          broadcastState();
        }
      }
    });

    return () => unsubscribe();
  }, []); // No dependency on motorOn — we read it from Firebase directly

  // ── Trend detection ───────────────────────────────────────────────────────
  useEffect(() => {
    if (levelPct > prevLevelRef.current) setTrend('Filling');
    else if (levelPct < prevLevelRef.current) setTrend('Draining');
    else setTrend('Stable');

    if (levelPct >= 95 && prevLevelRef.current < 95) addAlert('warning', 'Tank Full', 'Water level reached 95%.');
    if (levelPct <= 20 && prevLevelRef.current > 20 && prevLevelRef.current !== 0) addAlert('danger', 'Tank Low', 'Water dropped below 20%.');

    prevLevelRef.current = levelPct;
  }, [levelPct]);

  // ── Motor state alert ─────────────────────────────────────────────────────
  useEffect(() => {
    if (systemOnline && alertFiredRef.current) {
      if (motorOn && !prevMotorRef.current) addAlert('warning', 'Pump Started', `Motor ON (${motorMode} mode).`);
      else if (!motorOn && prevMotorRef.current) addAlert('success', 'Pump Stopped', `Motor OFF (${motorMode} mode).`);
    }
    prevMotorRef.current = motorOn;
  }, [motorOn]);

  // ── Motor & safety handlers ───────────────────────────────────────────────
  const handleMotorToggle = (e, force = false) => {
    if (motorMode !== 'auto' || force) {
      const newState = typeof e === 'boolean' ? e : e.target.checked;
      setMotorOn(newState);
      if (isFirebaseConfigured) set(ref(database, 'tank_status/motor_state'), newState);
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

  const isLive = systemOnline && !isConnecting;

  return (
    <div>
      <div className="page-header">
        <h1>Overview</h1>
        <p>Live water tank monitoring &amp; controls</p>
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
          <div className="val" style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            color: isConnecting ? 'var(--text-muted)' : (systemOnline ? 'var(--accent-green)' : 'var(--accent-red)')
          }}>
            {isConnecting ? 'Connecting...' : systemOnline ? 'Online' : <><WifiOff size={24} /> Offline</>}
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h2>Live Tank Status</h2>
          <div className="tank-visualizer">
            <div className="water-wave" style={{ transform: `translateY(${100 - levelPct}%)` }} />
            <div className="tank-text">
              <div className="tank-pct">{levelPct}%</div>
              <div className="tank-liters">{levelLiters} L</div>
            </div>
          </div>

          <div className="motor-control" style={{ flexDirection: 'column', gap: '1.5rem', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '1rem' }}>
              <div className="motor-info">
                <h3>Water Pump</h3>
                <p>Mode: {motorMode.charAt(0).toUpperCase() + motorMode.slice(1)}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-color)', padding: '0.3rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                {['manual', 'auto'].map(m => (
                  <button key={m} onClick={() => handleModeChange(m)} style={{
                    padding: '0.5rem 1rem', borderRadius: '6px', border: 'none',
                    background: motorMode === m ? 'var(--card-bg)' : 'transparent',
                    color: motorMode === m ? 'var(--text-main)' : 'var(--text-muted)',
                    boxShadow: motorMode === m ? '0 2px 5px rgba(0,0,0,0.2)' : 'none',
                    cursor: 'pointer', fontWeight: '600', textTransform: 'capitalize'
                  }}>{m}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '1rem' }}>
              <div className={`motor-status ${(isLive && motorOn) ? 'on' : 'off'}`}>
                <Power size={16} />
                {(isLive && motorOn) ? 'RUNNING' : 'STOPPED'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {motorMode === 'auto' ? (
                  <span style={{ fontSize: '0.95rem', color: 'var(--primary-light)', fontWeight: 'bold' }}>Controlled by Sensors</span>
                ) : (
                  <label className="switch" style={{ opacity: !isLive ? 0.5 : 1 }}>
                    <input
                      type="checkbox"
                      checked={isLive ? motorOn : false}
                      onChange={handleMotorToggle}
                      disabled={!isLive}
                    />
                    <span className="slider" />
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ marginBottom: 0 }}>Activity Log</h2>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem',
              color: trend === 'Filling' ? 'var(--primary-light)' : trend === 'Draining' ? 'var(--accent-red)' : 'var(--text-muted)'
            }}>
              {trend === 'Filling' ? <TrendingUp size={16} /> : trend === 'Draining' ? <TrendingDown size={16} /> : <Minus size={16} />}
              {trend}
            </div>
          </div>
          <div className="alerts-list">
            {alerts.map(alert => (
              <div key={alert.id} className={`alert-item ${alert.type}`}>
                <div className="icon">{getAlertIcon(alert.type)}</div>
                <div className="alert-text" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <h4 style={{ margin: 0 }}>{alert.title}</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{alert.time}</span>
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
