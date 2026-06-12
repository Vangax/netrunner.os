import { create } from 'zustand';
import { decode } from '@msgpack/msgpack';
import { symphony } from './SymphonyEngine';

export interface HostPort {
  port: number;
  protocol: string;
  service: string | null;
  state: string;
}

export interface NetHost {
  ip: string;
  mac: string | null;
  hostname: string | null;
  ports: HostPort[];
  os: string | null;
  last_seen: string;
  anomaly_score: number;
  coords: [number, number, number];
  ice_integrity: number;
  is_quarantined: boolean;
  packet_count: number;
  device_type: string;
  signal_strength: number | null;
}

export interface DaemonLog {
  daemon_id: string;
  message: string;
  level: string;
  timestamp: string;
}

export interface DeceptionLog {
  deception_type: string;
  details: string;
  timestamp: string;
}

export type CameraMode = 'fly' | 'orbit' | 'tactical';

export interface VisualSettings {
  crt: boolean;
  bloom: boolean;
  voxelSea: boolean;
  audioMuted: boolean;
  performanceMode: boolean;
}

interface NetosStore {
  hosts: NetHost[];
  selectedHostIp: string | null;
  syncRate: number;
  syncHistory: number[];
  daemonLogs: DaemonLog[];
  daemonStates: Record<string, string>;
  evidenceVaultOpen: boolean;
  systemFlatlined: boolean;
  breachedIps: string[];
  deceptionLogs: DeceptionLog[];
  decoyActive: boolean;

  cameraMode: CameraMode;
  focusTarget: { coords: [number, number, number]; nonce: number } | null;
  settings: VisualSettings;
  settingsOpen: boolean;
  helpOpen: boolean;
  sessionStart: number;
  totalPackets: number;
  alertFlash: number;
  iceLinkUp: boolean;
  simulated: boolean;

  setHosts: (hosts: NetHost[]) => void;
  selectHost: (ip: string | null) => void;
  addDaemonLog: (log: DaemonLog) => void;
  clearDaemonLogs: () => void;
  updateDaemonState: (daemonId: string, state: string) => void;
  setSyncRate: (rate: number) => void;
  openEvidenceVault: (open: boolean) => void;
  flatlineSystem: () => void;
  addBreachedIp: (ip: string) => void;
  addDeceptionLog: (log: DeceptionLog) => void;
  setDecoyActive: (active: boolean) => void;

  setCameraMode: (mode: CameraMode) => void;
  cycleCameraMode: () => void;
  requestFocus: (coords: [number, number, number]) => void;
  updateSettings: (patch: Partial<VisualSettings>) => void;
  setSettingsOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  triggerAlertFlash: () => void;
  setIceLink: (up: boolean) => void;
  setSimulated: (simulated: boolean) => void;

  wsConnect: () => void;
}

