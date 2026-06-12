import React from 'react';
import { useStore, NetHost } from './store';
import audio from './AudioEngine';

const RADAR_SIZE = 176;
const WORLD_RADIUS = 150;

const blipColor = (host: NetHost): string => {
  if (host.is_quarantined) return '#ff0044';
  if (host.anomaly_score > 3.0) return '#ffaa00';
  if (host.device_type === 'self') return '#00ff00';
  if (host.device_type === 'wifi_beacon') return '#ff1122';
  if (host.device_type === 'bluetooth') return '#b026ff';
  if (host.device_type === 'probe_request') return '#00ffaa';
  return '#00f0ff';
};

export const Radar: React.FC = () => {
  const hosts = useStore((state) => state.hosts);
  const selectedHostIp = useStore((state) => state.selectedHostIp);
  const selectHost = useStore((state) => state.selectHost);
  const requestFocus = useStore((state) => state.requestFocus);

  const center = RADAR_SIZE / 2;
  const discRadius = center - 6;

  const toRadar = (coords: [number, number, number]) => {
    const scale = discRadius / WORLD_RADIUS;
    const x = center + Math.max(-discRadius, Math.min(discRadius, coords[0] * scale));
    const y = center + Math.max(-discRadius, Math.min(discRadius, coords[2] * scale));
    return { x, y };
  };

  return (
    <div className="hud-frame hud-sweep p-2 pointer-events-auto">
      <div className="text-[9px] text-cyberCyan font-bold tracking-widest mb-1 px-1 flex justify-between items-center">
        <span>戦術レーダー
        <span className="text-cyberCyan/50">{hosts.length} NODES</span>
      </div>
      <svg width={RADAR_SIZE} height={RADAR_SIZE} className="block">
        <circle cx={center} cy={center} r={discRadius} fill="rgba(0,20,28,0.55)" stroke="rgba(0,240,255,0.4)" strokeWidth="1" />
        <circle cx={center} cy={center} r={discRadius * 0.66} fill="none" stroke="rgba(0,240,255,0.18)" strokeWidth="1" />
        <circle cx={center} cy={center} r={discRadius * 0.33} fill="none" stroke="rgba(0,240,255,0.18)" strokeWidth="1" />
        <line x1={center} y1={6} x2={center} y2={RADAR_SIZE - 6} stroke="rgba(0,240,255,0.12)" strokeWidth="1" />
        <line x1={6} y1={center} x2={RADAR_SIZE - 6} y2={center} stroke="rgba(0,240,255,0.12)" strokeWidth="1" />

        <g className="radar-sweep-line" style={{ transformOrigin: `${center}px ${center}px` }}>
          <path
            d={`M ${center} ${center} L ${center + discRadius} ${center} A ${discRadius} ${discRadius} 0 0 0 ${center + discRadius * 0.85} ${center - discRadius * 0.5} Z`}
            fill="url(#sweepGradient)"
            opacity="0.5"
          />
        </g>
        <defs>
          <radialGradient id="sweepGradient">
            <stop offset="55%" stopColor="rgba(0,240,255,0)" />
            <stop offset="100%" stopColor="rgba(0,240,255,0.5)" />
          </radialGradient>
        </defs>

        {hosts.map((host) => {
          const { x, y } = toRadar(host.coords);
          const color = blipColor(host);
          const isSelected = host.ip === selectedHostIp;
          const isThreat = host.is_quarantined || host.anomaly_score > 3.0;
          return (
            <g
              key={host.ip}
              className="cursor-pointer"
              onClick={(e) => {
                selectHost(host.ip);
                audio.playClick();
                if (e.ctrlKey) requestFocus(host.coords);
              }}
            >
              {isThreat && (
                <circle cx={x} cy={y} r="7" fill="none" stroke={color} strokeWidth="1" opacity="0.6">
                  <animate attributeName="r" values="3;10" dur="1.2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.8;0" dur="1.2s" repeatCount="indefinite" />
                </circle>
              )}
              {isSelected && (
                <rect x={x - 6} y={y - 6} width="12" height="12" fill="none" stroke="#ccff00" strokeWidth="1" />
              )}
              <circle cx={x} cy={y} r={host.device_type === 'self' ? 3.4 : 2.4} fill={color} opacity="0.95" />
            </g>
          );
        })}
      </svg>
      <div className="text-[8px] text-cyberCyan/45 px-1 mt-1 tracking-wider">CLICK: SELECT — CTRL+CLICK: FLY TO NODE</div>
    </div>
  );
};

export default Radar;
