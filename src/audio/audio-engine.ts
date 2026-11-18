// Procedural Web Audio soundscape: no files, no microphone, failure-tolerant.
// Started from a user gesture (Enter XR); every call is a no-op if audio is blocked.

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private drone: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  enabled = true;
  /** Ambient music: a slow, generative pad and bells that follow the depth (no audio files). */
  music = true;
  status = 'not started';
  private musicGain: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private musicBus: GainNode | null = null;
  private nextChord = 0;
  private chordIndex = 0;
  private depth = 0;

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
      // Music bus: voices → low-pass (darker with depth) → gain, plus a soft echo for a big, watery space.
      this.musicBus = ctx.createGain(); this.musicBus.gain.value = 1;
      this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 2400; this.musicFilter.Q.value = 0.3;
      this.musicGain = ctx.createGain(); this.musicGain.gain.value = 0;
      this.musicBus.connect(this.musicFilter).connect(this.musicGain).connect(this.master);
      const echo = ctx.createDelay(2); echo.delayTime.value = 0.46;
      const feedback = ctx.createGain(); feedback.gain.value = 0.38;
      const echoTone = ctx.createBiquadFilter(); echoTone.type = 'lowpass'; echoTone.frequency.value = 1400;
      const wet = ctx.createGain(); wet.gain.value = 0.45;
      this.musicFilter.connect(echo); echo.connect(echoTone).connect(feedback).connect(echo); echoTone.connect(wet).connect(this.musicGain);
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

  setMusic(on: boolean) { this.music = on; }

  /** Slow, smoothed parameter changes only. Also keeps the generative music scheduled ahead. */
  setDepth(depth: number, immersion: number) {
    if (!this.ctx || !this.filter || !this.droneGain || !this.drone) return;
    const t = this.ctx.currentTime;
    this.depth = depth;
    if (this.musicGain && this.musicFilter) {
      this.musicGain.gain.setTargetAtTime(this.music ? 0.18 + 0.62 * immersion : 0, t, 1.5);
      this.musicFilter.frequency.setTargetAtTime(2600 - depth * 1900, t, 2);
      if (this.music && this.enabled) this.scheduleMusic();
    }
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

  // D major / B minor colours: warm and unresolved, never a "track" that ends.
  private static CHORDS = [
    [146.83, 185.0, 220.0, 277.18, 329.63], // Dmaj9
    [123.47, 146.83, 185.0, 220.0, 277.18], // Bm9
    [98.0, 123.47, 146.83, 185.0, 220.0], // Gmaj9
    [110.0, 146.83, 164.81, 220.0, 246.94], // A6sus
  ];
  private static BELLS = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66];

  private voice(freq: number, start: number, length: number, gain: number, type: OscillatorType, attack: number) {
    if (!this.ctx || !this.musicBus) return;
    try {
      const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
      osc.type = type; osc.frequency.value = freq; osc.detune.value = (Math.random() - 0.5) * 10;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(gain, start + attack);
      g.gain.setTargetAtTime(0, start + length - attack, attack / 3);
      osc.connect(g).connect(this.musicBus); osc.start(start); osc.stop(start + length + attack);
    } catch { /* ignore */ }
  }

  /** Schedules the next pad chord (≈10 s each) and a few slow bells over it, a little ahead of time. */
  private scheduleMusic() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.nextChord < now) this.nextChord = now + 0.2;
    if (this.nextChord > now + 1.5) return;
    const start = this.nextChord, length = 10.5;
    const deep = this.depth > 0.62;
    const chord = AudioEngine.CHORDS[this.chordIndex++ % AudioEngine.CHORDS.length];
    const octave = deep ? 0.5 : 1;
    for (const f of chord) {
      this.voice(f * octave, start, length, 0.022, 'triangle', 2.8);
      this.voice(f * octave * 2, start + 0.3, length, 0.008, 'sine', 3.2);
    }
    const bells = deep ? 2 : 4;
    for (let i = 0; i < bells; i++) {
      if (Math.random() < 0.3) continue;
      const f = AudioEngine.BELLS[Math.floor(Math.random() * AudioEngine.BELLS.length)] * (deep ? 0.5 : 1);
      this.voice(f, start + 1 + Math.random() * 8, 2.6, 0.03, 'sine', 0.02);
    }
    this.nextChord = start + 10;
  }

  chime() { this.tone(660, 0, 1.2, 0.08); this.tone(990, 0.12, 1.4, 0.06); }
  pulse() { this.tone(220, 0, 2.2, 0.09); this.tone(330, 0.05, 2.4, 0.05, 'triangle'); }
  reveal() { this.tone(82, 0, 5, 0.12); this.tone(123, 0.6, 5, 0.06); }
  tap() { this.tone(520, 0, 0.25, 0.04); }

  suspend() { void this.ctx?.suspend().catch(() => {}); }
  resume() { void this.ctx?.resume().catch(() => {}); }
}

export const audio = new AudioEngine();
