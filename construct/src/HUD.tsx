import React, { useEffect, useState, useRef } from 'react';
import { useStore, CameraMode } from './store';
import audio from './AudioEngine';
import { symphony } from './SymphonyEngine';
import {
  Shield, Terminal as TermIcon, AlertTriangle, Lock, Unlock, FolderOpen,
  Database, FileText, Settings, HelpCircle, Video, Crosshair, Volume2, VolumeX
} from 'lucide-react';
import { getVaultFilesForIp, VaultFile } from './vaultData';
import Radar from './Radar';
import TrafficGraph from './TrafficGraph';

const LEVEL_COLORS: Record<string, string> = {
  CRITICAL: 'text-cyberRed font-bold',
  ALERT: 'text-cyberRed',
  WARN: 'text-cyberYellow',
  SUCCESS: 'text-green-400',
  INFO: 'text-cyberCyan',
};

const CAMERA_LABELS: Record<CameraMode, string> = {
  fly: 'FLY',
  orbit: 'ORBIT',
  tactical: 'TACTICAL',
};

const formatUptime = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600).toString().padStart(2, '0');
  const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

export const HUD: React.FC = () => {
  const {
    hosts,
    daemonLogs,
    daemonStates,
    selectedHostIp,
    flatlineSystem,
    breachedIps,
    evidenceVaultOpen,
    openEvidenceVault,
    deceptionLogs,
    decoyActive,
    setDecoyActive,
    addDaemonLog,
    clearDaemonLogs,
    cameraMode,
    cycleCameraMode,
    setCameraMode,
    requestFocus,
    selectHost,
    settings,
    updateSettings,
    settingsOpen,
    setSettingsOpen,
    helpOpen,
    setHelpOpen,
    sessionStart,
    totalPackets,
    alertFlash,
    iceLinkUp,
    simulated,
  } = useStore();

  const [terminalInput, setTerminalInput] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [uptime, setUptime] = useState('00:00:00');
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const [selectedVaultIp, setSelectedVaultIp] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [daemonLogs]);

  useEffect(() => {
    const interval = setInterval(() => setUptime(formatUptime(Date.now() - sessionStart)), 1000);
    return () => clearInterval(interval);
  }, [sessionStart]);

  useEffect(() => {
    audio.setMuted(settings.audioMuted);
    symphony.setMuted(settings.audioMuted);
  }, [settings.audioMuted]);

  useEffect(() => {
    if (evidenceVaultOpen && breachedIps.length > 0 && !selectedVaultIp) {
      setSelectedVaultIp(breachedIps[0]);
      const host = hosts.find(h => h.ip === breachedIps[0]);
      const files = getVaultFilesForIp(breachedIps[0], host?.device_type || 'standard');
      if (files.length > 0) {
        setSelectedFile(files[0]);
      }
    }
  }, [evidenceVaultOpen, breachedIps, selectedVaultIp, hosts]);

  const calculateGlobalIce = () => {
    if (hosts.length === 0) return 100;
    const total = hosts.reduce((acc, h) => acc + h.ice_integrity, 0);
    return Math.round(total / hosts.length);
  };

  const globalIce = calculateGlobalIce();
  const quarantinedCount = hosts.filter(h => h.is_quarantined).length;
  const threatsCount = hosts.filter(h => h.anomaly_score > 3.0 || h.is_quarantined).length;

  const log = (message: string, level = 'INFO', daemon_id = 'Console') => {
    addDaemonLog({ daemon_id, message, level, timestamp: new Date().toISOString() });
  };

  const toggleDecoy = () => {
    const nextState = !decoyActive;
    setDecoyActive(nextState);
    addDaemonLog({
      daemon_id: "GhostDaemon",
      message: nextState
        ? "SUBGRID MASKING ENGAGED: Cognitive Decoy deployed on TCP:5555."
        : "SUBGRID MASKING DISENGAGED: Decoy honeypot deactivated.",
      level: nextState ? "INFO" : "WARN",
      timestamp: new Date().toISOString()
    });
    audio.speakTTS(nextState ? "Decoy deployed. camouflaging neural subgrid." : "Decoy offline.");
  };

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    audio.playClick();

    const raw = terminalInput.trim();
    if (!raw) return;
    const cmd = raw.toLowerCase();
    const parts = cmd.split(/\s+/);

    setCmdHistory((prev) => [...prev.slice(-30), raw]);
    setHistoryIdx(-1);

    if (cmd === 'help') {
      [
        'AVAILABLE SUBGRID COMMANDS:',
        '  help                 — this index',
        '  status               — netspace situation report',
        '  scan                 — force host telemetry re-poll',
        '  trace <ip>           — select node and fly camera to it',
        '  breach <ip>          — launch Breach Protocol on node',
        '  quarantine <ip>      — inject firewall block rule',
        '  unquarantine <ip>    — lift firewall block rule',
        '  decoy                — toggle cognitive decoy honeypot',
        '  cam <fly|orbit|tactical> — switch camera rig mode',
        '  vault                — toggle evidence vault',
        '  mute                 — toggle all audio',
        '  clear                — wipe console buffer',
        '  flatline             — emergency key purge + shutdown',
      ].forEach(line => log(line));
    } else if (cmd === 'flatline') {
      audio.speakTTS("Neural link severed. Construct lost.");
      flatlineSystem();
    } else if (cmd === 'clear') {
      clearDaemonLogs();
    } else if (cmd === 'status') {
      log(`NETSPACE REPORT — UPTIME ${uptime}`);
      log(`  NODES: ${hosts.length} | BREACHED: ${breachedIps.length} | QUARANTINED: ${quarantinedCount}`);
      log(`  GLOBAL ICE: ${globalIce}% | TOTAL PKTS: ${totalPackets} | DECOY: ${decoyActive ? 'ACTIVE' : 'OFFLINE'}`);
      log(`  CAMERA: ${CAMERA_LABELS[cameraMode]} | THREAT CONTACTS: ${threatsCount}`);
    } else if (cmd === 'scan') {
      log('MANUAL SWEEP DISPATCHED: re-polling host telemetry...', 'INFO', 'ReconDaemon');
      fetch('http://127.0.0.1:8000/api/hosts')
        .then((res) => res.json())
        .then((data) => {
          useStore.getState().setHosts(data);
          log(`SWEEP COMPLETE: ${data.length} nodes resolved.`, 'SUCCESS', 'ReconDaemon');
        })
        .catch(() => log('SWEEP FAILED: ICE core unreachable.', 'CRITICAL', 'ReconDaemon'));
    } else if (parts[0] === 'trace' && parts[1]) {
      const host = hosts.find(h => h.ip === parts[1]);
      if (host) {
        selectHost(host.ip);
        requestFocus(host.coords);
        log(`TRACE LOCKED: camera vectoring to ${host.ip}`, 'SUCCESS');
      } else {
        log(`TRACE FAILED: node ${parts[1]} not in netspace.`, 'WARN');
      }
    } else if (parts[0] === 'breach' && parts[1]) {
      const host = hosts.find(h => h.ip === parts[1]);
      if (host) {
        selectHost(host.ip);
        window.dispatchEvent(new CustomEvent('open-breach-modal', { detail: { ip: host.ip } }));
      } else {
        log(`BREACH ABORTED: node ${parts[1]} not found.`, 'WARN');
      }
    } else if (parts[0] === 'cam' && parts[1]) {
      if (parts[1] === 'fly' || parts[1] === 'orbit' || parts[1] === 'tactical') {
        setCameraMode(parts[1]);
        log(`CAMERA RIG → ${parts[1].toUpperCase()}`);
      } else {
        log('USAGE: cam <fly|orbit|tactical>', 'WARN');
      }
    } else if (cmd === 'vault') {
      openEvidenceVault(!evidenceVaultOpen);
    } else if (cmd === 'mute') {
      updateSettings({ audioMuted: !settings.audioMuted });
      log(settings.audioMuted ? 'AUDIO UNMUTED.' : 'AUDIO MUTED.');
    } else if (cmd === 'decoy') {
      toggleDecoy();
    } else if (parts[0] === 'quarantine' && parts[1]) {
      const target = parts[1];
      audio.speakTTS(`Initiating firewall block protocol on node ${target}`);
      fetch('http://localhost:8000/api/quarantine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: target }),
      }).catch(() => log('QUARANTINE FAILED: ICE core unreachable.', 'CRITICAL'));
    } else if (parts[0] === 'unquarantine' && parts[1]) {
      const target = parts[1];
      audio.speakTTS(`Lifting firewall isolation on node ${target}`);
      fetch('http://localhost:8000/api/unquarantine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: target }),
      }).catch(() => log('UNQUARANTINE FAILED: ICE core unreachable.', 'CRITICAL'));
    } else {
      log(`UNKNOWN COMMAND: '${raw}' — type 'help' for the command index.`, 'WARN');
    }

    setTerminalInput('');
  };

  const handleTerminalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      const idx = historyIdx === -1 ? cmdHistory.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(idx);
      setTerminalInput(cmdHistory[idx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx === -1) return;
      const idx = historyIdx + 1;
      if (idx >= cmdHistory.length) {
        setHistoryIdx(-1);
        setTerminalInput('');
      } else {
        setHistoryIdx(idx);
        setTerminalInput(cmdHistory[idx]);
      }
    }
  };

  const triggerBreach = () => {
    if (!selectedHostIp) return;
    audio.playClick();
    window.dispatchEvent(new CustomEvent('open-breach-modal', {
      detail: { ip: selectedHostIp }
    }));
  };

  const openFileFromInspector = (file: VaultFile) => {
    if (!selectedHostIp) return;
    setSelectedVaultIp(selectedHostIp);
    setSelectedFile(file);
    openEvidenceVault(true);
    audio.playClick();
  };

  const currentHost = selectedHostIp ? hosts.find(h => h.ip === selectedHostIp) : null;
  const isHostBreached = selectedHostIp ? breachedIps.includes(selectedHostIp) : false;
  const hostFiles = currentHost && isHostBreached ? getVaultFilesForIp(selectedHostIp!, currentHost.device_type) : [];

  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-5">

      <div className="viewport-bracket tl" />
      <div className="viewport-bracket tr" />
      <div className="viewport-bracket bl" />
      <div className="viewport-bracket br" />

      {alertFlash > 0 && <div key={alertFlash} className="alert-flash" />}

      <div className="flex justify-between items-start w-full gap-4">

        <div className="flex flex-col space-y-2">
          <TrafficGraph />

          <div className="flex space-x-2">
            <button
              onClick={() => {
                openEvidenceVault(!evidenceVaultOpen);
                audio.playClick();
              }}
              className={`hud-frame p-2.5 text-left transition-all duration-200 flex-1 cursor-pointer pointer-events-auto ${
                evidenceVaultOpen
                  ? 'hud-frame-yellow text-cyberYellow'
                  : 'text-white hover:text-cyberYellow'
              }`}
            >
              <div className="text-[9px] font-bold tracking-wider flex items-center space-x-1.5">
                <FolderOpen className="w-3 h-3" />
                <span>EVIDENCE VAULT</span>
              </div>
              <div className="text-sm font-bold font-mono mt-0.5 stat-ticker">
                {breachedIps.length}/{hosts.filter(h => h.device_type !== 'self').length} SECURED
              </div>
            </button>

            <button
              onClick={() => {
                toggleDecoy();
                audio.playClick();
              }}
              className={`hud-frame p-2.5 text-left transition-all duration-200 flex-1 cursor-pointer pointer-events-auto ${
                decoyActive
                  ? 'hud-frame-magenta text-cyberPink'
                  : 'text-white hover:text-cyberPink'
              }`}
            >
              <div className="text-[9px] font-bold tracking-wider flex items-center space-x-1.5">
                <Database className="w-3 h-3" />
                <span>COGNITIVE DECOY</span>
              </div>
              <div className="text-sm font-bold font-mono mt-0.5">
                {decoyActive ? 'ACTIVE :5555' : 'OFFLINE'}
              </div>
            </button>
          </div>
        </div>

        <div className="hud-frame hud-sweep p-4 flex-1 max-w-xl flex flex-col items-center pointer-events-auto">
          <div className="w-full flex justify-between items-center mb-2">
            <div className="text-[10px] text-cyberCyan font-bold tracking-widest font-display glitch-text whitespace-nowrap" data-text="防御ICE完全性 // GLOBAL ICE INTEGRITY">
              防御ICE完全性
            </div>
            <div className={`text-[8px] font-bold tracking-widest px-1.5 py-0.5 border whitespace-nowrap ${
              simulated
                ? 'text-cyberPink border-cyberPink/60 animate-pulse'
                : iceLinkUp
                ? 'text-green-400 border-green-400/50'
                : 'text-gray-500 border-gray-700'
            }`}>
              {simulated ? 'SIM MODE' : iceLinkUp ? 'ICE LINK: LIVE' : 'LINKING…'}
            </div>
          </div>
          <div className="w-full bg-black/80 h-3 border border-cyberCyan/40 relative overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${globalIce}%`,
                backgroundColor: globalIce < 50 ? '#ff0044' : '#00f0ff',
                boxShadow: globalIce < 50 ? '0 0 12px #ff0044' : '0 0 12px #00f0ff',
              }}
            />
          </div>
          <div className="text-right text-[10px] mt-1 w-full font-mono stat-ticker">{globalIce}% SECURE</div>

          <div className="w-full grid grid-cols-4 gap-2 mt-2 pt-2 border-t border-cyberCyan/15 text-center">
            <div className="min-w-0">
              <div className="text-[8px] text-cyberCyan/60 tracking-wider whitespace-nowrap">UPTIME</div>
              <div className="text-[11px] font-bold font-mono stat-ticker whitespace-nowrap">{uptime}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[8px] text-cyberCyan/60 tracking-wider whitespace-nowrap">PACKETS</div>
              <div className="text-[11px] font-bold font-mono stat-ticker whitespace-nowrap">{totalPackets.toLocaleString()}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[8px] text-cyberCyan/60 tracking-wider whitespace-nowrap">THREATS</div>
              <div className={`text-[11px] font-bold font-mono stat-ticker ${threatsCount > 0 ? 'text-cyberRed text-glow-red' : ''}`}>{threatsCount}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[8px] text-cyberCyan/60 tracking-wider whitespace-nowrap">BREACHED</div>
              <div className="text-[11px] font-bold font-mono stat-ticker text-cyberYellow">{breachedIps.length}</div>
            </div>
          </div>

          <div className="w-full flex justify-center space-x-5 mt-2 pt-2 border-t border-cyberCyan/15">
            {Object.entries(daemonStates).map(([id, state]) => (
              <div key={id} className="flex items-center space-x-1.5">
                <div
                  className={`w-2 h-2 rounded-full transition-all duration-500 ${
                    state === 'Running' || state === 'Working'
                      ? 'bg-cyberYellow shadow-[0_0_8px_#ccff00]'
                      : state === 'Alert'
                      ? 'bg-cyberRed animate-pulse shadow-[0_0_10px_#ff0044]'
                      : 'bg-gray-800'
                  }`}
                />
                <div className="text-[8px] text-cyberCyan/70 tracking-wider">{(id || '').replace('Daemon', '').toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col space-y-2 items-end">
          <Radar />

          <div className="flex space-x-2">
            <button
              onClick={() => {
                cycleCameraMode();
                audio.playClick();
              }}
              className="hud-frame px-3 py-2 text-[10px] font-bold tracking-widest text-cyberCyan hover:text-white transition pointer-events-auto cursor-pointer flex items-center space-x-1.5"
              title="Cycle camera mode (C)"
            >
              <Video className="w-3.5 h-3.5" />
              <span>CAM: {CAMERA_LABELS[cameraMode]}</span>
            </button>
            <button
              onClick={() => {
                updateSettings({ audioMuted: !settings.audioMuted });
                audio.playClick();
              }}
              className="hud-frame px-2.5 py-2 text-cyberCyan hover:text-white transition pointer-events-auto cursor-pointer"
              title="Toggle audio"
            >
              {settings.audioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => {
                setSettingsOpen(!settingsOpen);
                audio.playClick();
              }}
              className={`hud-frame px-2.5 py-2 transition pointer-events-auto cursor-pointer ${settingsOpen ? 'text-cyberYellow' : 'text-cyberCyan hover:text-white'}`}
              title="Visual settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setHelpOpen(!helpOpen);
                audio.playClick();
              }}
              className={`hud-frame px-2.5 py-2 transition pointer-events-auto cursor-pointer ${helpOpen ? 'text-cyberYellow' : 'text-cyberCyan hover:text-white'}`}
              title="Help (H)"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {globalIce < 50 && (
        <div className="self-center hud-frame hud-frame-red p-5 animate-glitch pointer-events-auto flex items-center space-x-4">
          <AlertTriangle className="text-cyberRed w-9 h-9 animate-bounce" />
          <div>
            <div className="text-cyberRed font-bold tracking-widest text-lg font-display text-glow-red">警告: BLACK ICE DETECTED</div>
            <div className="text-xs text-white">HOSTILE SYSTEM SCAN CORRUPTING INFRASTRUCTURE FIREWALLS</div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-end w-full space-x-4">
        <div className="w-1/3 hud-frame hud-sweep p-4 pointer-events-auto min-h-[240px] flex flex-col">
          <div className="text-xs text-cyberCyan border-b border-cyberCyan/30 pb-2 mb-2 font-bold flex items-center justify-between tracking-wider">
            <span>端末分析
            <Shield className="w-4 h-4 text-cyberCyan" />
          </div>
          {selectedHostIp ? (
            <div className="text-xs font-mono space-y-1.5 text-white flex-1 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span>TARGET IP: <span className="text-cyberCyan font-bold text-glow-cyan">{selectedHostIp}</span></span>
                  {currentHost && (
                    <button
                      onClick={() => {
                        requestFocus(currentHost.coords);
                        audio.playClick();
                      }}
                      className="text-[9px] border border-cyberCyan/40 px-2 py-0.5 text-cyberCyan hover:bg-cyberCyan hover:text-black transition font-bold tracking-wider flex items-center space-x-1"
                      title="Fly camera to node (F)"
                    >
                      <Crosshair className="w-2.5 h-2.5" />
                      <span>FOCUS</span>
                    </button>
                  )}
                </div>
                {currentHost ? (
                  <>
                    <div className="flex justify-between">
                      <span>CLASS:</span>
                      <span className="text-cyberCyan uppercase">{currentHost.device_type}{currentHost.hostname ? ` (${currentHost.hostname})` : ''}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>ICE STABILITY:</span>
                      <span style={{ color: currentHost.ice_integrity < 50 ? '#ff0044' : '#00f0ff' }} className="font-bold">{currentHost.ice_integrity}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>ANOMALY METRICS:</span>
                      <span className="text-cyberYellow">{currentHost.anomaly_score.toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>PACKET COUNT:</span>
                      <span className="text-cyberCyan stat-ticker">{currentHost.packet_count} PKTS</span>
                    </div>
                    {currentHost.ports.length > 0 && (
                      <div className="flex justify-between">
                        <span>OPEN PORTS:</span>
                        <span className="text-cyberCyan truncate max-w-[55%] text-right">
                          {currentHost.ports.slice(0, 4).map(p => p.port).join(', ')}{currentHost.ports.length > 4 ? '…' : ''}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>STATUS:</span>
                      <span className={currentHost.is_quarantined ? 'text-cyberRed font-bold' : 'text-green-400'}>
                        {currentHost.is_quarantined ? 'QUARANTINED (ISOLATED)' : 'ONLINE'}
                      </span>
                    </div>
                  </>
                ) : (
                  <div>QUERYING DATA MATRIX...</div>
                )}
              </div>

              {currentHost && currentHost.device_type !== 'self' && (
                <div className="mt-3 border-t border-cyberCyan/20 pt-3 flex-1 flex flex-col justify-end">
                  {isHostBreached ? (
                    <div className="space-y-1.5">
                      <div className="text-[10px] text-green-400 font-bold flex items-center space-x-1">
                        <Unlock className="w-3 h-3" />
                        <span>ACCESS GRANTED
                      </div>
                      <div className="grid grid-cols-1 gap-1 mt-1 max-h-[70px] overflow-y-auto pr-1">
                        {hostFiles.map(file => (
                          <button
                            key={file.name}
                            onClick={() => openFileFromInspector(file)}
                            className="w-full text-left bg-black/60 px-2 py-1 border border-cyberCyan/20 hover:border-cyberYellow text-[9px] text-cyan-200 hover:text-cyberYellow font-mono flex items-center justify-between transition"
                          >
                            <span className="truncate flex items-center space-x-1">
                              <FileText className="w-2.5 h-2.5 text-cyberYellow" />
                              <span>{file.name}</span>
                            </span>
                            <span className="text-[8px] opacity-65 font-bold uppercase">{file.type}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[10px] text-cyberRed font-bold flex items-center space-x-1">
                        <Lock className="w-3 h-3" />
                        <span>ICE LOCKED
                      </div>
                      <button
                        onClick={triggerBreach}
                        className="w-full py-1.5 border border-cyberRed bg-cyberRed/10 text-cyberRed hover:bg-cyberRed hover:text-black font-bold tracking-wider transition text-[10px] flex items-center justify-center space-x-1.5"
                      >
                        <Database className="w-3 h-3" />
                        <span>INITIALIZE BREACH PROTOCOL</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {currentHost && currentHost.device_type === 'self' && (
                <div className="mt-3 border-t border-cyberCyan/20 pt-3">
                  <div className="text-[10px] text-cyberCyan font-bold flex items-center space-x-1 mb-1">
                    <Unlock className="w-3 h-3 text-[#00ff00]" />
                    <span>LOCAL SYSTEM CORE</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    {hostFiles.map(file => (
                      <button
                        key={file.name}
                        onClick={() => openFileFromInspector(file)}
                        className="w-full text-left bg-black/60 px-2 py-1 border border-cyberCyan/20 hover:border-cyberCyan text-[9px] text-cyan-200 hover:text-[#00ff00] font-mono flex items-center justify-between transition"
                      >
                        <span className="truncate flex items-center space-x-1">
                          <FileText className="w-2.5 h-2.5 text-[#00ff00]" />
                          <span>{file.name}</span>
                        </span>
                        <span className="text-[8px] opacity-65 font-bold uppercase">{file.type}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-gray-500 italic mt-8 text-center font-mono flex-1 flex items-center justify-center holo-flicker">
              SELECT NODE FOR DEEP NEURAL LINK DIAGNOSTIC
            </div>
          )}
        </div>

        <div className="w-2/3 hud-frame hud-sweep p-4 pointer-events-auto flex flex-col justify-between h-[240px]">
          <div className="text-xs text-cyberCyan border-b border-cyberCyan/30 pb-2 mb-2 font-bold flex items-center justify-between tracking-wider">
            <span>システムコンソール
            <div className="flex items-center space-x-3">
              <span className="text-[9px] text-cyberCyan/50">TYPE 'help' FOR COMMANDS</span>
              <TermIcon className="w-4 h-4 text-cyberCyan" />
            </div>
          </div>

          <div className="overflow-y-auto flex-1 font-mono text-[10px] space-y-1 pr-2 max-h-[140px] text-gray-300">
            {daemonLogs.map((log, idx) => (
              <div key={idx} className="flex space-x-2">
                <span className="text-cyberCyan shrink-0">[{((log && log.daemon_id) || '').replace('Daemon', '')}]</span>
                <span className={`shrink-0 ${LEVEL_COLORS[(log && log.level) || ''] || 'text-cyberYellow'}`}>[{((log && log.level) || '')}]</span>
                <span className="text-white whitespace-pre-wrap">{log.message}</span>
              </div>
            ))}
            <div ref={terminalEndRef} />
          </div>

          <form onSubmit={handleCommandSubmit} className="mt-2 border-t border-cyberCyan/30 pt-2 flex items-center">
            <span className="text-cyberCyan font-mono text-xs mr-2 text-glow-cyan">NETOS&gt;</span>
            <input
              type="text"
              value={terminalInput}
              onChange={(e) => setTerminalInput(e.target.value)}
              onKeyDown={handleTerminalKeyDown}
              data-netos-terminal
              className="bg-transparent border-none outline-none flex-1 text-xs text-white font-mono"
              placeholder="ENTER SUBGRID COMMANDS — help, scan, trace <ip>, breach <ip>, quarantine <ip>…"
            />
          </form>
        </div>
      </div>

      {settingsOpen && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[200] hud-frame p-6 w-[340px] pointer-events-auto">
          <div className="flex justify-between items-center border-b border-cyberCyan/30 pb-3 mb-4">
            <div className="text-sm text-cyberCyan font-bold tracking-widest font-display">視覚設定
            <button
              onClick={() => setSettingsOpen(false)}
              className="text-cyberCyan hover:text-white text-xs font-bold"
            >
              [X]
            </button>
          </div>
          <div className="space-y-2.5">
            {([
              ['crt', 'CRT SCANLINE OVERLAY'],
              ['bloom', 'NEON BLOOM POST-FX'],
              ['voxelSea', 'VOXEL DATA-SEA'],
              ['performanceMode', 'PERFORMANCE MODE'],
              ['audioMuted', 'MUTE ALL AUDIO'],
            ] as [keyof typeof settings, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  updateSettings({ [key]: !settings[key] });
                  audio.playClick();
                }}
                className="w-full flex justify-between items-center text-[10px] font-mono border border-cyberCyan/20 hover:border-cyberCyan/60 px-3 py-2 transition group"
              >
                <span className="text-white tracking-wider">{label}</span>
                <span className={`font-bold tracking-widest ${settings[key] ? 'text-cyberYellow' : 'text-gray-600'}`}>
                  {settings[key] ? '● ON' : '○ OFF'}
                </span>
              </button>
            ))}
          </div>
          <div className="text-[8px] text-cyberCyan/40 mt-4 leading-relaxed">
            PERFORMANCE MODE reduces voxel density, rain particles, and render resolution for low-spec decks.
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[200] hud-frame p-6 w-[560px] pointer-events-auto">
          <div className="flex justify-between items-center border-b border-cyberCyan/30 pb-3 mb-4">
            <div className="text-sm text-cyberCyan font-bold tracking-widest font-display glitch-text" data-text="操作マニュアル // NETRUNNER MANUAL">操作マニュアル // NETRUNNER MANUAL</div>
            <button onClick={() => setHelpOpen(false)} className="text-cyberCyan hover:text-white text-xs font-bold">[X]</button>
          </div>
          <div className="grid grid-cols-2 gap-6 text-[10px] font-mono">
            <div>
              <div className="text-cyberYellow font-bold tracking-wider mb-2">NAVIGATION</div>
              {[
                ['W A S D', 'Fly through netspace'],
                ['SPACE / L-SHIFT', 'Ascend / descend'],
                ['R-SHIFT (hold)', 'Sprint boost'],
                ['L-CLICK + DRAG', 'Mouse look'],
                ['C', 'Cycle camera: FLY → ORBIT → TACTICAL'],
                ['F', 'Fly to selected node'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1 border-b border-cyberCyan/10">
                  <span className="text-cyberCyan">{k}</span>
                  <span className="text-white/80 text-right">{v}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-cyberYellow font-bold tracking-wider mb-2">OPERATIONS</div>
              {[
                ['CLICK NODE', 'Inspect host'],
                ['DBL-CLICK NODE', 'Breach Protocol'],
                ['R-CLICK NODE', 'Context menu'],
                ['V', 'Toggle Evidence Vault'],
                ['H', 'This manual'],
                ['ESC', 'Close overlays'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1 border-b border-cyberCyan/10">
                  <span className="text-cyberCyan">{k}</span>
                  <span className="text-white/80 text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-[9px] text-cyberCyan/50 mt-4 leading-relaxed">
            TERMINAL: help, status, scan, trace &lt;ip&gt;, breach &lt;ip&gt;, quarantine &lt;ip&gt;, unquarantine &lt;ip&gt;, decoy, cam &lt;mode&gt;, vault, mute, clear, flatline.
            <br />
            WARNING: 30s of inactivity severs the neural link (dead man's switch).
          </div>
        </div>
      )}

      {evidenceVaultOpen && (
        <div className="absolute inset-10 z-[100] bg-black/95 hud-frame hud-frame-yellow p-8 flex flex-col pointer-events-auto font-mono backdrop-blur-md">
          <div className="flex justify-between items-center border-b border-cyberYellow/40 pb-4 mb-6">
            <div className="text-xl text-cyberYellow font-bold tracking-widest flex items-center space-x-2 font-display">
              <Database className="w-6 h-6 text-cyberYellow" />
              <span className="glitch-text" data-text="証拠保管庫 // DECRYPTED EVIDENCE VAULT CENTRAL">証拠保管庫 // DECRYPTED EVIDENCE VAULT CENTRAL</span>
            </div>
            <button
              onClick={() => {
                openEvidenceVault(false);
                audio.playClick();
              }}
              className="border border-cyberYellow text-cyberYellow px-4 py-1.5 hover:bg-cyberYellow hover:text-black font-bold text-xs tracking-widest transition"
            >
              CLOSE VAULT
            </button>
          </div>

          <div className="flex-1 grid grid-cols-4 gap-6 overflow-hidden">
            <div className="col-span-1 border border-cyberYellow/20 bg-black/60 p-4 overflow-y-auto space-y-2 flex flex-col justify-between">
              <div>
                <div className="text-[10px] text-cyberYellow font-bold tracking-wider mb-3">BREACHED NETWORKS</div>
                {breachedIps.length === 0 ? (
                  <div className="text-xs text-gray-500 italic p-4 text-center">
                    NO HOSTS BREACHED YET.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {breachedIps.map(ip => {
                      const host = hosts.find(h => h.ip === ip);
                      return (
                        <button
                          key={ip}
                          onClick={() => {
                            setSelectedVaultIp(ip);
                            setSelectedFile(null);
                            audio.playClick();
                          }}
                          className={`w-full text-left p-3 border font-bold text-xs transition duration-150 rounded ${
                            selectedVaultIp === ip
                              ? 'border-cyberYellow bg-cyberYellow/10 text-cyberYellow'
                              : 'border-cyberYellow/10 hover:border-cyberYellow/50 text-white'
                          }`}
                        >
                          <div>{ip}</div>
                          <div className="text-[9px] text-gray-400 mt-1 uppercase">
                            {host?.device_type === 'self' ? 'LOCAL CORE' : host?.device_type || 'STANDARD HOST'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-cyberYellow/10 pt-4 mt-4">
                <div className="text-[10px] text-[#ff00b7] font-bold tracking-wider mb-2">ACTIVE DECEPTION</div>
                <button
                  onClick={() => {
                    setSelectedVaultIp("decoy_console");
                    setSelectedFile(null);
                    audio.playClick();
                  }}
                  className={`w-full text-left p-3 border font-bold text-xs transition duration-150 rounded ${
                    selectedVaultIp === "decoy_console"
                      ? 'border-[#ff00b7] bg-[#ff00b7]/10 text-[#ff00b7]'
                      : 'border-[#ff00b7]/10 hover:border-[#ff00b7]/50 text-white'
                  }`}
                >
                  <div>COGNITIVE DECOY LOGS</div>
                  <div className="text-[9px] text-gray-400 mt-1 uppercase">
                    {decoyActive ? `${deceptionLogs.length} EVENTS INGESTED` : 'DECOY OFFLINE'}
                  </div>
                </button>
              </div>
            </div>

            <div className="col-span-1 border border-cyberYellow/20 bg-black/60 p-4 overflow-y-auto space-y-2">
              <div className="text-[10px] text-cyberYellow font-bold tracking-wider mb-3">DECRYPTED DATA VAULT</div>

              {selectedVaultIp === "decoy_console" ? (
                deceptionLogs.length === 0 ? (
                  <div className="text-xs text-gray-500 italic p-4 text-center">
                    NO HONEYPOT INTRUSIONS LOGGED YET.<br />LISTENING ON TCP:5555.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {deceptionLogs.map((log, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setSelectedFile({
                            name: `Decoy Incident #${idx + 1}`,
                            size: "Live Chat Session",
                            content: `INTRUSION LOG TIMESTAMP: ${new Date(log.timestamp).toLocaleDateString()} ${new Date(log.timestamp).toLocaleTimeString()}\n\n` +
                                     `============================================================\n` +
                                     `GHOST DECOY AI REPORT:\n` +
                                     `============================================================\n` +
                                     `DETAILS: ${log.details}\n` +
                                     `============================================================\n`,
                            type: "log"
                          });
                          audio.playClick();
                        }}
                        className={`w-full text-left p-3 border text-xs transition duration-150 rounded ${
                          selectedFile?.name.includes(`#${idx + 1}`)
                            ? 'border-[#ff00b7] bg-[#ff00b7]/10 text-[#ff00b7]'
                            : 'border-cyberYellow/10 hover:border-[#ff00b7]/40 text-white'
                        }`}
                      >
                        <div className="font-bold flex items-center justify-between">
                          <span className="truncate mr-2">HIT #{idx + 1}</span>
                          <span className="text-[8px] px-1 bg-black/40 text-cyberRed border border-cyberRed/10 rounded uppercase font-bold">ALARM</span>
                        </div>
                        <div className="text-[9px] text-gray-400 mt-1">{new Date(log.timestamp).toLocaleTimeString()}</div>
                      </button>
                    ))}
                  </div>
                )
              ) : selectedVaultIp ? (
                (() => {
                  const host = hosts.find(h => h.ip === selectedVaultIp);
                  const files = getVaultFilesForIp(selectedVaultIp, host?.device_type || 'standard');
                  return files.map(file => (
                    <button
                      key={file.name}
                      onClick={() => {
                        setSelectedFile(file);
                        audio.playClick();
                      }}
                      className={`w-full text-left p-3 border text-xs transition duration-150 rounded ${
                        selectedFile?.name === file.name
                          ? 'border-cyberCyan bg-cyberCyan/10 text-cyberCyan'
                          : 'border-cyberYellow/10 hover:border-cyberCyan/40 text-white'
                      }`}
                    >
                      <div className="font-bold flex items-center justify-between">
                        <span className="truncate mr-2">{file.name}</span>
                        <span className="text-[8px] px-1 bg-black/40 text-cyberYellow border border-cyberYellow/10 rounded uppercase font-bold">{file.type}</span>
                      </div>
                      <div className="text-[9px] text-gray-400 mt-1">{file.size}
                    </button>
                  ));
                })()
              ) : (
                <div className="text-xs text-gray-500 italic p-4 text-center">SELECT SECURED SYSTEM INTEL FROM THE LEFT</div>
              )}
            </div>

            <div className="col-span-2 border border-cyberYellow/20 bg-black/80 p-6 flex flex-col h-full overflow-hidden">
              <div className="text-[10px] text-cyberYellow font-bold tracking-wider mb-3">DECRYPTED PAYLOAD LOGS</div>
              {selectedFile ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex justify-between items-center text-[10px] text-cyberCyan border-b border-cyberCyan/20 pb-2 mb-4">
                    <span>FILE: {selectedFile.name}</span>
                    <span>MD5: E9-D8-7C-F6-2A</span>
                  </div>
                  <pre
                    className={`flex-1 overflow-auto bg-black/40 border p-4 font-mono text-[11px] whitespace-pre-wrap leading-relaxed ${
                      selectedVaultIp === "decoy_console"
                        ? 'border-[#ff00b7]/20 text-pink-300'
                        : 'border-cyberCyan/10 text-cyan-200/90'
                    }`}
                  >
                    {selectedFile.content}
                  </pre>
                  {selectedVaultIp === "decoy_console" ? (
                    <div className="mt-4 p-3 border border-[#ff00b7]/20 bg-[#ff00b7]/5 text-[10px] text-[#ff00b7]/80 leading-normal">
                      <span className="font-bold">DECOY INCIDENT BRIEF:</span> This log tracks simulated connection requests on TCP port 5555.
                      Scanners are conversationally engaged by the AI agent to capture telemetry logs.
                    </div>
                  ) : selectedVaultIp && selectedVaultIp !== '127.0.0.1' && (
                    <div className="mt-4 p-3 border border-cyberYellow/20 bg-cyberYellow/5 text-[10px] text-cyberYellow/80 leading-normal">
                      <span className="font-bold">FORENSIC STORAGE INFO:</span> The raw, encrypted packet dump has been quarantine-saved at:
                      <br />
                      <code className="text-white bg-black/50 px-1.5 py-0.5 rounded mt-1 inline-block select-all font-mono">
                        D:\netrunner windows\evidence_quarantine_{selectedVaultIp}.pcap.enc
                      </code>
                      <br />
                      <span className="mt-1 block">Solving the Neural Link PBKDF2-SHA256 matrix allows memory decryption into this viewer.</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-500 italic text-xs">
                  <span>SELECT A FILE FOR QUANTUM DECRYPTION VIEWING</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default HUD;
