import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { database, ref, onValue, isFirebaseConfigured } from '../firebase';

export default function Analytics() {
  const [timeframe, setTimeframe] = useState('Daily');
  const [analyticsData, setAnalyticsData] = useState([]);
  const [totals, setTotals] = useState({ daily: 0, weekly: 0, monthly: 0 });

  useEffect(() => {
    if (isFirebaseConfigured) {
      const analyticsRef = ref(database, 'analytics');
      const unsubscribe = onValue(analyticsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          // Convert object to array and sort by time
          const rawArray = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          })).sort((a, b) => a.timestamp - b.timestamp);

          processAnalytics(rawArray);
        }
      });
      return () => unsubscribe();
    }
  }, []);

  const processAnalytics = (data) => {
    const now = new Date();
    
    // Boundaries
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    const startOfWeekDate = new Date(now);
    startOfWeekDate.setDate(now.getDate() - now.getDay()); // Sunday as start of week
    startOfWeekDate.setHours(0, 0, 0, 0);
    const startOfWeek = startOfWeekDate.getTime();
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let dailyConsumed = 0;
    let weeklyConsumed = 0;
    let monthlyConsumed = 0;

    // We calculate consumption by comparing each entry to the PREVIOUS entry.
    // If it dropped, we add the difference to the consumption.
    for (let i = 1; i < data.length; i++) {
      const prev = data[i-1];
      const curr = data[i];
      
      // If water level dropped, someone consumed it.
      if (curr.liters < prev.liters) {
        const drop = prev.liters - curr.liters;
        
        if (curr.timestamp >= startOfToday) dailyConsumed += drop;
        if (curr.timestamp >= startOfWeek) weeklyConsumed += drop;
        if (curr.timestamp >= startOfMonth) monthlyConsumed += drop;
      }
    }

    setTotals({
      daily: dailyConsumed,
      weekly: weeklyConsumed,
      monthly: monthlyConsumed
    });

    setAnalyticsData(data);
  };

  // Generate chart data based on timeframe
  const getChartData = () => {
    if (analyticsData.length === 0) return [];

    const now = new Date();
    let cutoff = 0;

    if (timeframe === 'Daily') {
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else if (timeframe === 'Weekly') {
      cutoff = new Date(now);
      cutoff.setDate(now.getDate() - 7);
      cutoff = cutoff.getTime();
    } else {
      cutoff = new Date(now);
      cutoff.setMonth(now.getMonth() - 1);
      cutoff = cutoff.getTime();
    }

    // Filter to timeframe and map for chart
    return analyticsData
      .filter(d => d.timestamp >= cutoff)
      .map(d => ({
        timeLabel: new Date(d.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        level: d.liters
      }));
  };

  const chartData = getChartData();

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
          <h4>Consumed This Month</h4>
          <div className="val" style={{color: '#ff9800'}}>{totals.monthly} L</div>
        </div>
      </div>

      <div className="card" style={{ height: '400px' }}>
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
        
        {chartData.length === 0 ? (
          <div style={{height: '100%', position: 'relative'}}>
            <div style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, background: 'rgba(0,0,0,0.4)', borderRadius: '12px'}}>
              <div style={{background: 'var(--card-bg)', padding: '1rem 2rem', borderRadius: '30px', border: '1px solid var(--border-color)', color: 'var(--text-main)', fontWeight: 'bold'}}>
                Waiting for ESP32 to log 15-minute snapshots...
              </div>
            </div>
            {/* Dummy Mock Graph for Aesthetics */}
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[{timeLabel: '12:00', level: 0}, {timeLabel: '01:00', level: 200}, {timeLabel: '02:00', level: 400}, {timeLabel: '03:00', level: 300}, {timeLabel: '04:00', level: 600}]} margin={{ top: 10, right: 10, left: -20, bottom: 40 }}>
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
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -20, bottom: 40 }}
            >
              <defs>
                <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0070f3" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#0070f3" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="timeLabel" stroke="var(--text-muted)" fontSize={12} tickMargin={10} minTickGap={20} />
              <YAxis stroke="var(--text-muted)" fontSize={12} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                itemStyle={{ color: 'var(--text-main)', fontWeight: 'bold' }}
                labelStyle={{ color: 'var(--text-muted)', marginBottom: '5px' }}
              />
              <Area type="monotone" dataKey="level" name="Tank Liters" stroke="#0070f3" strokeWidth={3} fillOpacity={1} fill="url(#colorLevel)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
