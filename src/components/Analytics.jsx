import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const dailyData = [
  { name: '12 AM', usage: 0 }, { name: '4 AM', usage: 0 }, { name: '8 AM', usage: 0 },
  { name: '12 PM', usage: 0 }, { name: '4 PM', usage: 0 }, { name: '8 PM', usage: 0 },
];

const weeklyData = [
  { name: 'Mon', usage: 0 }, { name: 'Tue', usage: 0 }, { name: 'Wed', usage: 0 },
  { name: 'Thu', usage: 0 }, { name: 'Fri', usage: 0 }, { name: 'Sat', usage: 0 },
  { name: 'Sun', usage: 0 },
];

const monthlyData = [
  { name: 'Week 1', usage: 0 }, { name: 'Week 2', usage: 0 },
  { name: 'Week 3', usage: 0 }, { name: 'Week 4', usage: 0 },
];

export default function Analytics() {
  const [timeframe, setTimeframe] = useState('Weekly');
  
  const currentData = timeframe === 'Daily' ? dailyData 
                    : timeframe === 'Weekly' ? weeklyData 
                    : monthlyData;

  return (
    <div>
      <div className="page-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
        <div>
          <h1>Analytics</h1>
          <p>Track your daily, weekly, and monthly water consumption.</p>
        </div>
        
        <div style={{display: 'flex', gap: '0.5rem', background: 'var(--card-bg)', padding: '0.3rem', borderRadius: '8px', border: '1px solid var(--border-color)'}}>
          {['Daily', 'Weekly', 'Monthly'].map(tf => (
            <button 
              key={tf}
              onClick={() => setTimeframe(tf)}
              style={{
                padding: '0.5rem 1rem', 
                borderRadius: '6px', 
                border: 'none', 
                background: timeframe === tf ? 'var(--primary)' : 'transparent',
                color: timeframe === tf ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 0.2s'
              }}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ height: '500px' }}>
        <h2>{timeframe} Water Usage (Liters)</h2>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={currentData}
            margin={{ top: 20, right: 30, left: 0, bottom: 25 }}
          >
            <defs>
              <linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0070f3" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#0070f3" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
            <XAxis dataKey="name" stroke="#888" />
            <YAxis stroke="#888" />
            <Tooltip 
              contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }}
              itemStyle={{ color: '#fff' }}
            />
            <Area type="monotone" dataKey="usage" stroke="#0070f3" fillOpacity={1} fill="url(#colorUsage)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
