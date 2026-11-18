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
};

export type Motion = 'still' | 'slow' | 'fast';

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
  private openRaw = 0;
  private closedRaw = 0;
  private cooldown = 0;

  get ready() { return this.tracked && this.trackedFor >= GESTURE.settleTime; }

  reset() {
    this.tracked = false; this.trackedFor = 0;
    this.vx = this.vy = this.vz = 0; this.speed = 0;
    this.motion = 'still'; this.openPalm = false; this.openFor = 0; this.sweep = false;
    this.openRaw = 0; this.closedRaw = 0;
  }

  update(sample: HandSample, delta: number) {
    const dt = Math.min(Math.max(Number.isFinite(delta) ? delta : 0, 0), 0.1);
    this.sweep = false;
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
    const follow = 1 - Math.exp(-dt * 30);
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
  }
}

export type PinchOwner = 'none' | 'target' | 'pulse' | 'travel';

/**
 * Decides what a pinch that starts now will do for its whole duration.
 * Priority: UI/species targets under the ray > armed light pulse > travel.
 */
export function arbitratePinch(input: {
  rayOnTarget: boolean; immersed: boolean; paused: boolean; pulseArmed: boolean; otherHandTravelling: boolean;
}): PinchOwner {
  if (input.rayOnTarget) return 'target';
  if (!input.immersed || input.paused) return 'none';
  if (input.pulseArmed) return 'pulse';
  if (input.otherHandTravelling) return 'none';
  return 'travel';
}
