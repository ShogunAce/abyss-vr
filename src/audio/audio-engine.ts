// Procedural Web Audio soundscape: no files, no microphone, failure-tolerant.
// Started from a user gesture (Enter XR); every call is a no-op if audio is blocked.

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private drone: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  enabled = true;
  status = 'not started';

  start() {
    if (this.ctx) { void this.ctx.resume().catch(() => {}); return; }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) { this.status = 'unsupported'; return; }
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain(); this.master.gain.value = this.enabled ? 0.5 : 0; this.master.connect(ctx.destination);
      // Brown noise → low-pass: the hush of water.
      const length = ctx.sampleRate * 4, buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; data[i] = last * 3.2; }
      const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true;
      this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 900; this.filter.Q.value = 0.4;
      const noiseGain = ctx.createGain(); noiseGain.gain.value = 0.35;
      noise.connect(this.filter).connect(noiseGain).connect(this.master);
      noise.start();
      // Deep drone that rises with depth.
      this.drone = ctx.createOscillator(); this.drone.type = 'sine'; this.drone.frequency.value = 55;
      this.droneGain = ctx.createGain(); this.droneGain.gain.value = 0;
      this.drone.connect(this.droneGain).connect(this.master); this.drone.start();
      this.status = ctx.state;
      void ctx.resume().then(() => { this.status = ctx.state; }).catch(() => { this.status = 'blocked'; });
    } catch (error) {
      this.status = `failed: ${String(error)}`;
      this.ctx = null;
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(enabled ? 0.5 : 0, this.ctx.currentTime, 0.3);
  }

  /** Slow, smoothed parameter changes only. */
  setDepth(depth: number, immersion: number) {
    if (!this.ctx || !this.filter || !this.droneGain || !this.drone) return;
    const t = this.ctx.currentTime;
    this.filter.frequency.setTargetAtTime(900 - depth * 680, t, 0.8);
    this.droneGain.gain.setTargetAtTime(immersion * (0.02 + depth * 0.09), t, 1.2);
    this.drone.frequency.setTargetAtTime(58 - depth * 18, t, 1.5);
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? 0.15 + 0.35 * immersion : 0, t, 0.6);
  }

  private tone(freq: number, delay: number, duration: number, gain: number, type: OscillatorType = 'sine') {
    if (!this.ctx || !this.master || !this.enabled) return;
    try {
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
      osc.type = type; osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(g).connect(this.master); osc.start(t); osc.stop(t + duration + 0.05);
    } catch { /* ignore */ }
  }

  chime() { this.tone(660, 0, 1.2, 0.08); this.tone(990, 0.12, 1.4, 0.06); }
  pulse() { this.tone(220, 0, 2.2, 0.09); this.tone(330, 0.05, 2.4, 0.05, 'triangle'); }
  reveal() { this.tone(82, 0, 5, 0.12); this.tone(123, 0.6, 5, 0.06); }
  tap() { this.tone(520, 0, 0.25, 0.04); }

  suspend() { void this.ctx?.suspend().catch(() => {}); }
  resume() { void this.ctx?.resume().catch(() => {}); }
}

export const audio = new AudioEngine();
