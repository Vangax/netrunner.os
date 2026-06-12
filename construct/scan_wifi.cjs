const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'src', 'nearby_wifi.json');

let ssids = [];
try {
  const output = execSync('netsh wlan show networks', { encoding: 'utf8' });
  const lines = output.split('\n');
  for (let line of lines) {
    if (line.includes('SSID')) {
      const parts = line.split(':');
      if (parts.length > 1) {
        const ssid = parts[1].trim();
        if (ssid) {
          ssids.push(ssid);
        }
      }
    }
  }
} catch (e) {
  console.warn("Failed to scan WiFi networks via netsh:", e.message);
}

// Fallback if no SSIDs found or command failed
if (ssids.length === 0) {
  ssids = ["Corporate_Guest_WiFi", "NetGear_Secure_5G", "Xfinity_Hotspot_Free"];
}

// Ensure unique values
ssids = [...new Set(ssids)];

fs.writeFileSync(targetPath, JSON.stringify(ssids, null, 2), 'utf8');
console.log(`Scanned WiFi SSIDs: ${JSON.stringify(ssids)}. Written to ${targetPath}`);
