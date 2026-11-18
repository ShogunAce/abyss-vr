// Pure boids: separation, alignment, cohesion, hand attraction, threat response.
// Typed arrays and a spatial hash; no per-step allocation.

export type SchoolState = 'schooling' | 'attracted' | 'scattering' | 'evading';

export type FlockInfluence = { active: boolean; x: number; y: number; z: number };

export const FLOCK = {
  neighbor: 0.55,
  separation: 0.22,
  wSeparation: 2.2,
  wAlignment: 1.0,
  wCohesion: 0.7,
  wHome: 0.9,
  wHand: 0.9,
  wScatter: 7,
  wThreat: 6,
  wViewer: 9,
  minSpeed: 0.22,
  maxSpeed: 0.75,
  panicSpeed: 2.0,
  maxForce: 2.4,
  handRange: 1.2,
  /** Fish never come closer than this to a hand. */
  handGap: 0.32,
  scatterRange: 1.5,
  scatterTime: 1.6,
  threatRadius: 4,
  viewerRadius: 0.85,
  /** Fish swim mostly level: |vy| ≤ this × horizontal speed. */
  maxClimb: 0.35,
  /** Heading smoothing (1/s) and banking for rendering. */
  turnRate: 5,
  maxBank: 0.55,
  step: 1 / 60,
};

const TABLE = 512;

export class Flock {
  readonly capacity: number;
  readonly pos: Float32Array;
  readonly vel: Float32Array;
  /** Visual presence 0..1 per fish (spawn/despawn without popping). */
  readonly presence: Float32Array;
  /** Swim phase per fish, advanced by speed (drives tail animation). */
  readonly phase: Float32Array;
  /** Smoothed unit heading per fish (render orientation; never snaps). */
  readonly dir: Float32Array;
  /** Roll into turns, radians. */
  readonly bank: Float32Array;
  /** Extra keep-out spheres (e.g. the sphere and Depth Compass), up to 4. */
  obstacles: Array<{ active: boolean; x: number; y: number; z: number; r: number }> = [0, 1, 2, 3].map(() => ({ active: false, x: 0, y: 0, z: 0, r: 0 }));
  activeCount: number;
  home = { x: 0, y: 1.4, z: -2.2, radius: 1.4 };
  viewer = { x: 0, y: 1.5, z: 0 };
  hands: FlockInfluence[] = [{ active: false, x: 0, y: 0, z: 0 }, { active: false, x: 0, y: 0, z: 0 }];
  threat: FlockInfluence & { radius: number } = { active: false, x: 0, y: 0, z: 0, radius: FLOCK.threatRadius };
  scatterFrom = { x: 0, y: 0, z: 0 };
  scatterTimer = 0;
  scatterCount = 0;
  state: SchoolState = 'schooling';
  /** Panic level from the latest threat (0..1), useful for diagnostics. */
  threatLevel = 0;
  private head = new Int32Array(TABLE);
  private next: Int32Array;
  private accumulator = 0;
  private random: () => number;

