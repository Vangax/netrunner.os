class SymphonyEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private distances: Record<string, number> = {};
  private activeNotes = 0;
  private maxActiveNotes = 8;

  private scale = [
    55.00, 65.41, 73.42, 82.41, 97.99,
    110.00, 130.81, 146.83, 164.81, 195.99,
    220.00, 261.63, 293.66, 329.63, 391.99,
    440.00, 523.25, 587.33, 659.25, 783.99
  ];

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('click', () => this.init(), { once: true });
      window.addEventListener('keydown', () => this.init(), { once: true });
    }
  }

  private init() {
    if (this.ctx) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
      
      console.log("Subnet Symphony Synthesizer Engine Initialized.");
      this.playBootChime();
    } catch (e) {
      console.error("Failed to initialize Web Audio API:", e);
    }
  }

  public updateHostDistance(ip: string, distance: number) {
    this.distances[ip] = distance;
  }

  public setMuted(muted: boolean) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0.0 : 0.25, this.ctx.currentTime, 0.05);
    }
  }

  public playPacketNote(ip: string, packetSize: number, protocol: string) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (this.activeNotes >= this.maxActiveNotes) return;
    this.activeNotes++;

    const dist = this.distances[ip] ?? 80;
    const maxAudibleDistance = 140;
    const distanceVolume = Math.max(0.0, 1.0 - dist / maxAudibleDistance);
    
    const baseVolume = 0.18;
    const finalVolume = baseVolume * distanceVolume;

    if (finalVolume <= 0.005) {
      this.activeNotes--;
      return;
    }

    const now = this.ctx.currentTime;
    
    const ipHash = ip.split('.').reduce((acc, val) => acc + parseInt(val || '0', 10), 0);
    
    let octaveOffset = 5;
    let type: OscillatorType = 'triangle';
    let filterFrequency = 800;

    if (protocol.toUpperCase() === 'UDP') {
      octaveOffset = 10;
      type = 'square';
      filterFrequency = 1500;
    } else if (protocol.toUpperCase() === 'ICMP') {
      octaveOffset = 15;
      type = 'sine';
      filterFrequency = 2500;
    } else {
      octaveOffset = 2;
      type = 'sawtooth';
      filterFrequency = 500;
    }

    const noteIdx = (ipHash + octaveOffset) % this.scale.length;
    const freq = this.scale[noteIdx];

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    const glideTime = 0.05 + (packetSize % 100) / 1000;
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + glideTime);

    filter.type = 'lowpass';
    filter.Q.setValueAtTime(4.0, now);
    filter.frequency.setValueAtTime(filterFrequency, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.3);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(finalVolume, now + 0.015);
    
    const decayDuration = 0.15 + Math.min(1.2, packetSize / 1500);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decayDuration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(now);
    osc.stop(now + decayDuration + 0.05);

    setTimeout(() => {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
      this.activeNotes = Math.max(0, this.activeNotes - 1);
    }, (decayDuration + 0.1) * 1000);
  }

  private playBootChime() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const chords = [110, 164.81, 220, 329.63, 440];
    
    chords.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      
      gain.gain.setValueAtTime(0.001, now + idx * 0.06);
      gain.gain.linearRampToValueAtTime(0.06, now + idx * 0.06 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.06 + 1.2);
      
      osc.connect(gain);
      gain.connect(this.masterGain!);
      
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 1.3);
      
      setTimeout(() => {
        osc.disconnect();
        gain.disconnect();
      }, 2000);
    });
  }
}

export const symphony = new SymphonyEngine();
export default symphony;
