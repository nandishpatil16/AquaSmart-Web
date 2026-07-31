import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { database, ref, onValue, remove, isFirebaseConfigured } from '../firebase';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Analytics() {
  const [timeframe, setTimeframe] = useState('Daily');
  const [analyticsData, setAnalyticsData] = useState([]);
  const [totals, setTotals] = useState({ daily: 0, weekly: 0, monthly: 0 });
  const [liveLiters, setLiveLiters] = useState(null);
  const currentMonthRef = useRef(new Date().getMonth());
  const liveLitersRef = useRef(null);

  useEffect(() => {
    if (!isFirebaseConfigured) return;

    const analyticsRef = ref(database, 'analytics');
    const unsubsAnalytics = onValue(analyticsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const rawArray = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        })).sort((a, b) => a.timestamp - b.timestamp);
        setAnalyticsData(rawArray);
      } else {
        setAnalyticsData([]);
      }
    });

    const statusRef = ref(database, 'tank_status');
    const unsubsStatus = onValue(statusRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.level_liters !== undefined) {
        liveLitersRef.current = data.level_liters;
        setLiveLiters(data.level_liters);
      }
    });

    // Auto-refresh when month changes
    const monthChecker = setInterval(() => {
      const newMonth = new Date().getMonth();
      if (newMonth !== currentMonthRef.current) {
        currentMonthRef.current = newMonth;
        // Force re-render by updating state
        setTimeframe(prev => prev);
      }
    }, 60000);

    return () => { unsubsAnalytics(); unsubsStatus(); clearInterval(monthChecker); };
  }, []);

  // Compute totals from raw data + live reading
  const computeTotals = (data, live) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeekDate = new Date(now);
    startOfWeekDate.setDate(now.getDate() - now.getDay());
    startOfWeekDate.setHours(0, 0, 0, 0);
    const startOfWeek = startOfWeekDate.getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let dailyConsumed = 0;
    let weeklyConsumed = 0;
    let monthlyConsumed = 0;

    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];

      // Only count DROPS (consumption), not fills from pump
      if (curr.liters < prev.liters) {
        const drop = prev.liters - curr.liters;
        // Ignore unrealistically large sudden drops (likely a sensor glitch or reset)
        if (drop > 400) continue;

        if (curr.timestamp >= startOfToday) dailyConsumed += drop;
        if (curr.timestamp >= startOfWeek) weeklyConsumed += drop;
        if (curr.timestamp >= startOfMonth) monthlyConsumed += drop;
      }
    }

    // Add live consumption since last snapshot
    if (data.length > 0 && live !== null) {
      const lastLogged = data[data.length - 1].liters;
      if (live < lastLogged) {
        const liveDrop = lastLogged - live;
        if (liveDrop <= 400) { // Sanity check
          dailyConsumed += liveDrop;
          weeklyConsumed += liveDrop;
          monthlyConsumed += liveDrop;
        }
      }
    }

    return {
      daily: Math.round(dailyConsumed),
      weekly: Math.round(weeklyConsumed),
      monthly: Math.round(monthlyConsumed)
    };
  };

  // Recompute whenever data or live changes
  useEffect(() => {
    if (analyticsData.length > 0) {
      setTotals(computeTotals(analyticsData, liveLiters));
    }
  }, [analyticsData, liveLiters]);

  const formatTimeLabel = (timestamp, tf) => {
    const d = new Date(timestamp);
    if (tf === 'Daily') {
      // 12-hour format: "3:45 PM"
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } else if (tf === 'Weekly') {
      // "Mon 3:00 PM"
      const day = d.toLocaleDateString([], { weekday: 'short' });
      const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      return `${day} ${time}`;
    } else {
      // "15 Jul" (date + month name)
      return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
    }
  };

  const getChartData = () => {
    if (analyticsData.length === 0) return [];

    const now = new Date();
    let cutoff = 0;

    if (timeframe === 'Daily') {
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else if (timeframe === 'Weekly') {
      const w = new Date(now);
      w.setDate(now.getDate() - 7);
      cutoff = w.getTime();
    } else {
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    }

    const filtered = analyticsData
      .filter(d => d.timestamp >= cutoff)
      .map(d => ({
        timeLabel: formatTimeLabel(d.timestamp, timeframe),
        level: d.liters,
        rawTime: d.timestamp
      }));

    // Inject live "Now" data point
    if (liveLiters !== null) {
      filtered.push({
        timeLabel: 'Now',
        level: liveLiters,
        rawTime: Date.now()
      });
    }

    return filtered;
  };

  const handleResetAnalytics = () => {
    if (!isFirebaseConfigured) return;
    if (!window.confirm('Are you sure you want to reset all analytics data? This cannot be undone.')) return;
    remove(ref(database, 'analytics'));
    setAnalyticsData([]);
    setTotals({ daily: 0, weekly: 0, monthly: 0 });
  };

  const chartData = getChartData();
  const currentMonthName = MONTH_NAMES[new Date().getMonth()];

  return (
    <div>
      <div className="page-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem'}}>
        <div>
          <h1>Analytics</h1>
          <p>Track your actual water consumption over time.</p>
        </div>
      </div>

      {/* Totals Row */}
      <div className="stats-row">
        <div className="stat-box">
          <h4>Consumed Today</h4>
          <div className="val" style={{color: 'var(--primary-light)'}}>{totals.daily} L</div>
        </div>
        <div className="stat-box">
          <h4>Consumed This Week</h4>
          <div className="val" style={{color: 'var(--accent-red)'}}>{totals.weekly} L</div>
        </div>
        <div className="stat-box">
          <h4>Consumed in {currentMonthName}</h4>
          <div className="val" style={{color: '#ff9800'}}>{totals.monthly} L</div>
        </div>
      </div>

      <div className="card" style={{ height: '420px' }}>
        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap', gap: '1rem'}}>
          <h2 style={{margin: 0}}>Tank Level Trend</h2>
          <div style={{display: 'flex', gap: '0.5rem', background: 'var(--bg-color)', padding: '0.3rem', borderRadius: '8px', border: '1px solid var(--border-color)'}}>
            {['Daily', 'Weekly', 'Monthly'].map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                style={{
                  padding: '0.3rem 0.8rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: timeframe === tf ? 'var(--primary)' : 'transparent',
                  color: timeframe === tf ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.85rem'
                }}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {chartData.length <= 1 ? (
          <div style={{height: 'calc(100% - 60px)', position: 'relative'}}>
            <div style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, background: 'rgba(0,0,0,0.4)', borderRadius: '12px'}}>
              <div style={{background: 'var(--card-bg)', padding: '1rem 2rem', borderRadius: '30px', border: '1px solid var(--border-color)', color: 'var(--text-main)', fontWeight: 'bold', textAlign: 'center'}}>
                No data for this period yet.<br/>
                <span style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>ESP32 logs a snapshot every 1 minute.</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[{timeLabel:'00:00',level:0},{timeLabel:'06:00',level:200},{timeLabel:'12:00',level:400},{timeLabel:'18:00',level:300},{timeLabel:'Now',level:500}]} margin={{ top: 10, right: 10, left: -20, bottom: 40 }}>
                <defs>
                  <linearGradient id="colorLevelMock" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#888" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#888" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis dataKey="timeLabel" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Area type="monotone" dataKey="level" stroke="#888" strokeWidth={3} fillOpacity={1} fill="url(#colorLevelMock)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="calc(100% - 60px)">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 40 }}>
              <defs>
                <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0070f3" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#0070f3" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="timeLabel" stroke="var(--text-muted)" fontSize={11} tickMargin={10} minTickGap={30} angle={-20} textAnchor="end" />
              <YAxis stroke="var(--text-muted)" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                itemStyle={{ color: 'var(--text-main)', fontWeight: 'bold' }}
                labelStyle={{ color: 'var(--text-muted)', marginBottom: '5px' }}
                formatter={(value) => [`${value} L`, 'Tank Level']}
              />
              <Area type="monotone" dataKey="level" name="Tank Liters" stroke="#0070f3" strokeWidth={3} fillOpacity={1} fill="url(#colorLevel)" dot={false} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Danger Zone */}
      <div className="card" style={{marginTop: '1.5rem', borderColor: 'rgba(220,53,69,0.3)'}}>
        <h2 style={{color: 'var(--accent-red)'}}>Danger Zone</h2>
        <p style={{color: 'var(--text-muted)', marginBottom: '1.5rem'}}>This will permanently delete all recorded analytics history. Use this to start fresh at the beginning of a new month.</p>
        <button
          onClick={handleResetAnalytics}
          style={{
            padding: '0.8rem 2rem',
            background: 'rgba(220,53,69,0.15)',
            color: 'var(--accent-red)',
            border: '1px solid rgba(220,53,69,0.4)',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '1rem'
          }}
        >
          🗑️ Reset All Analytics
        </button>
      </div>
    </div>
  );
}
