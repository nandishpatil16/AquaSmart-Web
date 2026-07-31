import React, { useState, useEffect, useRef } from 'react';
import { Power, Activity, ShieldAlert, CheckCircle2, TrendingUp, TrendingDown, Minus, WifiOff } from 'lucide-react';
import { database, ref, onValue, set, isFirebaseConfigured } from '../firebase';

// =============================================================================
// MODULE-LEVEL GLOBALS — survive ALL page navigations, never reset on re-mount
// =============================================================================
let globalLastUpdate    = 0;       // Timestamp when we last confirmed ESP is LIVE
let globalSystemOnline  = false;   // Cached online status
let globalIsConnecting  = true;    // True only on very first app open
let globalCheckerStarted = false;
let globalNotifCooldown = { online: 0, offline: 0 };

// Cache sensor values — survive navigation, prevents 0-flash
let globalLevelPct    = 0;
let globalLevelLiters = 0;
let globalMotorOn     = false;
let globalMotorMode   = 'manual';

// Online = heartbeat server timestamp is within this window of Date.now()
const OFFLINE_TIMEOUT_MS  = 45000;
const NOTIF_COOLDOWN_MS   = 60000;

// Registry — push state changes to all mounted Dashboard instances
const stateListeners = new Set();
function broadcastState() {
  stateListeners.forEach(fn => fn({ online: globalSystemOnline, connecting: globalIsConnecting }));
}

// Start the global checker ONCE per browser session
function startGlobalChecker() {
  if (globalCheckerStarted) return;
  globalCheckerStarted = true;

  // 10s grace on first app open
  setTimeout(() => {
    globalIsConnecting = false;
    broadcastState();
  }, 10000);

  setInterval(() => {
    if (globalIsConnecting) return;
    const isOnline = globalLastUpdate > 0 && (Date.now() - globalLastUpdate) < OFFLINE_TIMEOUT_MS;
    if (isOnline !== globalSystemOnline) {
      globalSystemOnline = isOnline;
      broadcastState();
    }
  }, 3000);
}

