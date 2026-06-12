import React, { useState, useEffect, useRef } from 'react';
import { useStore } from './store';
import Netspace from './Netspace';
import HUD from './HUD';
import LockerModal from './LockerModal';
import BootSequence from './BootSequence';
import audio from './AudioEngine';
import { generateSimHosts, tickSimHosts, randomSimLog } from './simulation';

const FLATLINE_TIMEOUT_MS = 300000; // 5 minutes (prevent premature flatlining)
const WARNING_THRESHOLD_S = 10;

export const App: React.FC = () => {
  const [booting, setBooting] = useState(true);
  const {
    wsConnect, systemFlatlined, setHosts, setSyncRate, flatlineSystem,
    settings, cycleCameraMode, requestFocus, openEvidenceVault,
    setHelpOpen, setSettingsOpen,
  } = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [targetIp, setTargetIp] = useState<string | null>(null);
  const [linkSecondsLeft, setLinkSecondsLeft] = useState<number>(FLATLINE_TIMEOUT_MS / 1000);

  // Context menu position and target state
  const [contextMenu, setContextMenu] = useState<{ ip: string; x: number; y: number } | null>(null);

  // Dead man's switch inactivity check
  const lastActivity = useRef<number>(Date.now());

  useEffect(() => {
    if (!booting) {
      wsConnect();

      let failedPolls = 0;

      // Poll hosts telemetry regularly from Axum core services engine API.
      // If the ICE core is unreachable, fall back to a locally simulated
      // netspace so the construct is never an empty grid.
      const interval = setInterval(() => {
        const state = useStore.getState();
        fetch('http://127.0.0.1:8000/api/hosts')
          .then((res) => res.json())
          .then((data) => {
            if (failedPolls > 0 || !state.iceLinkUp) {
              state.setIceLink(true);
              if (state.simulated) {
                state.setSimulated(false);
                state.addDaemonLog({
                  daemon_id: 'IceDaemon', level: 'SUCCESS',
                  message: 'ICE CORE LINK RESTORED — live telemetry resumed.',
                  timestamp: new Date().toISOString(),
                });
              }
            }
            failedPolls = 0;
            setHosts(data);
          })
          .catch(() => {
            failedPolls++;
            if (failedPolls === 3 && !state.simulated) {
              state.setIceLink(false);
              state.setSimulated(true);
              state.setHosts(generateSimHosts());
              state.addDaemonLog({
                daemon_id: 'IceDaemon', level: 'WARN',
                message: 'ICE CORE UNREACHABLE — engaging SIMULATION MODE (ghost data).',
                timestamp: new Date().toISOString(),
              });
            }
          });
      }, 1000);

      // Advance the simulated netspace + flavor logs while in ghost mode
      const simInterval = setInterval(() => {
        const state = useStore.getState();
        if (!state.simulated) return;
        state.setHosts(tickSimHosts(state.hosts));
        if (Math.random() < 0.12) state.addDaemonLog(randomSimLog());
        // Keep daemon chips alive in sim mode
        Object.keys(state.daemonStates).forEach((id) => {
          if (state.daemonStates[id] === 'Stopped') state.updateDaemonState(id, 'Running');
        });
      }, 1500);

      // Simulate network traffic flow packet rates
      const syncInterval = setInterval(() => {
        setSyncRate(Math.floor(Math.random() * 200) + 150);
      }, 500);

      return () => {
        clearInterval(interval);
        clearInterval(simInterval);
        clearInterval(syncInterval);
      };
    }
  }, [booting]);

  // Global hotkeys: C camera, F focus, V vault, H help, ESC close overlays
  useEffect(() => {
    if (booting || systemFlatlined) return;

    const handleHotkeys = (e: KeyboardEvent) => {
      // Never hijack keys while the operator is typing in an input field
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (e.key === 'Escape') (target as HTMLInputElement).blur();
        return;
      }

      switch (e.code) {
        case 'KeyC':
          cycleCameraMode();
          audio.playClick();
          break;
        case 'KeyF': {
          const { selectedHostIp, hosts } = useStore.getState();
          const host = selectedHostIp ? hosts.find(h => h.ip === selectedHostIp) : null;
          if (host) {
            requestFocus(host.coords);
            audio.playClick();
          }
          break;
        }
        case 'KeyV':
          openEvidenceVault(!useStore.getState().evidenceVaultOpen);
          audio.playClick();
          break;
        case 'KeyH':
          setHelpOpen(!useStore.getState().helpOpen);
          audio.playClick();
          break;
        case 'Escape':
          if (useStore.getState().helpOpen) setHelpOpen(false);
          else if (useStore.getState().settingsOpen) setSettingsOpen(false);
          else if (useStore.getState().evidenceVaultOpen) openEvidenceVault(false);
          break;
      }
    };

    window.addEventListener('keydown', handleHotkeys);
    return () => window.removeEventListener('keydown', handleHotkeys);
  }, [booting, systemFlatlined]);

  // Handle inactivity watchdog (30 seconds) with visible countdown warning
  useEffect(() => {
    if (booting || systemFlatlined) return;

    const handleActivity = () => {
      lastActivity.current = Date.now();
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('scroll', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    const checkInterval = setInterval(() => {
      const idleMs = Date.now() - lastActivity.current;
      setLinkSecondsLeft(Math.max(0, Math.ceil((FLATLINE_TIMEOUT_MS - idleMs) / 1000)));

      if (idleMs > FLATLINE_TIMEOUT_MS) {
        clearInterval(checkInterval);
        // Trigger flatline switch!
        audio.speakTTS("Neural link severed. Construct lost.");
        flatlineSystem();
        fetch('http://127.0.0.1:8000/api/flatline', { method: 'POST' }).catch((e) =>
          console.error("Failed to notify backend of flatline:", e)
        );
      }
    }, 1000);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      clearInterval(checkInterval);
    };
  }, [booting, systemFlatlined, flatlineSystem]);

  // Context Menu and Breach Modal listeners
  useEffect(() => {
    const handleShowMenu = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setContextMenu({ ip: detail.ip, x: detail.x, y: detail.y });
    };

    const handleOpenBreach = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setTargetIp(detail.ip);
      setModalOpen(true);
    };

    const closeMenu = () => setContextMenu(null);

    const preventDefault = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('show-context-menu', handleShowMenu);
    window.addEventListener('open-breach-modal', handleOpenBreach);
    window.addEventListener('click', closeMenu);
    window.addEventListener('contextmenu', preventDefault);

    return () => {
      window.removeEventListener('show-context-menu', handleShowMenu);
      window.removeEventListener('open-breach-modal', handleOpenBreach);
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('contextmenu', preventDefault);
    };
  }, []);

  if (systemFlatlined) {
    return (
      <div className="absolute inset-0 bg-black flex flex-col items-center justify-center font-mono text-cyberRed space-y-6 crt-overlay select-none pointer-events-auto">
        {/* Heart Monitor EKG style flatline animation */}
        <div className="w-96 h-1 bg-cyberRed animate-pulse shadow-[0_0_20px_#ff0044] mb-4" />
        <div className="text-3xl font-bold tracking-widest text-center font-display glitch-text text-glow-red" data-text="NEURAL LINK SEVERED. CONSTRUCT LOST.">
          NEURAL LINK SEVERED. CONSTRUCT LOST.
        </div>
        <div className="text-xs text-white">SYSTEM CRYPTOGRAPHIC KEYS PURGED FROM MEMORY CHIP</div>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 border border-cyberRed px-8 py-2.5 text-cyberRed hover:bg-cyberRed hover:text-black font-bold text-xs tracking-[0.4em] transition"
        >
          RE-INITIALIZE CONSTRUCT
        </button>
      </div>
    );
  }

  if (booting) {
    return <BootSequence onComplete={() => setBooting(false)} />;
  }

  return (
    <div className={`relative w-screen h-screen overflow-hidden select-none ${settings.crt ? 'crt-overlay' : ''}`}>
      <Netspace />
      <HUD />
      <LockerModal isOpen={modalOpen} onClose={() => setModalOpen(false)} targetIp={targetIp} />

      {/* Neural link degradation countdown (dead man's switch warning) */}
      {linkSecondsLeft <= WARNING_THRESHOLD_S && linkSecondsLeft > 0 && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-[500] hud-frame hud-frame-red p-5 pointer-events-none flex items-center space-x-4 animate-glitch">
          <div className="text-4xl font-bold font-display text-cyberRed text-glow-red stat-ticker">{linkSecondsLeft}</div>
          <div>
            <div className="text-cyberRed font-bold tracking-widest text-sm font-display">NEURAL LINK DEGRADING</div>
            <div className="text-[10px] text-white/80">INPUT REQUIRED OR CONSTRUCT WILL FLATLINE</div>
          </div>
        </div>
      )}

      {/* Custom Context Menu Overlay */}
      {contextMenu && (
        <div
          className="absolute hud-frame p-2 z-[9999] font-mono text-xs text-cyberCyan pointer-events-auto select-none"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={() => {
              setTargetIp(contextMenu.ip);
              setModalOpen(true);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 hover:bg-cyberCyan hover:text-black font-bold tracking-wider transition duration-150"
          >
            EXTRACT FORENSIC EVIDENCE
          </button>
          <button
            onClick={() => {
              const host = useStore.getState().hosts.find(h => h.ip === contextMenu.ip);
              if (host) requestFocus(host.coords);
              setContextMenu(null);
              audio.playClick();
            }}
            className="w-full text-left px-4 py-2 hover:bg-cyberCyan hover:text-black font-bold tracking-wider transition duration-150"
          >
            FLY TO NODE
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
