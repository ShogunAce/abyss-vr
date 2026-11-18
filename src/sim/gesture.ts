// Pure hand-gesture interpretation: smoothing, velocity, open palm, sweeps.
// No Three.js/DOM imports so it can be unit-tested in Node.

export type HandSample = {
  tracked: boolean;
  /** Palm centre, world metres. */
  x: number; y: number; z: number;
  /** Number of extended fingers (index..pinky), 0–4. */
  extended: number;
  /** Thumb-tip to index-tip distance, metres. */
  pinchDistance: number;
  /** Index-tip to pinky-tip distance, metres (fingers spread apart). */
  spread?: number;
  /** Platform select (pinch) currently held. */
  select: boolean;
  /** Index straight, middle/ring/pinky curled, thumb apart: the "point" sign. */
  point?: boolean;
  /** All four fingers curled, no pinch: the "fist" sign. */
  fist?: boolean;
};

export type Motion = 'still' | 'slow' | 'fast';

/** One Euro filter smoothing factor: low cutoff (less jitter) at rest, rising with speed (less lag). */
export function oneEuroAlpha(dt: number, speed: number, minCutoff = 2.0, beta = 6.0) {
  const cutoff = minCutoff + beta * speed;
  const r = 2 * Math.PI * cutoff * dt;
  return r / (1 + r);
}

/** One Euro filter for a 3D point (fingertips). */
export class OneEuro3 {
  x = 0; y = 0; z = 0; speed = 0; ok = false;
  minCutoff: number; beta: number;
  // Plain fields (no parameter properties): Node's type stripping runs this module in tests.
  constructor(minCutoff = 2.5, beta = 8) { this.minCutoff = minCutoff; this.beta = beta; }
  reset() { this.ok = false; this.speed = 0; }
  update(x: number, y: number, z: number, dt: number) {
    if (!this.ok || dt <= 0 || Math.hypot(x - this.x, y - this.y, z - this.z) > GESTURE.maxJump) {
      this.x = x; this.y = y; this.z = z; this.ok = true; this.speed = 0; return;
    }
    const raw = Math.hypot(x - this.x, y - this.y, z - this.z) / dt;
    this.speed += (raw - this.speed) * Math.min(1, dt * 20);
    const a = oneEuroAlpha(dt, this.speed, this.minCutoff, this.beta);
    this.x += (x - this.x) * a; this.y += (y - this.y) * a; this.z += (z - this.z) * a;
  }
}

export const GESTURE = {
  /** Ignore gestures for this long after tracking (re)appears: prevents trigger storms. */
  settleTime: 0.3,
  stillSpeed: 0.04,
  fastEnter: 0.7,
  fastExit: 0.45,
  sweepCooldown: 0.8,
  /** A single-update jump this large is a tracking glitch, never a gesture. Distance-based so
   *  low-rate (e.g. 30 Hz) pose updates arriving in bursts still read as real motion. */
  maxJump: 0.25,
  openHold: 0.25,
  openRelease: 0.2,
  // A relaxed hand also has 4 roughly straight fingers; a deliberate open palm
  // (high five) abducts the thumb and spreads the fingers.
  openPinchDistance: 0.11,
  openSpread: 0.115,
  /** Point (swim): short hold to start, brief grace on release so tracking flicker never stops a glide. */
  pointHold: 0.18,
  pointRelease: 0.3,
  /** Fist (menu): deliberate hold, fires once per fist. */
  fistHold: 0.6,
  /** Open palm (light): held this long releases one pulse; reopen for another. */
  palmPulse: 1.1,
};

export class HandGesture {
  tracked = false;
  trackedFor = 0;
  x = 0; y = 0; z = 0;
  vx = 0; vy = 0; vz = 0;
  speed = 0;
  motion: Motion = 'still';
  openPalm = false;
  /** Seconds the stable open palm has been held. */
  openFor = 0;
  /** True for exactly one update when a fast sweep begins. */
  sweep = false;
  sweepCount = 0;
  /** Point sign held (swim toward where the index finger points). */
  pointing = false;
  /** True for one update when a held fist completes (toggle the menu). */
  fistToggle = false;
  /** True for one update when an open palm has been held long enough to release a light pulse. */
  palmPulse = false;
  private pointRaw = 0;
  private unpointRaw = 0;
  private fistRaw = 0;
  private fistFired = false;
  private pulseFired = false;
  private openRaw = 0;
  private closedRaw = 0;
  private cooldown = 0;

  get ready() { return this.tracked && this.trackedFor >= GESTURE.settleTime; }

  reset() {
    this.tracked = false; this.trackedFor = 0;
    this.vx = this.vy = this.vz = 0; this.speed = 0;
    this.motion = 'still'; this.openPalm = false; this.openFor = 0; this.sweep = false;
    this.openRaw = 0; this.closedRaw = 0;
    this.pointing = false; this.pointRaw = 0; this.unpointRaw = 0;
    this.fistToggle = false; this.fistRaw = 0; this.fistFired = false;
    this.palmPulse = false; this.pulseFired = false;
  }