  constructor(capacity: number, seed = 11) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.presence = new Float32Array(capacity);
    this.phase = new Float32Array(capacity);
    this.dir = new Float32Array(capacity * 3);
    this.bank = new Float32Array(capacity);
    this.next = new Int32Array(capacity);
    this.activeCount = capacity;
    let s = seed >>> 0;
    this.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    this.scatterAround(this.home.x, this.home.y, this.home.z, this.home.radius);
  }

  /** Re-seed every fish around a point (used on reset/restart; never per frame). */
  scatterAround(cx: number, cy: number, cz: number, radius: number) {
    for (let i = 0; i < this.capacity; i++) {
      const a = this.random() * Math.PI * 2, r = Math.sqrt(this.random()) * radius;
      this.pos[i * 3] = cx + Math.cos(a) * r;
      this.pos[i * 3 + 1] = cy + (this.random() - 0.5) * radius * 0.6;
      this.pos[i * 3 + 2] = cz + Math.sin(a) * r;
      this.vel[i * 3] = Math.cos(a + 1.6) * 0.3;
      this.vel[i * 3 + 1] = 0;
      this.vel[i * 3 + 2] = Math.sin(a + 1.6) * 0.3;
      this.presence[i] = i < this.activeCount ? 1 : 0;
      this.phase[i] = this.random() * Math.PI * 2;
      const l = Math.hypot(this.vel[i * 3], this.vel[i * 3 + 2]) || 1;
      this.dir[i * 3] = this.vel[i * 3] / l; this.dir[i * 3 + 1] = 0; this.dir[i * 3 + 2] = this.vel[i * 3 + 2] / l;
      this.bank[i] = 0;
    }
    this.scatterTimer = 0;
    this.state = 'schooling';
  }

  /** Begin a scatter from a point (fast hand sweep). */
  scatter(x: number, y: number, z: number) {
    this.scatterFrom.x = x; this.scatterFrom.y = y; this.scatterFrom.z = z;
    this.scatterTimer = FLOCK.scatterTime;
    this.scatterCount++;
  }

  private key(x: number, y: number, z: number) {
    const ix = Math.floor(x / FLOCK.neighbor), iy = Math.floor(y / FLOCK.neighbor), iz = Math.floor(z / FLOCK.neighbor);
    return ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) & (TABLE - 1);
  }

  private build() {
    this.head.fill(-1);
    for (let i = 0; i < this.capacity; i++) {
      const k = this.key(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      this.next[i] = this.head[k]; this.head[k] = i;
    }
  }

  /** Advance with fixed sub-steps (bounded: at most 4 per call). */
  update(delta: number) {
    const dt = Math.min(Math.max(Number.isFinite(delta) ? delta : 0, 0), 0.1);
    this.accumulator = Math.min(this.accumulator + dt, FLOCK.step * 4);
    while (this.accumulator >= FLOCK.step) { this.step(FLOCK.step); this.accumulator -= FLOCK.step; }
  }

  private step(dt: number) {
    this.build();
    const p = this.pos, v = this.vel, F = FLOCK;
    const scattering = this.scatterTimer > 0;
    this.scatterTimer = Math.max(0, this.scatterTimer - dt);
    let attracted = false, evading = false;
    let maxThreat = 0;
    const n2 = F.neighbor * F.neighbor, s2 = F.separation * F.separation;
    for (let i = 0; i < this.capacity; i++) {
      const target = i < this.activeCount ? 1 : 0;
      this.presence[i] += (target - this.presence[i]) * Math.min(1, dt * 0.8);
      const ix = i * 3, px = p[ix], py = p[ix + 1], pz = p[ix + 2];
      let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, count = 0;
      const gx = Math.floor(px / F.neighbor), gy = Math.floor(py / F.neighbor), gz = Math.floor(pz / F.neighbor);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (let oz = -1; oz <= 1; oz++) {
        let j = this.head[(((gx + ox) * 73856093) ^ ((gy + oy) * 19349663) ^ ((gz + oz) * 83492791)) & (TABLE - 1)];
        while (j !== -1) {
          if (j !== i && j < this.activeCount === i < this.activeCount) {
            const jx = j * 3, dx = px - p[jx], dy = py - p[jx + 1], dz = pz - p[jx + 2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < n2 && d2 > 1e-8) {
              count++;
              ax += v[jx]; ay += v[jx + 1]; az += v[jx + 2];
              cx += p[jx]; cy += p[jx + 1]; cz += p[jx + 2];
              if (d2 < s2) { sx += dx / d2; sy += dy / d2; sz += dz / d2; }
            }
          }
          j = this.next[j];
        }
      }
      let fx = 0, fy = 0, fz = 0;
      fx += sx * F.wSeparation * 0.02; fy += sy * F.wSeparation * 0.02; fz += sz * F.wSeparation * 0.02;
      if (count > 0) {
        fx += (ax / count - v[ix]) * F.wAlignment; fy += (ay / count - v[ix + 1]) * F.wAlignment; fz += (az / count - v[ix + 2]) * F.wAlignment;
        fx += (cx / count - px) * F.wCohesion; fy += (cy / count - py) * F.wCohesion; fz += (cz / count - pz) * F.wCohesion;
      }
      // Home volume: inactive fish leave toward a distant point, then fade.
      const hx = target ? this.home.x : this.home.x + (i % 2 ? 9 : -9);
      const hz = target ? this.home.z : this.home.z - 8;
      const tx = hx - px, ty = this.home.y - py, tz = hz - pz;
      const hd = Math.hypot(tx, ty, tz);
      if (hd > this.home.radius * 0.5) { const k = F.wHome * Math.min(1, (hd - this.home.radius * 0.5) / this.home.radius) / hd; fx += tx * k; fy += ty * k * 1.4; fz += tz * k; }
      // Hands: steady/slow hands invite fish; they settle in a ring, never inside the hand.
      for (const hand of this.hands) {
        if (!hand.active || !target) continue;
        const dx = hand.x - px, dy = hand.y - py, dz = hand.z - pz, d = Math.hypot(dx, dy, dz);
        if (d < F.handRange && d > F.handGap) { const k = F.wHand * (1 - d / F.handRange) / d; fx += dx * k; fy += dy * k; fz += dz * k; attracted = true; }
        else if (d <= F.handGap && d > 1e-4) { const k = 3 * (1 - d / F.handGap) / d; fx -= dx * k; fy -= dy * k; fz -= dz * k; }
      }
      // Fast sweep: strong radial burst for a short time.
      if (scattering) {
        const dx = px - this.scatterFrom.x, dy = py - this.scatterFrom.y, dz = pz - this.scatterFrom.z, d = Math.hypot(dx, dy, dz);
        if (d < F.scatterRange && d > 1e-4) { const k = F.wScatter * (1 - d / F.scatterRange) / d; fx += dx * k; fy += dy * k; fz += dz * k; }
      }
      // Predator threat field.
      if (this.threat.active) {
        const dx = px - this.threat.x, dy = py - this.threat.y, dz = pz - this.threat.z, d = Math.hypot(dx, dy, dz);
        if (d < this.threat.radius && d > 1e-4) {
          const level = 1 - d / this.threat.radius;
          maxThreat = Math.max(maxThreat, level);
          const k = F.wThreat * level / d; fx += dx * k; fy += dy * k * 0.5; fz += dz * k; evading = true;
        }
      }
      // Comfort: fish never swim through the viewer's head.
      {
        const dx = px - this.viewer.x, dy = py - this.viewer.y, dz = pz - this.viewer.z, d = Math.hypot(dx, dy, dz);
        if (d < F.viewerRadius && d > 1e-4) { const k = F.wViewer * (1 - d / F.viewerRadius) / d; fx += dx * k; fy += dy * k; fz += dz * k; }
      }
      for (const o of this.obstacles) {
        if (!o.active) continue;
        const dx = px - o.x, dy = py - o.y, dz = pz - o.z, d = Math.hypot(dx, dy, dz);
        if (d < o.r && d > 1e-4) { const k = F.wViewer * (1 - d / o.r) / d; fx += dx * k; fy += dy * k; fz += dz * k; }
      }
      const panic = (scattering || maxThreat > 0.05) ? 1 : 0;
      const maxForce = panic ? F.maxForce * 4 : F.maxForce;
      const fl = Math.hypot(fx, fy, fz);
      if (fl > maxForce) { fx *= maxForce / fl; fy *= maxForce / fl; fz *= maxForce / fl; }
      let vx = v[ix] + fx * dt, vy = (v[ix + 1] + fy * dt) * 0.985, vz = v[ix + 2] + fz * dt;
      const maxSpeed = panic ? F.panicSpeed : F.maxSpeed;
      const speed = Math.hypot(vx, vy, vz);
      if (speed > maxSpeed) { vx *= maxSpeed / speed; vy *= maxSpeed / speed; vz *= maxSpeed / speed; }
      else if (speed < F.minSpeed && speed > 1e-5) { vx *= F.minSpeed / speed; vy *= F.minSpeed / speed; vz *= F.minSpeed / speed; }
      // Real fish cruise level: limit climb/dive relative to forward speed.
      const horizontal = Math.hypot(vx, vz);
      const maxVy = F.maxClimb * Math.max(horizontal, F.minSpeed);
      if (vy > maxVy) vy = maxVy; else if (vy < -maxVy) vy = -maxVy;
      v[ix] = vx; v[ix + 1] = vy; v[ix + 2] = vz;
      // Smoothed heading with turn-rate limit, and banking proportional to yaw rate.
      const sp = Math.hypot(vx, vy, vz) || 1;
      const ox = this.dir[ix], oz = this.dir[ix + 2];
      const t = Math.min(1, dt * F.turnRate);
      let ux = ox + (vx / sp - ox) * t, uy = this.dir[ix + 1] + (vy / sp - this.dir[ix + 1]) * t, uz = oz + (vz / sp - oz) * t;
      const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
      const yawRate = (ox * uz - oz * ux) / dt;
      const targetBank = Math.max(-F.maxBank, Math.min(F.maxBank, yawRate * 0.35));
      this.bank[i] += (targetBank - this.bank[i]) * Math.min(1, dt * 4);
      this.dir[ix] = ux; this.dir[ix + 1] = uy; this.dir[ix + 2] = uz;
      p[ix] = px + vx * dt; p[ix + 1] = py + vy * dt; p[ix + 2] = pz + vz * dt;
      this.phase[i] = (this.phase[i] + dt * (6 + Math.hypot(vx, vy, vz) * 14)) % (Math.PI * 2);
    }
    this.threatLevel = maxThreat;
    this.state = evading ? 'evading' : scattering ? 'scattering' : attracted ? 'attracted' : 'schooling';
  }

  /** Mean distance of active fish from a point (test/diagnostic helper). */
  meanDistance(x: number, y: number, z: number) {
    let sum = 0;
    for (let i = 0; i < this.activeCount; i++) sum += Math.hypot(this.pos[i * 3] - x, this.pos[i * 3 + 1] - y, this.pos[i * 3 + 2] - z);
    return this.activeCount ? sum / this.activeCount : 0;
  }

  meanSpeed() {
    let sum = 0;
    for (let i = 0; i < this.activeCount; i++) sum += Math.hypot(this.vel[i * 3], this.vel[i * 3 + 1], this.vel[i * 3 + 2]);
    return this.activeCount ? sum / this.activeCount : 0;
  }

  minDistance(x: number, y: number, z: number) {
    let min = Infinity;
    for (let i = 0; i < this.activeCount; i++) min = Math.min(min, Math.hypot(this.pos[i * 3] - x, this.pos[i * 3 + 1] - y, this.pos[i * 3 + 2] - z));
    return min;
  }
}
