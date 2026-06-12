import React, { useMemo } from 'react';
import { useStore } from './store';

const WIDTH = 270;
const HEIGHT = 56;

export const TrafficGraph: React.FC = () => {
  const syncHistory = useStore((state) => state.syncHistory);
  const syncRate = useStore((state) => state.syncRate);

  const { linePoints, areaPoints, peak } = useMemo(() => {
    const samples = syncHistory.length > 0 ? syncHistory : [0];
    const max = Math.max(...samples, 1);
    const stepX = WIDTH / Math.max(samples.length - 1, 1);
    const pts = samples.map((v, i) => {
      const x = i * stepX;
      const y = HEIGHT - 4 - (v / max) * (HEIGHT - 10);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return {
      linePoints: pts.join(' '),
      areaPoints: `0,${HEIGHT} ${pts.join(' ')} ${WIDTH},${HEIGHT}`,
      peak: max,
    };
  }, [syncHistory]);

  return (
    <div className="hud-frame hud-sweep p-3 pointer-events-auto">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[9px] text-cyberCyan font-bold tracking-widest">同期率
        <span className="text-lg font-bold font-mono text-white stat-ticker text-glow-cyan">{syncRate}<span className="text-[9px] text-cyberCyan/70 ml-1">PKT/S</span></span>
      </div>
      <svg width={WIDTH} height={HEIGHT} className="block">
        <defs>
          <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,240,255,0.35)" />
            <stop offset="100%" stopColor="rgba(0,240,255,0)" />
          </linearGradient>
        </defs>
        <line x1="0" y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} stroke="rgba(0,240,255,0.10)" strokeWidth="1" strokeDasharray="3 4" />
        <polygon points={areaPoints} fill="url(#trafficFill)" />
        <polyline points={linePoints} fill="none" stroke="#00f0ff" strokeWidth="1.5" style={{ filter: 'drop-shadow(0 0 3px rgba(0,240,255,0.8))' }} />
      </svg>
      <div className="flex justify-between text-[8px] text-cyberCyan/45 mt-0.5 tracking-wider">
        <span>WINDOW: 60S</span>
        <span>PEAK: {peak} PKT/S</span>
      </div>
    </div>
  );
};

export default TrafficGraph;
