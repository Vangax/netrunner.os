// simulation.ts — Ghost-data fallback when the ICE core engine is offline.
// Generates a believable living netspace so the construct is never empty.

import { NetHost, DaemonLog } from './store';
import nearbyWifi from './nearby_wifi.json';

const HOSTNAMES = [
  'ARASAKA-EDGE-07', 'KIROSHI-OPTICS', 'MILITECH-RELAY', 'WAKAKO-PACHINKO',
  'NCPD-SCANNER', 'TRAUMA-TEAM-LINK', 'BIOTECHNICA-FARM', 'KANG-TAO-UPLINK',
  'ZETATECH-NODE', 'NETWATCH-PROBE', 'AFTERLIFE-POS', 'LIZZIES-BAR-AP',
];

const randomIp = (idx: number): string => `192.168.13.${10 + idx * 7}`;

const randomCoords = (idx: number, total: number): [number, number, number] => {
  // Ring layout with jitter keeps towers spread and readable
  const angle = (idx / total) * Math.PI * 2 + Math.random() * 0.4;
  const radius = 28 + Math.random() * 65;
  return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
};

export const generateSimHosts = (): NetHost[] => {
  const total = 13;
  const hosts: NetHost[] = [];

  // Local core
  hosts.push({
    ip: '192.168.13.1',
    mac: 'A4:83:E7:2B:11:09',
    hostname: 'LOCAL_CORE',
    ports: [{ port: 8000, protocol: 'TCP', service: 'ice-core', state: 'open' }],
    os: 'NET/OS 2.0',
    last_seen: new Date().toISOString(),
    anomaly_score: 0.2,
    coords: [0, 0, 10],
    ice_integrity: 100,
    is_quarantined: false,
    packet_count: 40,
    device_type: 'self',
    signal_strength: null,
  });

  const types = ['standard', 'standard', 'standard', 'standard', 'standard', 'standard',
    'wifi_beacon', 'wifi_beacon', 'bluetooth', 'bluetooth', 'probe_request', 'standard'];

  for (let i = 0; i < total - 1; i++) {
    const deviceType = types[i % types.length];
    hosts.push({
      ip: randomIp(i),
      mac: null,
      hostname: deviceType === 'wifi_beacon'
        ? (nearbyWifi[i % nearbyWifi.length] || 'WiFi Beacon')
        : HOSTNAMES[i % HOSTNAMES.length],
      ports: deviceType === 'standard'
        ? [
            { port: [22, 80, 443, 445, 3389][i % 5], protocol: 'TCP', service: null, state: 'open' },
            { port: [8080, 53, 123, 5040, 1900][i % 5], protocol: i % 2 ? 'TCP' : 'UDP', service: null, state: 'open' },
          ]
        : [],
      os: deviceType === 'standard' ? ['Windows 11', 'Debian 12', 'Android 15', null][i % 4] : null,
      last_seen: new Date().toISOString(),
      anomaly_score: Math.random() * 1.4,
      coords: randomCoords(i, total - 1),
      ice_integrity: 78 + Math.floor(Math.random() * 22),
      is_quarantined: false,
      packet_count: 3 + Math.floor(Math.random() * 30),
      device_type: deviceType,
      signal_strength: deviceType === 'probe_request' ? 0.4 + Math.random() * 0.6 : null,
    });
  }

  return hosts;
};

// Mutate the simulated netspace one tick forward: traffic flows, anomalies
// spike and decay, ICE integrity erodes under attack and self-repairs.
export const tickSimHosts = (hosts: NetHost[]): NetHost[] =>
  hosts.map((host) => {
    const next = { ...host };
    next.last_seen = new Date().toISOString();
    next.packet_count = Math.min(60, next.packet_count + (Math.random() < 0.55 ? 1 : 0));

    // Occasional anomaly spike on a random standard host
    if (next.device_type === 'standard' && Math.random() < 0.006) {
      next.anomaly_score = 3.2 + Math.random() * 2.0;
    } else {
      next.anomaly_score = Math.max(0.05, next.anomaly_score * 0.985);
    }

    // ICE erodes while anomalous, regenerates when calm
    if (next.anomaly_score > 3.0) {
      next.ice_integrity = Math.max(20, next.ice_integrity - 1);
    } else if (next.ice_integrity < 100 && Math.random() < 0.3) {
      next.ice_integrity += 1;
    }

    return next;
  });

const SIM_LOG_POOL: [string, string, string][] = [
  ['ReconDaemon', 'INFO', 'Subnet sweep cycle complete — topology stable.'],
  ['ReconDaemon', 'INFO', 'ARP table delta: 0 new MACs since last sweep.'],
  ['ConstructDaemon', 'INFO', 'LLM threat triage: no actionable indicators.'],
  ['IceDaemon', 'INFO', 'Welford variance recalibrated across active flows.'],
  ['GhostDaemon', 'INFO', 'Honeypot heartbeat nominal. No bites.'],
  ['IceDaemon', 'WARN', 'Entropy drift detected on UDP flux — monitoring.'],
  ['ConstructDaemon', 'INFO', 'Pattern cache compacted: 4096 signatures resident.'],
];

export const randomSimLog = (): DaemonLog => {
  const [daemon_id, level, message] = SIM_LOG_POOL[Math.floor(Math.random() * SIM_LOG_POOL.length)];
  return { daemon_id, level, message, timestamp: new Date().toISOString() };
};
