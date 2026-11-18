// Pure reef-shark behaviour: CRUISE → NOTICE → INVESTIGATE → TURN_AWAY → done.
// Smooth heading changes, a hard comfort radius around the viewer, and timeouts.

export type SharkState = 'absent' | 'cruise' | 'notice' | 'investigate' | 'turnAway' | 'done';

export const SHARK = {
  spawnDistance: 22,
  exitDistance: 24,
  comfortRadius: 3.2,
  orbitRadius: 4.2,
  cruiseSpeed: 0.9,
  noticeSpeed: 0.55,
  orbitSpeed: 0.7,
  exitSpeed: 1.1,
  maxTurnRate: 0.55, // rad/s: no snapping or lunges
  noticeDistance: 9,
  noticeTime: 2.5,
  investigateTime: 9,
  timeout: 75,
};

export class SharkBrain {
  state: SharkState = 'absent';
  stateTime = 0;
  totalTime = 0;
  x = 0; y = 0; z = 0;
  /** Unit heading. */
  hx = 0; hy = 0; hz = -1;
  speed = 0;
  /** Visual presence 0..1 (fades in from the haze and out when leaving). */
  presence = 0;
  /** Swim phase for tail animation. */
  phase = 0;
  viewer = { x: 0, y: 1.5, z: 0 };
  /** Point of interest (the school) the cruise passes beside, so the cause is visible. */
  focus = { x: 0, y: 1.4, z: -2.4 };
  statesVisited: SharkState[] = [];
  private orbitAngle = 0;
  private orbitDirection = 1;
  private entryAngle = 0;
  minViewerDistance = Infinity;

  get active() { return this.state !== 'absent' && this.state !== 'done'; }

  start(angle: number) {
    this.entryAngle = angle;
    this.x = this.viewer.x + Math.cos(angle) * SHARK.spawnDistance;
    this.z = this.viewer.z + Math.sin(angle) * SHARK.spawnDistance;
    this.y = this.viewer.y - 0.6;
    this.steerTo(this.focus.x, this.y, this.focus.z, Infinity);
    this.speed = SHARK.cruiseSpeed;
    this.presence = 0;
    this.totalTime = 0;
    this.minViewerDistance = Infinity;
    this.statesVisited.length = 0;
    this.enter('cruise');
  }

  stop() { this.state = 'absent'; this.presence = 0; }

  /** Calmly end the encounter: turn away and leave (no-op if already leaving). */
  leave() { if (this.active && this.state !== 'turnAway') this.enter('turnAway'); }

  private enter(state: SharkState) {
    this.state = state; this.stateTime = 0; this.statesVisited.push(state);
  }

