export interface VaultFile {
  name: string;
  size: string;
  type: 'log' | 'doc' | 'blueprint' | 'credential';
  content: string;
}

export const getVaultFilesForIp = (ip: string, deviceType: string): VaultFile[] => {
  if (deviceType === 'self') {
    return [
      {
        name: 'neural_calibration_diagnostics.sys',
        size: '14.2 KB',
        type: 'log',
        content: `ARASAKA CORP NEURAL CALIBRATION SYS\n=================================\nSTATUS: CALIBRATED\nFEEDBACK LOOP: STABLE\nINTEGRITY: 99.8%\n\nWARNING: Active network sniffers detected on subnet interface.\nEnsuring watchdog timers are active (30s Dead Man's Switch).`
      },
      {
        name: 'flatline_failsafe_protocol.sh',
        size: '2.1 KB',
        type: 'credential',
        content: `#!/bin/bash\n# EMERGENCY PURGE PROTOCOL\n# Triggered upon neural flatline (30s inactivity)\n\necho "PURGING CRYPTO KEYS FROM NEURAL BUFFER..."\nrm -rf /dev/shm/arasaka_keys/*\ncurl -X POST http://127.0.0.1:8000/api/flatline\nkillall -9 ice jack\necho "FLATLINE ZEROIZATION COMPLETE. CONSTRUCT DESTROYED."`
      }
    ];
  }

  const isGateway = ip.endsWith('.1') || ip === '192.168.1.1';
  if (isGateway || deviceType === 'wifi_beacon') {
    return [
      {
        name: 'netwatch_blacklist.log',
        size: '4.8 KB',
        type: 'log',
        content: `NETWATCH CENTRAL SUBGRID BLACKLIST\nTimestamp: 2077-06-12T04:22:11Z\n==================================\n[BLOCKED] 192.168.12.84 -> Protocol violation (raw packet injection)\n[WARNING] 192.168.1.44 -> Daemon scan activity detected (Construct)\n[BLOCKED] 10.0.2.15 -> eBPF socket hijacking attempt\n\nNote: Keep NetWatch agents updated on subgrid anomalies.`
      },
      {
        name: 'arasaka_gateway_access.key',
        size: '512 B',
        type: 'credential',
        content: `ARASAKA SUBGRID ACCESS MATRIX - LEVEL 4\n=======================================\nGATEWAY USER: ArasakaNetrunner09\nAUTH_KEY: PBKDF2-HMAC-SHA256:100000:Y29uY2VwdF9rZXk=\nCIPHER: AES-256-GCM\n\nDO NOT DISTRIBUTE. PROPERTY OF ARASAKA NETWORKING DIVISION.`
      },
      {
        name: 'mikoshi_tunnel_specs.pdf',
        size: '85.4 KB',
        type: 'blueprint',
        content: `PROJECT MIKOSHI: SECURE ACCESS ROUTE\n====================================\nAccessing the engram array requires bridging through local subnet gateways.\nSubgrid nodes act as relays to minimize signal attenuation.\n\nCoordinates of Virtual Interface Spire:\nx: [RANDOMIZED_LAYOUT]\ny: 120.0 (Data Bridge Light Cylinder)\nz: [RANDOMIZED_LAYOUT]\n\nEnsure ICE is disabled before initiating neural transfer.`
      }
    ];
  }

  if (deviceType === 'bluetooth') {
    return [
      {
        name: 'cyberware_telemetry_dump.dat',
        size: '18.9 KB',
        type: 'log',
        content: `BIOMONITOR DEVICE TELEMETRY\n==========================\nHeart Rate: 84 BPM\nAdrenaline: 0.12 ug/dL\nKiroshi Optics Firmware: v4.11.2\nCyberware Load: 42% (Sandevistan Mk.4 ready)\n\nAlert: Minor neural sync variance detected. Recommend recalibration.`
      },
      {
        name: 'personal_log_owner.txt',
        size: '1.4 KB',
        type: 'doc',
        content: `Owner: V\nLocation: Afterlife, Night City\n================================\n"Dexter DeShawn wants us to hit the Konpeki Plaza. Sounds big, maybe too big.\nJackie is excited, but something feels off. NetWatch has been sniffing around\nthe subnet. Need to keep our daemons updated and clean our hardware."`
      }
    ];
  }

  return [
    {
      name: 'arasaka_project_relic.txt',
      size: '12.4 KB',
      type: 'doc',
      content: `ARASAKA RESEARCH DATA - CONFIDENTIAL\n===================================\nCodename: Relic (Secure Your Soul)\nSubject: DNA-specific engram projection.\nStatus: Stage 5 clinical testing.\n\nENGRAM MEMORY MAP:\nSector 0x00 - Core cognitive matrix (encrypted)\nSector 0x1A - Personality algorithms (Johnny Silverhand)\nSector 0xFF - Biological host overwrite keys\n\nEvidence file: D:\\netrunner windows\\evidence_quarantine_${ip}.pcap.enc\n(Decrypted on server using PBKDF2 after solving key vector)`
    },
    {
      name: 'network_intrusion_alert.cfg',
      size: '850 B',
      type: 'credential',
      content: `ALARM_TRIGGER_THRESHOLD=5\nALARM_ACTION=FIREWALL_QUARANTINE\nALARM_TARGET_DAEMONS=["Recon", "Ghost"]\n\n# System auto-scans for anomaly packet counts.\n# If anomalies detected, ICE integrity drops and triggers lock.`
    }
  ];
};
