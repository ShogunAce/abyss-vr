// Pure bioluminescence: organism state machines, palm light, expanding pulse
// wavefronts, and the hero reveal. Designed interaction, not a biological claim.

export const DORMANT = 0, STIMULATED = 1, GLOWING = 2, FADING = 3;
export const BIO = {
  waveSpeed: 3.2,
  maxRadius: 16,
  pulseCooldown: 1.2,
  stimulateTime: 0.15,
  glowTime: 2.6,
  fadeTime: 2.2,
  palmRadius: 1.1,
  palmGlow: 0.45,
};

export type RevealState = 'hidden' | 'emerging' | 'revealed' | 'fading';
export const REVEAL = { emerge: 5, hold: 32, fade: 6, minDepth: 0.78 };

export class BiolumField {
  readonly count: number;
  readonly pos: Float32Array;
  readonly state: Uint8Array;
  readonly timer: Float32Array;
  /** Rendered glow 0..1. */
  readonly glow: Float32Array;
  /** Order in which organisms were stimulated by the latest pulse (diagnostics/tests). */
  readonly responseOrder: number[] = [];
  pulses = [
    { active: false, x: 0, y: 0, z: 0, radius: 0, id: 0 },
    { active: false, x: 0, y: 0, z: 0, radius: 0, id: 0 },
    { active: false, x: 0, y: 0, z: 0, radius: 0, id: 0 },
  ];
  pulseCount = 0;
  responses = 0;
  palm = { active: false, x: 0, y: 0, z: 0 };
  /** 0..1 how awake the field is (depth-gated by the caller). */
  enabled = 0;
  hero = { x: 0, y: 0, z: -11, state: 'hidden' as RevealState, timer: 0, level: 0, reveals: 0 };
  private cooldown = 0;
  private palmTouched: Uint8Array;

  constructor(count: number, seed = 5) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.state = new Uint8Array(count);
    this.timer = new Float32Array(count);
    this.glow = new Float32Array(count);
    this.palmTouched = new Uint8Array(count);
    let s = seed >>> 0;
    const random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    // Shell from 0.6 m to 9 m around the viewer origin (ocean-local), denser nearby.
    for (let i = 0; i < count; i++) {
      const u = random() * 2 - 1, a = random() * Math.PI * 2, r = 0.6 + Math.pow(random(), 1.6) * 8.4;
      const ring = Math.sqrt(1 - u * u);
      this.pos[i * 3] = Math.cos(a) * ring * r;
      this.pos[i * 3 + 1] = u * r * 0.45 - 0.3;
      this.pos[i * 3 + 2] = Math.sin(a) * ring * r;
    }
  }

  reset() {
    this.state.fill(DORMANT); this.timer.fill(0); this.glow.fill(0); this.palmTouched.fill(0);
    for (const p of this.pulses) p.active = false;
    this.pulseCount = 0; this.responses = 0; this.responseOrder.length = 0; this.cooldown = 0;
    this.hero.state = 'hidden'; this.hero.timer = 0; this.hero.level = 0;
  }

  get canPulse() { return this.cooldown <= 0; }

  stimulate(i: number) {
    if (this.state[i] === DORMANT || this.state[i] === FADING) {
      this.state[i] = STIMULATED; this.timer[i] = 0; this.responses++;
    } else if (this.state[i] === GLOWING) this.timer[i] = 0; // refresh
  }

  /** Emits one expanding wavefront. Returns false while cooling down. */
  emitPulse(x: number, y: number, z: number) {
    if (this.cooldown > 0) return false;
    const slot = this.pulses.find(p => !p.active) ?? this.pulses[0];
    slot.active = true; slot.x = x; slot.y = y; slot.z = z; slot.radius = 0; slot.id = ++this.pulseCount;
    this.cooldown = BIO.pulseCooldown;
    this.responseOrder.length = 0;
    return true;
  }

  update(delta: number, depth: number) {
    const dt = Math.min(Math.max(Number.isFinite(delta) ? delta : 0, 0), 0.05);
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (const pulse of this.pulses) {
      if (!pulse.active) continue;
      const before = pulse.radius;
      pulse.radius += BIO.waveSpeed * dt;
      for (let i = 0; i < this.count; i++) {
        const d = Math.hypot(this.pos[i * 3] - pulse.x, this.pos[i * 3 + 1] - pulse.y, this.pos[i * 3 + 2] - pulse.z);
        if (d > before && d <= pulse.radius) { this.stimulate(i); this.responseOrder.push(i); }
      }
      const h = Math.hypot(this.hero.x - pulse.x, this.hero.y - pulse.y, this.hero.z - pulse.z);
      if (h > before && h <= pulse.radius && depth >= REVEAL.minDepth && this.hero.state === 'hidden') {
        this.hero.state = 'emerging'; this.hero.timer = 0; this.hero.reveals++;
      }
      if (pulse.radius >= BIO.maxRadius) pulse.active = false;
    }
    for (let i = 0; i < this.count; i++) {
      // Palm light: gentle awakening of organisms near the open hand.
      let palmLevel = 0;
      if (this.palm.active) {
        const d = Math.hypot(this.pos[i * 3] - this.palm.x, this.pos[i * 3 + 1] - this.palm.y, this.pos[i * 3 + 2] - this.palm.z);
        if (d < BIO.palmRadius) palmLevel = BIO.palmGlow * (1 - d / BIO.palmRadius);
        if (palmLevel > 0.05 && !this.palmTouched[i]) { this.palmTouched[i] = 1; this.responses++; }
      } else this.palmTouched[i] = 0;
      this.timer[i] += dt;
      let level = 0;
      switch (this.state[i]) {
        case STIMULATED: level = this.timer[i] / BIO.stimulateTime; if (this.timer[i] >= BIO.stimulateTime) { this.state[i] = GLOWING; this.timer[i] = 0; level = 1; } break;
        case GLOWING: level = 1; if (this.timer[i] >= BIO.glowTime) { this.state[i] = FADING; this.timer[i] = 0; } break;
        case FADING: level = 1 - this.timer[i] / BIO.fadeTime; if (this.timer[i] >= BIO.fadeTime) { this.state[i] = DORMANT; this.timer[i] = 0; level = 0; } break;
      }
      const target = Math.max(level, palmLevel) * this.enabled;
      this.glow[i] += (target - this.glow[i]) * Math.min(1, dt * 10);
    }
    // Hero reveal: slow, never a jump scare.
    const hero = this.hero;
    hero.timer += dt;
    switch (hero.state) {
      case 'emerging': hero.level = Math.min(1, hero.timer / REVEAL.emerge); if (hero.timer >= REVEAL.emerge) { hero.state = 'revealed'; hero.timer = 0; } break;
      case 'revealed': hero.level = 1; if (hero.timer >= REVEAL.hold || depth < REVEAL.minDepth - 0.1) { hero.state = 'fading'; hero.timer = 0; } break;
      case 'fading': hero.level = Math.max(0, 1 - hero.timer / REVEAL.fade); if (hero.timer >= REVEAL.fade) { hero.state = 'hidden'; hero.timer = 0; hero.level = 0; } break;
      default: hero.level = 0;
    }
  }
}