export const useStore = create<NetosStore>((set, get) => ({
  hosts: [],
  selectedHostIp: null,
  syncRate: 0,
  syncHistory: [],
  daemonLogs: [],
  daemonStates: {
    ReconDaemon: "Stopped",
    ConstructDaemon: "Stopped",
    IceDaemon: "Stopped",
    GhostDaemon: "Stopped"
  },
  evidenceVaultOpen: false,
  systemFlatlined: false,
  breachedIps: [],
  deceptionLogs: [],
  decoyActive: false,

  cameraMode: 'fly',
  focusTarget: null,
  settings: {
    crt: true,
    bloom: true,
    voxelSea: true,
    audioMuted: false,
    performanceMode: false,
  },
  settingsOpen: false,
  helpOpen: false,
  sessionStart: Date.now(),
  totalPackets: 0,
  alertFlash: 0,
  iceLinkUp: false,
  simulated: false,

  setHosts: (hosts) => set((state) => ({
    hosts,
    totalPackets: Math.max(state.totalPackets, hosts.reduce((acc, h) => acc + h.packet_count, 0)),
  })),
  selectHost: (ip) => set({ selectedHostIp: ip }),
  addDaemonLog: (log) => set((state) => ({ daemonLogs: [...state.daemonLogs.slice(-100), log] })),
  clearDaemonLogs: () => set({ daemonLogs: [] }),
  updateDaemonState: (daemonId, daemonState) => set((state) => ({
    daemonStates: { ...state.daemonStates, [daemonId]: daemonState }
  })),
  setSyncRate: (syncRate) => set((state) => ({
    syncRate,
    syncHistory: [...state.syncHistory.slice(-119), syncRate],
  })),
  openEvidenceVault: (evidenceVaultOpen) => set({ evidenceVaultOpen }),
  flatlineSystem: () => set({ systemFlatlined: true }),
  addBreachedIp: (ip) => set((state) => ({
    breachedIps: state.breachedIps.includes(ip) ? state.breachedIps : [...state.breachedIps, ip]
  })),
  addDeceptionLog: (log) => set((state) => ({ deceptionLogs: [...state.deceptionLogs.slice(-100), log] })),
  setDecoyActive: (decoyActive) => set({ decoyActive }),

  setCameraMode: (cameraMode) => set({ cameraMode }),
  cycleCameraMode: () => set((state) => {
    const order: CameraMode[] = ['fly', 'orbit', 'tactical'];
    const next = order[(order.indexOf(state.cameraMode) + 1) % order.length];
    return { cameraMode: next };
  }),
  requestFocus: (coords) => set((state) => ({
    focusTarget: { coords, nonce: (state.focusTarget?.nonce ?? 0) + 1 },
    cameraMode: 'fly',
  })),
  updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  triggerAlertFlash: () => set((state) => ({ alertFlash: state.alertFlash + 1 })),
  setIceLink: (iceLinkUp) => set({ iceLinkUp }),
  setSimulated: (simulated) => set({ simulated }),

  wsConnect: () => {
    const ws = new WebSocket("ws://localhost:8000/ws");
    ws.binaryType = "arraybuffer";

    ws.onmessage = (event) => {
      try {
        const decoded = decode(new Uint8Array(event.data)) as any;

        if (decoded.Heartbeat) {
          const { daemon_id, state } = decoded.Heartbeat;
          get().updateDaemonState(daemon_id, state);
        } else if (decoded.Log) {
          const { daemon_id, message, level, timestamp } = decoded.Log;
          get().addDaemonLog({ daemon_id, message, level, timestamp });
          if (level === 'CRITICAL' || level === 'ALERT') {
            get().triggerAlertFlash();
          }
        } else if (decoded.ReconResult) {
        } else if (decoded.NetHost) {
          const host = decoded.NetHost as NetHost;
          const currentHosts = get().hosts;
          const index = currentHosts.findIndex((h) => h.ip === host.ip);
          if (index !== -1) {
            const updated = [...currentHosts];
            updated[index] = host;
            set({ hosts: updated });
          } else {
            set({ hosts: [...currentHosts, host] });
          }

          const protocol = host.ports[0]?.protocol || "TCP";
          symphony.playPacketNote(host.ip, 128 + Math.floor(Math.random() * 512), protocol);
        } else if (decoded.GhostDeception) {
          const { deception_type, details, timestamp } = decoded.GhostDeception;
          get().addDeceptionLog({ deception_type, details, timestamp });
          get().addDaemonLog({
            daemon_id: "GhostDaemon",
            message: `[${deception_type}] ${details}`,
            level: "WARN",
            timestamp: timestamp
          });
          get().triggerAlertFlash();
          symphony.playPacketNote("255.255.255.255", 1500, "UDP");
        }
      } catch (err) {
        console.error("Failed to decode Msgpack websocket frame:", err);
      }
    };

    ws.onclose = () => {
      setTimeout(() => {
        get().wsConnect();
      }, 3000);
    };
  }
}));