// =============================================================================
// DASHBOARD COMPONENT
// =============================================================================
export default function Dashboard() {
  const [levelPct,    setLevelPct]    = useState(globalLevelPct);
  const [levelLiters, setLevelLiters] = useState(globalLevelLiters);
  const [motorOn,     setMotorOn]     = useState(globalMotorOn);
  const [motorMode,   setMotorMode]   = useState(globalMotorMode);
  const [trend,       setTrend]       = useState('Stable');
  const [systemOnline, setSystemOnline] = useState(globalSystemOnline);
  const [isConnecting, setIsConnecting] = useState(globalIsConnecting);
  const [alerts, setAlerts] = useState([
    { id: 1, type: 'success', title: 'System Initialized', message: 'Dashboard ready.', time: new Date().toLocaleTimeString() }
  ]);

  const prevLevelRef  = useRef(globalLevelPct);
  const prevMotorRef  = useRef(globalMotorOn);
  const firstRender   = useRef(true);

  // ── Notification helper ──────────────────────────────────────────────────
  const sendNotif = (title, body) => {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.svg' });
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

  // ── Request notification permission ──────────────────────────────────────
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    startGlobalChecker();
  }, []);

  // ── Subscribe to global online/offline broadcasts ─────────────────────────
  useEffect(() => {
    const listener = ({ online, connecting }) => {
      setSystemOnline(online);
      setIsConnecting(connecting);
      if (firstRender.current) { firstRender.current = false; return; }
      const now = Date.now();
      if (online && now - globalNotifCooldown.online > NOTIF_COOLDOWN_MS) {
        globalNotifCooldown.online = now;
        addAlert('success', 'System Online', 'ESP32 connection restored.');
      } else if (!online && !connecting && now - globalNotifCooldown.offline > NOTIF_COOLDOWN_MS) {
        globalNotifCooldown.offline = now;
        addAlert('danger', 'System Offline', 'Lost connection to ESP32.');
      }
    };
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
  }, []);

  // ── Firebase listener ─────────────────────────────────────────────────────
  // KEY FIX: ESP32 now pushes Firebase SERVER TIMESTAMP as heartbeat.
  // We check: is the heartbeat timestamp within 45s of Date.now()?
  // - Stale cached data → old timestamp → check FAILS → correctly Offline
  // - Live ESP data → recent timestamp → check PASSES → correctly Online
  // This is IMPOSSIBLE to fool, regardless of page reload, navigation, or
  // Firebase WebSocket reconnection.
  const unsubTankRef     = useRef(null);
  const lastEventTimeRef = useRef(Date.now());

  const subscribeTankStatus = () => {
    if (unsubTankRef.current) { unsubTankRef.current(); unsubTankRef.current = null; }

    const tankRef = ref(database, 'tank_status');
    unsubTankRef.current = onValue(tankRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      lastEventTimeRef.current = Date.now();

      // Always update + cache sensor values
      const pct    = data.level_pct    ?? globalLevelPct;
      const liters = data.level_liters ?? globalLevelLiters;
      const motor  = data.motor_state  ?? globalMotorOn;
      const mode   = data.motor_mode   ?? globalMotorMode;

      globalLevelPct    = pct;
      globalLevelLiters = liters;
      globalMotorOn     = motor;
      globalMotorMode   = mode;

      setLevelPct(pct);
      setLevelLiters(liters);
      setMotorOn(motor);
      setMotorMode(mode);

      // ── THE BULLETPROOF CHECK ──────────────────────────────────────────
      // heartbeat is a Firebase SERVER TIMESTAMP (milliseconds since epoch).
      // If ESP is live: heartbeat = ~Date.now() (within a few seconds)
      // If ESP is off:  heartbeat = old timestamp from hours/days ago
      const hb = data.heartbeat;
      if (typeof hb === 'number' && hb > 0) {
        const age = Date.now() - hb;
        if (age < OFFLINE_TIMEOUT_MS) {
          // Heartbeat is fresh — ESP is definitely alive right now
          globalLastUpdate = Date.now();

          if (globalIsConnecting) {
            globalIsConnecting = false;
            globalSystemOnline = true;
            broadcastState();
          }
        }
        // else: heartbeat is old/stale → do NOT advance globalLastUpdate
      }
    });
  };

  useEffect(() => {
    if (!isFirebaseConfigured) {
      const interval = setInterval(() => {
        globalLastUpdate = Date.now();
        setLevelPct(prev => {
          const next = Math.max(0, prev - 1);
          globalLevelPct = next; setLevelLiters(next * 10); globalLevelLiters = next * 10;
          return next;
        });
      }, 1000);
      return () => clearInterval(interval);
    }

    // Watch browser ↔ Firebase WebSocket
    const connectedRef = ref(database, '.info/connected');
    const unsubConnected = onValue(connectedRef, (snap) => {
      if (snap.val() === true) subscribeTankStatus();
    });

    // Initial subscription
    subscribeTankStatus();

    // Watchdog: re-subscribe if 40s of silence
    const watchdog = setInterval(() => {
      if (Date.now() - lastEventTimeRef.current > 40000) {
        subscribeTankStatus();
        lastEventTimeRef.current = Date.now();
      }
    }, 15000);

    return () => {
      unsubConnected();
      if (unsubTankRef.current) unsubTankRef.current();
      clearInterval(watchdog);
    };
  }, []);

  // ── Trend detection ───────────────────────────────────────────────────────
  useEffect(() => {
    if (firstRender.current) return;
    if (levelPct > prevLevelRef.current)      setTrend('Filling');
    else if (levelPct < prevLevelRef.current) setTrend('Draining');
    else                                       setTrend('Stable');

    if (levelPct >= 95 && prevLevelRef.current < 95) addAlert('warning', 'Tank Full', 'Water level at 95%.');
    if (levelPct <= 20 && prevLevelRef.current > 20 && prevLevelRef.current !== 0)
      addAlert('danger', 'Tank Low', 'Water dropped below 20%.');
    prevLevelRef.current = levelPct;
  }, [levelPct]);

  // ── Motor alert ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!firstRender.current && systemOnline) {
      if (motorOn && !prevMotorRef.current) addAlert('warning', 'Pump Started', `Motor ON (${motorMode} mode).`);
      else if (!motorOn && prevMotorRef.current) addAlert('success', 'Pump Stopped', `Motor OFF (${motorMode} mode).`);
    }
    prevMotorRef.current = motorOn;
  }, [motorOn]);

  // ── Control handlers ──────────────────────────────────────────────────────
  const handleMotorToggle = (e) => {
    if (motorMode === 'auto') return;
    const newState = e.target.checked;
    setMotorOn(newState);
    globalMotorOn = newState;
    if (isFirebaseConfigured) set(ref(database, 'tank_status/motor_state'), newState);
  };

  const handleModeChange = (mode) => {
    setMotorMode(mode);
    globalMotorMode = mode;
    if (isFirebaseConfigured) {
      set(ref(database, 'tank_status/motor_mode'), mode);
      if (mode === 'auto') {
        setMotorOn(false);
        globalMotorOn = false;
        set(ref(database, 'tank_status/motor_state'), false);
      }
    }
  };

  const getAlertIcon = (type) => {
    if (type === 'success') return <CheckCircle2 color="var(--accent-green)" />;
    if (type === 'danger')  return <ShieldAlert  color="var(--accent-red)" />;
    if (type === 'warning') return <Activity     color="#ff9800" />;
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
              <div className={`motor-status ${isLive && motorOn ? 'on' : 'off'}`}>
                <Power size={16} />
                {isLive && motorOn ? 'RUNNING' : 'STOPPED'}
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
