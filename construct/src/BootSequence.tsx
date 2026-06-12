import React, { useState, useEffect, useRef } from 'react';
import audio from './AudioEngine';

interface BootSequenceProps {
  onComplete: () => void;
}

const ASCII_LOGO = [
  ' ███╗   ██╗███████╗████████╗     ██╗ ██████╗ ███████╗',
  ' ████╗  ██║██╔════╝╚══██╔══╝    ██╔╝██╔═══██╗██╔════╝',
  ' ██╔██╗ ██║█████╗     ██║      ██╔╝ ██║   ██║███████╗',
  ' ██║╚██╗██║██╔══╝     ██║     ██╔╝  ██║   ██║╚════██║',
  ' ██║ ╚████║███████╗   ██║    ██╔╝   ╚██████╔╝███████║',
  ' ╚═╝  ╚═══╝╚══════╝   ╚═╝    ╚═╝     ╚═════╝ ╚══════╝',
];

const BOOT_LOGS: [string, string][] = [
  ['OK', 'BIOS (C) 2026 — NEURAL SUBSTRATE DETECTED'],
  ['OK', 'ESTABLISHING HOST TELEMETRY...'],
  ['OK', 'CALIBRATING NEURAL LINK SYNAPSE [12ms LATENCY]'],
  ['OK', 'INJECTING NPCAP KERNEL CAPTURE ENGINE...'],
  ['OK', 'ESTABLISHING NEO4J DATA PLANE GRAPH EDGE ROUTER...'],
  ['OK', 'MOUNTING AES-256-GCM CRYPTO VAULTS...'],
  ['OK', 'SPAWNING DAEMONS: RECON / CONSTRUCT / ICE / GHOST'],
  ['OK', 'COMPILING VOXEL NETSPACE GEOMETRY...'],
  ['WARN', 'DEAD MAN SWITCH ARMED — 30S INACTIVITY = FLATLINE'],
  ['OK', 'NET/OS v2.0 — LINK READY.'],
];

const randomHex = (length: number): string =>
  Array.from({ length }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');

export const BootSequence: React.FC<BootSequenceProps> = ({ onComplete }) => {
  const [logs, setLogs] = useState<[string, string][]>([]);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [jacking, setJacking] = useState(false);
  const [hexLines, setHexLines] = useState<string[]>([]);
  const logIdxRef = useRef(0);

  useEffect(() => {
    audio.playAmbient();

    const logInterval = setInterval(() => {
      if (logIdxRef.current < BOOT_LOGS.length) {
        const entry = BOOT_LOGS[logIdxRef.current];
        setLogs((prev) => [...prev, entry]);
        audio.playClick();
        logIdxRef.current++;
      } else {
        clearInterval(logInterval);
      }
    }, 320);

    const hexInterval = setInterval(() => {
      setHexLines((prev) => [
        ...prev.slice(-26),
        `0x${randomHex(8)}  ${randomHex(4)} ${randomHex(4)} ${randomHex(4)} ${randomHex(4)}  ${randomHex(2)}:${randomHex(2)}`,
      ]);
    }, 90);

    const progressInterval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(progressInterval);
          setReady(true);
          return 100;
        }
        return p + 2 + Math.floor(Math.random() * 5);
      });
    }, 110);

    return () => {
      clearInterval(logInterval);
      clearInterval(progressInterval);
      clearInterval(hexInterval);
    };
  }, []);

  const handleJackIn = () => {
    if (jacking) return;
    setJacking(true);
    audio.playClick();
    audio.speakTTS("Jacking in. Welcome to the construct.");
    setTimeout(() => onComplete(), 900);
  };

  return (
    <div className={`absolute inset-0 bg-[#020205] z-50 overflow-hidden font-mono text-xs crt-overlay transition-opacity duration-700 ${jacking ? 'opacity-0' : 'opacity-100'}`}>
      <div className="boot-grid" />

      <div className="absolute right-8 top-8 bottom-32 w-72 overflow-hidden text-[9px] leading-relaxed text-cyberCyan/25 select-none pointer-events-none hidden md:block">
        {hexLines.map((line, idx) => (
          <div key={idx}>{line}</div>
        ))}
      </div>

      <div className="absolute inset-0 flex flex-col justify-between p-12">
        <div className="space-y-1 text-cyberCyan">
          <pre className="text-[10px] sm:text-xs leading-tight text-cyberCyan text-glow-cyan whitespace-pre select-none mb-2 holo-flicker">
            {ASCII_LOGO.join('\n')}
          </pre>
          <div className="text-sm font-bold tracking-[0.4em] text-white/80 mb-6 font-display">
            CYBERPUNK NETWORK DEFENSE OPERATING SYSTEM
          </div>

          <div className="border-t border-cyberCyan/20 pt-4 space-y-1.5 max-w-2xl">
            {logs.map(([level, message], idx) => (
              <div key={idx} className="flex items-center space-x-3">
                <span className={`w-12 shrink-0 font-bold ${level === 'WARN' ? 'text-cyberYellow' : 'text-green-400'}`}>
                  [{level}]
                </span>
                <span className={level === 'WARN' ? 'text-cyberYellow/90' : ''}>{message}</span>
              </div>
            ))}
            {!ready && <span className="terminal-cursor ml-12" />}
          </div>
        </div>

        <div className="space-y-5 max-w-3xl w-full self-center flex flex-col items-center">
          {ready ? (
            <button
              onClick={handleJackIn}
              className="group relative px-16 py-4 border-2 border-cyberCyan text-cyberCyan font-display font-bold text-2xl tracking-[0.5em] pl-[calc(4rem+0.5em)] transition-all duration-300 hover:bg-cyberCyan hover:text-black hover:shadow-[0_0_45px_rgba(0,240,255,0.8)] border-glow-cyan animate-pulse hover:animate-none"
            >
              JACK IN
              <span className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-cyberCyan" />
              <span className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-cyberCyan" />
              <span className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-cyberCyan" />
              <span className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-cyberCyan" />
            </button>
          ) : (
            <div className="w-full space-y-3">
              <div className="flex justify-between items-center text-cyberCyan text-[10px] tracking-widest">
                <span className="holo-flicker">NEURAL CALIBRATION IN PROGRESS</span>
                <span className="stat-ticker">{Math.min(progress, 100)}%</span>
              </div>
              <div className="w-full bg-black/60 h-2 border border-cyberCyan/20 relative overflow-hidden">
                <div
                  className="bg-cyberCyan h-full transition-all duration-150 border-glow-cyan"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>
          )}
          <div className="text-[9px] text-cyberCyan/40 tracking-[0.3em]">
            {ready ? 'PRESS TO SEVER MEATSPACE CONNECTION' : 'DO NOT DISCONNECT THE NEURAL INTERFACE'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BootSequence;
export {};