  private steerTo(tx: number, ty: number, tz: number, maxAngle: number) {
    let dx = tx - this.x, dy = ty - this.y, dz = tz - this.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-5) return;
    dx /= d; dy /= d; dz /= d;
    const dot = Math.min(1, Math.max(-1, dx * this.hx + dy * this.hy + dz * this.hz));
    const angle = Math.acos(dot);
    const t = angle <= maxAngle || angle < 1e-5 ? 1 : maxAngle / angle;
    let nx = this.hx + (dx - this.hx) * t, ny = this.hy + (dy - this.hy) * t, nz = this.hz + (dz - this.hz) * t;
    if (Math.hypot(nx, ny, nz) < 1e-3) { nx = this.hz; ny = 0; nz = -this.hx; } // opposite: turn sideways
    const l = Math.hypot(nx, ny, nz);
    this.hx = nx / l; this.hy = Math.max(-0.25, Math.min(0.25, ny / l)); this.hz = nz / l;
    const l2 = Math.hypot(this.hx, this.hy, this.hz);
    this.hx /= l2; this.hy /= l2; this.hz /= l2;
  }

  distanceToViewer() { return Math.hypot(this.x - this.viewer.x, this.y - this.viewer.y, this.z - this.viewer.z); }

  update(delta: number) {
    if (!this.active) return;
    const dt = Math.min(Math.max(Number.isFinite(delta) ? delta : 0, 0), 0.05);
    this.stateTime += dt; this.totalTime += dt;
    const v = this.viewer, turn = SHARK.maxTurnRate * dt;
    const distance = this.distanceToViewer();
    let targetSpeed = SHARK.cruiseSpeed;
    if (this.totalTime > SHARK.timeout && this.state !== 'turnAway') this.enter('turnAway');
    switch (this.state) {
      case 'cruise': {
        // Pass just beyond the school (farther from the viewer than the fish).
        const fx = this.focus.x - v.x, fz = this.focus.z - v.z, fl = Math.hypot(fx, fz) || 1;
        const side = Math.cos(this.entryAngle) >= 0 ? 1 : -1;
        const px = this.focus.x + fx / fl * 1.6 - fz / fl * side * 0.8, pz = this.focus.z + fz / fl * 1.6 + fx / fl * side * 0.8;
        this.steerTo(px, this.focus.y - 0.2, pz, turn);
        const nearFocus = Math.hypot(this.x - px, this.z - pz) < 2.2;
        if (nearFocus || distance < SHARK.noticeDistance - 3 || this.stateTime > 30) this.enter('notice');
        break;
      }
      case 'notice': {
        // Slows and turns its head toward the viewer, at a distance.
        targetSpeed = SHARK.noticeSpeed;
        this.steerTo(v.x, v.y - 0.5, v.z, turn * 0.8);
        if (this.stateTime > SHARK.noticeTime || distance < SHARK.orbitRadius + 0.6) {
          this.orbitAngle = Math.atan2(this.z - v.z, this.x - v.x);
          const cross = this.hx * (this.z - v.z) - this.hz * (this.x - v.x);
          this.orbitDirection = cross >= 0 ? 1 : -1;
          this.enter('investigate');
        }
        break;
      }
      case 'investigate': {
        targetSpeed = SHARK.orbitSpeed;
        this.orbitAngle += this.orbitDirection * (SHARK.orbitSpeed / SHARK.orbitRadius) * dt;
        const lead = this.orbitAngle + this.orbitDirection * 0.5;
        this.steerTo(v.x + Math.cos(lead) * SHARK.orbitRadius, v.y - 0.4, v.z + Math.sin(lead) * SHARK.orbitRadius, turn * 1.4);
        if (this.stateTime > SHARK.investigateTime) this.enter('turnAway');
        break;
      }
      case 'turnAway': {
        targetSpeed = SHARK.exitSpeed;
        const ox = this.x - v.x, oz = this.z - v.z, ol = Math.hypot(ox, oz) || 1;
        this.steerTo(this.x + ox / ol * 10 + this.hx * 4, v.y - 1, this.z + oz / ol * 10 + this.hz * 4, turn);
        if (distance > SHARK.exitDistance || this.totalTime > SHARK.timeout + 30) this.enter('done');
        break;
      }
    }
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 0.8);
    this.x += this.hx * this.speed * dt; this.y += this.hy * this.speed * dt; this.z += this.hz * this.speed * dt;
    // Hard comfort radius: never closer than comfortRadius.
    const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z, d = Math.hypot(dx, dy, dz);
    if (d < SHARK.comfortRadius && d > 1e-5) {
      const k = SHARK.comfortRadius / d;
      this.x = v.x + dx * k; this.y = v.y + dy * k; this.z = v.z + dz * k;
    }
    this.minViewerDistance = Math.min(this.minViewerDistance, this.distanceToViewer());
    const leaving = this.state === 'turnAway' ? Math.max(0, 1 - (this.distanceToViewer() - 14) / 9) : 1;
    const target = this.state === 'done' ? 0 : Math.min(1, leaving);
    this.presence += (target - this.presence) * Math.min(1, dt * 0.6);
    this.phase = (this.phase + dt * (2.2 + this.speed * 2.5)) % (Math.PI * 2);
  }
}
