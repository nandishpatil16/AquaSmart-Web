import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { database, ref, onValue, isFirebaseConfigured } from '../firebase';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Analytics() {
  const [timeframe, setTimeframe] = useState('Daily');
  const [analyticsData, setAnalyticsData] = useState([]);
  const [totals, setTotals] = useState({ daily: 0, weekly: 0, monthly: 0 });
  const [liveLiters, setLiveLiters] = useState(null);
  const currentMonthRef = useRef(new Date().getMonth());

  // ── Load analytics + live tank data from Firebase ─────────────────────────
  useEffect(() => {
    if (!isFirebaseConfigured) return;

    const analyticsRef = ref(database, 'analytics');
    const unsubAnalytics = onValue(analyticsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const rawArray = Object.keys(data)
          .map(key => ({ id: key, ...data[key] }))
          .filter(d => d.timestamp && d.liters !== undefined)
          .sort((a, b) => a.timestamp - b.timestamp);
        setAnalyticsData(rawArray);
      } else {
        setAnalyticsData([]);
      }
    });

    const statusRef = ref(database, 'tank_status');
    const unsubStatus = onValue(statusRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.level_liters !== undefined) {
        setLiveLiters(data.level_liters);
      }
    });

    // Auto-refresh totals when month rolls over
    const monthChecker = setInterval(() => {
      const m = new Date().getMonth();
      if (m !== currentMonthRef.current) {
        currentMonthRef.current = m;
        setTimeframe(prev => prev); // trigger re-render
      }
    }, 60000);

    return () => { unsubAnalytics(); unsubStatus(); clearInterval(monthChecker); };
  }, []);

  // ── Compute consumed totals from snapshot deltas ──────────────────────────
  const computeTotals = (data, live) => {
    const now = new Date();
    const startOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeekD = new Date(now);
    startOfWeekD.setDate(now.getDate() - now.getDay());
    startOfWeekD.setHours(0, 0, 0, 0);
    const startOfWeek  = startOfWeekD.getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let daily = 0, weekly = 0, monthly = 0;

    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      // Only count drops (actual water usage), ignore pump fills
      if (curr.liters < prev.liters) {
        const drop = prev.liters - curr.liters;
        if (drop > 400) continue; // Ignore sensor glitches
        if (curr.timestamp >= startOfDay)   daily   += drop;
        if (curr.timestamp >= startOfWeek)  weekly  += drop;
        if (curr.timestamp >= startOfMonth) monthly += drop;
      }
    }

    // Add live consumption since last logged snapshot
    if (data.length > 0 && live !== null) {
      const lastLogged = data[data.length - 1].liters;
      if (live < lastLogged) {
        const liveDrop = lastLogged - live;
        if (liveDrop <= 400) { daily += liveDrop; weekly += liveDrop; monthly += liveDrop; }
      }
    }

    return { daily: Math.round(daily), weekly: Math.round(weekly), monthly: Math.round(monthly) };
  };

  useEffect(() => {
    if (analyticsData.length > 0) {
      setTotals(computeTotals(analyticsData, liveLiters));
    }
  }, [analyticsData, liveLiters]);

  // ── Time label formatter ──────────────────────────────────────────────────
  const formatLabel = (ts, tf) => {
    const d = new Date(ts);
    if (tf === 'Daily')   return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    if (tf === 'Weekly') {
      return `${d.toLocaleDateString([], { weekday: 'short' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`;
    }
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
  };

  // ── Build chart data for current timeframe ────────────────────────────────
  const getChartData = () => {
    if (analyticsData.length === 0) return [];
    const now = new Date();
    let cutoff = 0;
    if (timeframe === 'Daily') {
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else if (timeframe === 'Weekly') {
      const w = new Date(now); w.setDate(now.getDate() - 7); cutoff = w.getTime();
    } else {
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    }

    const filtered = analyticsData
      .filter(d => d.timestamp >= cutoff)
      .map(d => ({ timeLabel: formatLabel(d.timestamp, timeframe), level: d.liters }));

    // Append live "Now" point
    if (liveLiters !== null) {
      filtered.push({ timeLabel: 'Now', level: liveLiters });
    }

    return filtered;
  };

  const chartData = getChartData();
  const hasData   = chartData.length >= 2;
  const currentMonthName = MONTH_NAMES[new Date().getMonth()];

  return (
    <div>
      <div className="page-header">
        <h1>Analytics</h1>
        <p>Track your actual water consumption over time.</p>
      </div>

      {/* Totals */}
      <div className="stats-row">
        <div className="stat-box">
          <h4>Consumed Today</h4>
          <div className="val" style={{ color: 'var(--primary-light)' }}>{totals.daily} L</div>
        </div>
        <div className="stat-box">
          <h4>Consumed This Week</h4>
          <div className="val" style={{ color: 'var(--accent-red)' }}>{totals.weekly} L</div>
        </div>
        <div className="stat-box">
          <h4>Consumed in {currentMonthName}</h4>
          <div className="val" style={{ color: '#ff9800' }}>{totals.monthly} L</div>
        </div>
      </div>

      {/* Chart Card — fixed pixel height so ResponsiveContainer works reliably */}
      <div className="card" style={{ paddingBottom: '1rem' }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ margin: 0 }}>Tank Level Trend</h2>
          <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-color)', padding: '0.3rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            {['Daily', 'Weekly', 'Monthly'].map(tf => (
              <button key={tf} onClick={() => setTimeframe(tf)} style={{
                padding: '0.3rem 0.8rem', borderRadius: '6px', border: 'none',
                background: timeframe === tf ? 'var(--primary)' : 'transparent',
                color: timeframe === tf ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem'
              }}>{tf}</button>
            ))}
          </div>
        </div>

        {/* Chart area — explicit 320px height so ResponsiveContainer renders correctly */}
        <div style={{ width: '100%', height: '320px', position: 'relative' }}>
          {!hasData && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', zIndex: 10,
              background: 'rgba(0,0,0,0.35)', borderRadius: '12px'
            }}>
              <div style={{
                background: 'var(--card-bg)', padding: '1rem 2rem', borderRadius: '30px',
                border: '1px solid var(--border-color)', color: 'var(--text-main)',
                fontWeight: 'bold', textAlign: 'center'
              }}>
                No data for this period yet.<br />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  ESP32 logs a snapshot every 1 minute.
                </span>
              </div>
            </div>
          )}

          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={hasData ? chartData : [
                { timeLabel: '00:00', level: 0 }, { timeLabel: '06:00', level: 200 },
                { timeLabel: '12:00', level: 400 }, { timeLabel: '18:00', level: 300 },
                { timeLabel: 'Now',   level: 200 }
              ]}
              margin={{ top: 10, right: 10, left: -20, bottom: 40 }}
            >
              <defs>
                <linearGradient id="gradLevel" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={hasData ? '#0070f3' : '#555'} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={hasData ? '#0070f3' : '#555'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis
                dataKey="timeLabel"
                stroke="var(--text-muted)"
                fontSize={11}
                tickMargin={10}
                minTickGap={30}
                angle={-20}
                textAnchor="end"
              />
              <YAxis stroke="var(--text-muted)" fontSize={12} />
              {hasData && (
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--text-main)', fontWeight: 'bold' }}
                  labelStyle={{ color: 'var(--text-muted)', marginBottom: '5px' }}
                  formatter={(value) => [`${value} L`, 'Tank Level']}
                />
              )}
              <Area
                type="monotone"
                dataKey="level"
                stroke={hasData ? '#0070f3' : '#555'}
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#gradLevel)"
                dot={false}
                activeDot={hasData ? { r: 5 } : false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
