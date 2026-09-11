import React, { useState, useEffect, useRef } from 'react';
import { Power, Activity, ShieldAlert, CheckCircle2, TrendingUp, TrendingDown, Minus, WifiOff, BellOff } from 'lucide-react';
import { database, ref, onValue, set, isFirebaseConfigured } from '../firebase';

// =============================================================================
// MODULE-LEVEL GLOBALS
// =============================================================================
let globalLastUpdate     = 0;
let globalSystemOnline   = false;
let globalIsConnecting   = true;
let globalCheckerStarted = false;
let globalServerOffset   = 0;
let globalNotifCooldown  = { online: 0, offline: 0 };
let globalLastHeartbeatValue = null; // Used for backwards compatibility with old ESP32 code

let globalLevelPct    = 0;
let globalLevelLiters = 0;
let globalMotorOn     = false;
let globalMotorMode   = 'manual';

const OFFLINE_TIMEOUT_MS = 60000;
const NOTIF_COOLDOWN_MS  = 60000;

const stateListeners = new Set();
function broadcastState() {
  stateListeners.forEach(fn => fn({ online: globalSystemOnline, connecting: globalIsConnecting }));
}

// Called every time a FRESH heartbeat is confirmed
function markOnline() {
  globalLastUpdate   = Date.now();
  globalIsConnecting = false;
  if (!globalSystemOnline) {
    globalSystemOnline = true;
    broadcastState();   // Always fires when going Offline→Online
  }
}

function startGlobalChecker() {
  if (globalCheckerStarted) return;
  globalCheckerStarted = true;

  // FIX: Was 10s — too short, raced against Firebase startup and broadcast
  // "Offline" before the first heartbeat arrived. Now 30s and ONLY fires
  // if no heartbeat was received at all (genuine no-connection case).
  setTimeout(() => {
    if (globalLastUpdate === 0) {
      globalIsConnecting = false;
      globalSystemOnline = false;
      broadcastState();
    }
  }, 30000);

  // Runs every 5s after connection is established
  setInterval(() => {
    if (globalIsConnecting) return;
    const isOnline = globalLastUpdate > 0 && (Date.now() - globalLastUpdate) < OFFLINE_TIMEOUT_MS;
    if (isOnline !== globalSystemOnline) {
      globalSystemOnline = isOnline;
      broadcastState();
    }
  }, 5000);
}