  update(sample: HandSample, delta: number) {
    const dt = Math.min(Math.max(Number.isFinite(delta) ? delta : 0, 0), 0.1);
    this.sweep = false;
    this.fistToggle = false;
    this.palmPulse = false;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!sample.tracked) { this.reset(); return; }
    if (!this.tracked) {
      // Reacquired: snap to the new pose with zero velocity, so no false sweep.
      this.tracked = true; this.trackedFor = 0;
      this.x = sample.x; this.y = sample.y; this.z = sample.z;
      this.vx = this.vy = this.vz = 0; this.speed = 0;
      return;
    }
    this.trackedFor += dt;
    if (dt <= 0) return;
    if (Math.hypot(sample.x - this.x, sample.y - this.y, sample.z - this.z) > GESTURE.maxJump) {
      // Tracking jump (glitch or re-localisation): snap, zero velocity, no gesture.
      this.x = sample.x; this.y = sample.y; this.z = sample.z;
      this.vx = this.vy = this.vz = 0; this.speed = 0; this.motion = 'still';
      return;
    }
    // One Euro: removes tracking jitter when the hand rests, follows quick motions closely.
    const follow = oneEuroAlpha(dt, this.speed);
    const nx = this.x + (sample.x - this.x) * follow;
    const ny = this.y + (sample.y - this.y) * follow;
    const nz = this.z + (sample.z - this.z) * follow;
    const blend = 1 - Math.exp(-dt * 14);
    this.vx += ((nx - this.x) / dt - this.vx) * blend;
    this.vy += ((ny - this.y) / dt - this.vy) * blend;
    this.vz += ((nz - this.z) / dt - this.vz) * blend;
    this.x = nx; this.y = ny; this.z = nz;
    this.speed = Math.hypot(this.vx, this.vy, this.vz);

    if (!this.ready) { this.motion = 'still'; return; }
    const wasFast = this.motion === 'fast';
    if (wasFast ? this.speed > GESTURE.fastExit : this.speed > GESTURE.fastEnter) this.motion = 'fast';
    else this.motion = this.speed < GESTURE.stillSpeed ? 'still' : 'slow';
    if (!wasFast && this.motion === 'fast' && this.cooldown === 0) {
      this.sweep = true; this.sweepCount++; this.cooldown = GESTURE.sweepCooldown;
    }

    const open = sample.extended >= 4 && sample.pinchDistance > GESTURE.openPinchDistance && (sample.spread ?? 1) > GESTURE.openSpread && !sample.select;
    if (open) { this.openRaw += dt; this.closedRaw = 0; } else { this.closedRaw += dt; this.openRaw = 0; }
    if (!this.openPalm && this.openRaw >= GESTURE.openHold) this.openPalm = true;
    if (this.openPalm && this.closedRaw >= GESTURE.openRelease) this.openPalm = false;
    this.openFor = this.openPalm ? this.openFor + dt : 0;
    if (!this.openPalm) this.pulseFired = false;
    if (this.openPalm && !this.pulseFired && this.openFor >= GESTURE.palmPulse) { this.palmPulse = true; this.pulseFired = true; }

    // Point: index out, others curled. Exclusive with open palm (4 fingers) and fist (0 fingers).
    const point = !!sample.point && !sample.select;
    if (point) { this.pointRaw += dt; this.unpointRaw = 0; } else { this.unpointRaw += dt; this.pointRaw = 0; }
    if (!this.pointing && this.pointRaw >= GESTURE.pointHold) this.pointing = true;
    if (this.pointing && this.unpointRaw >= GESTURE.pointRelease) this.pointing = false;

    // Fist: held still-ish for fistHold, fires once until the hand opens again.
    const fist = !!sample.fist && !sample.select && this.motion !== 'fast';
    this.fistRaw = fist ? this.fistRaw + dt : 0;
    if (!fist) this.fistFired = false;
    if (fist && !this.fistFired && this.fistRaw >= GESTURE.fistHold) { this.fistToggle = true; this.fistFired = true; }
  }
}

export type PinchOwner = 'none' | 'target';

/**
 * One sign, one job. A pinch only ever selects what the ray is on (a creature,
 * a button, the pearl). Swimming is the point sign; light is the open palm.
 */
export function arbitratePinch(input: { rayOnTarget: boolean }): PinchOwner {
  return input.rayOnTarget ? 'target' : 'none';
}

/** Hand signs shown in the menu's Hand signs page: each sign maps to exactly one action. */
export const HAND_SIGNS = [
  { id: 'pinch', icon: '🤏', name: 'Pinch', does: 'Select', detail: 'Point the ray at a creature, button or the pearl, then pinch thumb and index.' },
  { id: 'point', icon: '👉', name: 'Point', does: 'Swim', detail: 'Index finger out, other fingers curled. You glide where you point.' },
  { id: 'palm', icon: '✋', name: 'Open palm', does: 'Make light', detail: 'Spread your fingers and hold. In the dark it glows; hold 1 s to send a pulse.' },
  { id: 'fist', icon: '✊', name: 'Fist', does: 'Menu', detail: 'Hold a raised fist for a moment to show or hide this menu.' },
  { id: 'sweep', icon: '👋', name: 'Quick sweep', does: 'Startle', detail: 'Swipe fast through a school and watch it scatter and regroup.' },
  { id: 'touch', icon: '☝️', name: 'Touch', does: 'Dive', detail: 'Touch the glowing pearl with a fingertip to let the ocean in.' },
] as const;