// =============================================================================
// DASHBOARD COMPONENT
// =============================================================================
export default function Dashboard() {
  const [levelPct,     setLevelPct]     = useState(globalLevelPct);
  const [levelLiters,  setLevelLiters]  = useState(globalLevelLiters);
  const [motorOn,      setMotorOn]      = useState(globalMotorOn);
  const [motorMode,    setMotorMode]    = useState(globalMotorMode);
  const [trend,        setTrend]        = useState('Stable');
  const [systemOnline, setSystemOnline] = useState(globalSystemOnline);
  const [isConnecting, setIsConnecting] = useState(globalIsConnecting);
  const [alarmActive,  setAlarmActive]  = useState(false);
  const [alerts, setAlerts] = useState([
    { id: 1, type: 'success', title: 'System Initialized', message: 'Dashboard ready.', time: new Date().toLocaleTimeString() }
  ]);

  const prevLevelRef = useRef(globalLevelPct);
  const prevMotorRef = useRef(globalMotorOn);
  const firstRender  = useRef(true);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const sendNotif = (title, body) => {
    try {
      if ('Notification' in window && Notification.permission === 'granted')
        new Notification(title, { body, icon: '/favicon.svg' });
    } catch (e) { /* silent */ }
  };

  const addAlert = (type, title, message, notify = true) => {
    setAlerts(prev => [
      { id: Date.now(), type, title, message, time: new Date().toLocaleTimeString() },
      ...prev
    ].slice(0, 5));
    if (notify) sendNotif(title, message);
  };

  // ── Startup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default')
      Notification.requestPermission();
    startGlobalChecker();
  }, []);

  // ── Subscribe to global online/offline state ──────────────────────────────
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

  // ── Firebase listeners ────────────────────────────────────────────────────
  //
  // DESIGN: One stable onValue listener on tank_status.
  // Firebase SDK automatically resumes delivery after reconnection — no need
  // to manually re-subscribe on .info/connected (that was CAUSING the bug:
  // re-subscription fires cached data → old heartbeat → age check fails → offline flash).
  //
  // RECOVERY: 60s watchdog detects truly dead listeners and rebuilds.
  // visibilitychange recovers from browser tab throttling.
  //
  const unsubTankRef     = useRef(null);
  const lastEventTimeRef = useRef(Date.now());

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

    // Server time offset — corrects browser ↔ Firebase server clock drift
    const offsetRef = ref(database, '.info/serverTimeOffset');
    const unsubOffset = onValue(offsetRef, (snap) => {
      globalServerOffset = snap.val() || 0;
    });

    // ── Tank status — STABLE single listener ─────────────────────────
    const subscribeTankStatus = () => {
      if (unsubTankRef.current) {
        unsubTankRef.current();
        unsubTankRef.current = null;
      }

      const tankRef = ref(database, 'tank_status');
      unsubTankRef.current = onValue(tankRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        lastEventTimeRef.current = Date.now();

        // Always update cached sensor values
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

        // ── Heartbeat checking (Dual Support) ────────────────────────
        // The NEW ESP32 code writes an absolute server timestamp (> 1 trillion).
        // The OLD ESP32 code writes uptime millis() (e.g. 120500).
        // We must support both so the web app works without needing an ESP flash.
        const hb = data.heartbeat;
        if (typeof hb === 'number') {
          if (hb > 1000000000000) {
            // NEW FIRMWARE: Absolute timestamp check
            const adjustedNow = Date.now() + globalServerOffset;
            const ageMs = adjustedNow - hb;
            if (ageMs > -5000 && ageMs < OFFLINE_TIMEOUT_MS) {
              markOnline();
            }
          } else {
            // OLD FIRMWARE: Value change check
            if (hb !== globalLastHeartbeatValue) {
              globalLastHeartbeatValue = hb;
              markOnline();
            }
          }
        }
      });
    };

    subscribeTankStatus();

    // ── RECOVERY: Watchdog (detects truly dead listeners) ────────────
    // If onValue hasn't fired in 60s, rebuild the listener.
    // Note: .info/connected re-subscription was REMOVED — it caused offline
    // flickers by firing cached stale data on every WebSocket reconnect.
    const watchdog = setInterval(() => {
      if (Date.now() - lastEventTimeRef.current > 60000) {
        console.log('[Watchdog] Listener stale — re-subscribing...');
        subscribeTankStatus();
        lastEventTimeRef.current = Date.now();
      }
    }, 15000);

    // ── RECOVERY: Tab visibility ──────────────────────────────────────
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        subscribeTankStatus();
        lastEventTimeRef.current = Date.now();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubOffset();
      if (unsubTankRef.current) unsubTankRef.current();
      clearInterval(watchdog);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // ── Trend ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (firstRender.current) return;
    if (levelPct > prevLevelRef.current)      setTrend('Filling');
    else if (levelPct < prevLevelRef.current) setTrend('Draining');
    else                                       setTrend('Stable');
    if (levelPct >= 95 && prevLevelRef.current < 95)
      addAlert('warning', 'Tank Full', 'Water level at 95%.');
    if (levelPct <= 20 && prevLevelRef.current > 20 && prevLevelRef.current !== 0)
      addAlert('danger', 'Tank Low', 'Water dropped below 20%.');
    prevLevelRef.current = levelPct;
  }, [levelPct]);

  // ── Motor alert ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!firstRender.current && systemOnline) {
      if (motorOn && !prevMotorRef.current)
        addAlert('warning', 'Pump Started', `Motor ON (${motorMode} mode).`);
      else if (!motorOn && prevMotorRef.current)
        addAlert('success', 'Pump Stopped', `Motor OFF (${motorMode} mode).`);
    }
    prevMotorRef.current = motorOn;
  }, [motorOn]);

  // ── Alarm state listener ──────────────────────────────────────────────────
  // Reads alarm_active from Firebase so the button appears/disappears
  // in real-time on the web app without needing a page refresh.
  // NOTE: No isFirebaseConfigured guard — alarm must work even in fallback mode.
  useEffect(() => {
    if (!database) return;
    const alarmRef = ref(database, 'tank_status/alarm_active');
    const unsub = onValue(alarmRef, (snap) => {
      const val = snap.val();
      console.log('[Alarm] Firebase alarm_active value:', val, typeof val);
      setAlarmActive(val === true || val === 1 || val === 'true');
    });
    return () => unsub();
  }, []);

  // ── Control handlers ──────────────────────────────────────────────────────
  const handleMotorToggle = (e) => {
    if (motorMode === 'auto') return;
    const newState = e.target.checked;
    setMotorOn(newState); globalMotorOn = newState;
    if (isFirebaseConfigured) set(ref(database, 'tank_status/motor_state'), newState);
  };

  const handleModeChange = (mode) => {
    setMotorMode(mode); globalMotorMode = mode;
    if (isFirebaseConfigured) {
      set(ref(database, 'tank_status/motor_mode'), mode);
      if (mode === 'auto') {
        setMotorOn(false); globalMotorOn = false;
        set(ref(database, 'tank_status/motor_state'), false);
      }
    }
  };

  // Write alarm_silence=true → ESP32 reads this every 5s and stops the buzzer
  const handleSilenceAlarm = () => {
    if (database) {
      set(ref(database, 'tank_status/alarm_silence'), true);
      set(ref(database, 'tank_status/alarm_active'), false); // Instantly hide banner
      setAlarmActive(false);
      addAlert('success', 'Alarm Silenced', 'Stop signal sent to ESP32.');
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
            {isConnecting ? 'Connecting...' : systemOnline
              ? 'Online'
              : <><WifiOff size={24} /> Offline</>}
          </div>
        </div>
      </div>

      {/* Banner removed; Alarm controls moved into the card below */}

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

          {/* ── ALARM SYSTEM CONTROL ── */}
          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            borderRadius: '12px',
            border: alarmActive ? '2px solid var(--accent-red)' : '1px solid var(--border-color)',
            background: alarmActive ? 'rgba(239,68,68,0.15)' : 'var(--bg-color)',
            animation: alarmActive ? 'pulse 1s infinite' : 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            transition: 'all 0.3s ease'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <ShieldAlert size={24} color={alarmActive ? "var(--accent-red)" : "var(--text-muted)"} />
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: alarmActive ? 'var(--accent-red)' : 'var(--text-main)' }}>
                  Alarm System
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Status: {alarmActive ? <span style={{ color: 'var(--accent-red)', fontWeight: '600' }}>Ringing (Tank Full)</span> : 'Standby'}
                </p>
              </div>
            </div>
            <button
              onClick={handleSilenceAlarm}
              disabled={!alarmActive}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.6rem 1.2rem', borderRadius: '8px', border: 'none',
                background: alarmActive ? 'var(--accent-red)' : 'var(--border-color)',
                color: alarmActive ? '#fff' : 'var(--text-muted)',
                fontWeight: '700', fontSize: '0.9rem',
                cursor: alarmActive ? 'pointer' : 'not-allowed',
                transition: 'all 0.3s ease'
              }}
            >
              <BellOff size={16} /> Stop Alarm
            </button>
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
