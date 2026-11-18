// Pure ocean simulation. No Three.js, DOM, or ECS imports: unit-tested directly in Node.
// Normalized depth is a gameplay parameter (0 = sunlit shallows, 1 = midnight), not metres.

export type BandId = 'sunlit' | 'openBlue' | 'twilight' | 'midnight';
export type InteractionMode = 'world' | 'inspect' | 'travel' | 'menu';
export type Rgb = [number, number, number];

export type OceanEvent = { time: number; type: string; detail: string };

export type OceanState = {
  depth: number;
  targetDepth: number;
  depthLocked: boolean;
  ambientLight: number;
  visibility: number;
  fogDensity: number;
  currentStrength: number;
  wildlifeDensity: number;
  bioluminescence: number;
  waterShallow: Rgb;
  waterBlue: Rgb;
  waterDeep: Rgb;
  band: BandId;
  activeEncounter: string | null;
  discoveries: string[];
  interactionMode: InteractionMode;
  paused: boolean;
  reducedMotion: boolean;
  /** Seconds of simulated (unpaused) time. */
  time: number;
  /** Passive drift offset applied to suspended matter, metres. */
  drift: [number, number, number];
  /** Bounded virtual travel offset in the horizontal plane, metres. */
  travel: [number, number];
};

export const BANDS: ReadonlyArray<{ id: BandId; label: string; range: [number, number]; preset: number }> = [
  { id: 'sunlit', label: 'Sunlit', range: [0, 0.3], preset: 0.15 },
  { id: 'openBlue', label: 'Open blue', range: [0.25, 0.6], preset: 0.42 },
  { id: 'twilight', label: 'Twilight', range: [0.55, 0.85], preset: 0.7 },
  { id: 'midnight', label: 'Midnight', range: [0.8, 1], preset: 0.95 },
];

// Environment anchors, blended continuously by depth (linear-space colours).
type Anchor = { depth: number; shallow: Rgb; blue: Rgb; deep: Rgb; light: number; visibility: number; current: number; wildlife: number; glow: number };
const ANCHORS: Anchor[] = [
  { depth: 0.1, shallow: [0.1, 0.56, 0.6], blue: [0.012, 0.24, 0.33], deep: [0.004, 0.05, 0.11], light: 1, visibility: 1, current: 0.35, wildlife: 1, glow: 0 },
  { depth: 0.42, shallow: [0.03, 0.26, 0.48], blue: [0.006, 0.11, 0.27], deep: [0.002, 0.025, 0.09], light: 0.62, visibility: 0.85, current: 0.5, wildlife: 0.75, glow: 0.05 },
  { depth: 0.7, shallow: [0.03, 0.05, 0.17], blue: [0.012, 0.02, 0.1], deep: [0.002, 0.005, 0.035], light: 0.22, visibility: 0.55, current: 0.3, wildlife: 0.35, glow: 0.35 },
  { depth: 0.95, shallow: [0.003, 0.008, 0.026], blue: [0.001, 0.003, 0.012], deep: [0, 0.001, 0.004], light: 0.04, visibility: 0.35, current: 0.15, wildlife: 0.2, glow: 1 },
];

export const DEFAULT_DEPTH = 0.15;
export const MAX_DEPTH_RATE = 0.07; // normalized units per second: 0.15 → 0.95 ≈ 12–14 s
export const MAX_DT = 0.05;
export const TRAVEL_RADIUS = 6;
export const TRAVEL_SPEED = 0.35;
export const REDUCED_TRAVEL_SPEED = 0.15;
const AUTO_DEPTH_RANGE: [number, number] = [0.05, 0.45]; // automatic change never takes the viewer into darkness
const EVENT_LIMIT = 24;

export function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Deterministic PRNG (mulberry32). */
export function createRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Band containing depth, keeping the current band while depth stays inside its (overlapping) range. */
export function bandFor(depth: number, current?: BandId): BandId {
  if (current) {
    const band = BANDS.find(b => b.id === current)!;
    if (depth >= band.range[0] && depth <= band.range[1]) return current;
  }
  // Outside the current band: choose the band whose centre is nearest.
  let best = BANDS[0];
  let bestDistance = Infinity;
  for (const band of BANDS) {
    if (depth < band.range[0] || depth > band.range[1]) continue;
    const distance = Math.abs(depth - (band.range[0] + band.range[1]) / 2);
    if (distance < bestDistance) { best = band; bestDistance = distance; }
  }
  return best.id;
}

function mixRgb(out: Rgb, a: Rgb, b: Rgb, t: number) {
  out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t;
}

/** Writes continuous environment parameters for a depth into state (no allocation). */
export function applyEnvironment(state: OceanState, depth: number) {
  let lower = ANCHORS[0];
  let upper = ANCHORS[ANCHORS.length - 1];
  let t = 0;
  if (depth <= lower.depth) { upper = lower; }
  else if (depth >= upper.depth) { lower = upper; }
  else {
    for (let i = 0; i < ANCHORS.length - 1; i++) {
      if (depth <= ANCHORS[i + 1].depth) {
        lower = ANCHORS[i]; upper = ANCHORS[i + 1];
        t = smooth((depth - lower.depth) / (upper.depth - lower.depth));
        break;
      }
    }
  }
  const lerp = (a: number, b: number) => a + (b - a) * t;
  mixRgb(state.waterShallow, lower.shallow, upper.shallow, t);
  mixRgb(state.waterBlue, lower.blue, upper.blue, t);
  mixRgb(state.waterDeep, lower.deep, upper.deep, t);
  state.ambientLight = lerp(lower.light, upper.light);
  state.visibility = lerp(lower.visibility, upper.visibility);
  state.fogDensity = 0.095 / state.visibility;
  state.currentStrength = lerp(lower.current, upper.current);
  state.wildlifeDensity = lerp(lower.wildlife, upper.wildlife);
  state.bioluminescence = lerp(lower.glow, upper.glow);
}

export function createOceanState(): OceanState {
  const state: OceanState = {
    depth: DEFAULT_DEPTH, targetDepth: DEFAULT_DEPTH, depthLocked: false,
    ambientLight: 1, visibility: 1, fogDensity: 0.095, currentStrength: 0, wildlifeDensity: 1, bioluminescence: 0,
    waterShallow: [0, 0, 0], waterBlue: [0, 0, 0], waterDeep: [0, 0, 0],
    band: 'sunlit', activeEncounter: null, discoveries: [], interactionMode: 'world',
    paused: false, reducedMotion: false, time: 0, drift: [0, 0, 0], travel: [0, 0],
  };
  applyEnvironment(state, state.depth);
  return state;
}

export class OceanDirector {
  readonly state: OceanState = createOceanState();
  readonly events: OceanEvent[] = [];
  private random: () => number;
  private nextAutoChange = 0;
  private driftHeading = 0;

  private seed: number;

  constructor(seed = 42) {
    this.seed = seed;
    this.random = createRandom(seed);
    this.reset();
  }

  private emit(type: string, detail: string) {
    this.events.push({ time: this.state.time, type, detail });
    if (this.events.length > EVENT_LIMIT) this.events.shift();
  }

  get lastEvent(): OceanEvent | undefined { return this.events[this.events.length - 1]; }

  /** Restore the default sunlit ocean. Re-seeds so a reset is reproducible. */
  reset() {
    const s = this.state;
    const reducedMotion = s.reducedMotion;
    Object.assign(s, createOceanState());
    s.reducedMotion = reducedMotion;
    this.random = createRandom(this.seed);
    this.nextAutoChange = 30 + this.random() * 30;
    this.driftHeading = this.random() * Math.PI * 2;
    this.events.length = 0;
    this.emit('reset', `depth ${DEFAULT_DEPTH.toFixed(2)} sunlit`);
  }

  /** Explicit user depth choice: locks out automatic depth changes until released. */
  selectDepth(target: number) {
    const s = this.state;
    s.targetDepth = clamp(target, 0, 1);
    s.depthLocked = true;
    this.emit('target', `user ${s.targetDepth.toFixed(2)} (${bandFor(s.targetDepth)})`);
  }

  /** Hand depth back to the director's natural drift. */
  releaseDepth() {
    if (!this.state.depthLocked) return;
    this.state.depthLocked = false;
    this.nextAutoChange = this.state.time + 20 + this.random() * 20;
    this.emit('release', 'automatic depth resumes');
  }

  setPaused(paused: boolean) {
    if (this.state.paused === paused) return;
    this.state.paused = paused;
    this.emit(paused ? 'pause' : 'resume', paused ? 'simulation frozen' : 'simulation running');
  }

  setReducedMotion(enabled: boolean) {
    if (this.state.reducedMotion === enabled) return;
    this.state.reducedMotion = enabled;
    this.emit('comfort', enabled ? 'reduced motion on' : 'reduced motion off');
  }

  setMode(mode: InteractionMode) {
    if (this.state.interactionMode === mode) return;
    this.state.interactionMode = mode;
    this.emit('mode', mode);
  }

  /**
   * Bounded horizontal virtual travel along a unit direction (x, z). Only valid
   * while the caller holds an active travel gesture; never moves vertically.
   */
  travel(dirX: number, dirZ: number, delta: number) {
    const s = this.state;
    if (s.paused) return;
    const length = Math.hypot(dirX, dirZ);
    if (length < 1e-4) return;
    const dt = clamp(delta, 0, MAX_DT);
    const speed = s.reducedMotion ? REDUCED_TRAVEL_SPEED : TRAVEL_SPEED;
    let x = s.travel[0] + (dirX / length) * speed * dt;
    let z = s.travel[1] + (dirZ / length) * speed * dt;
    const distance = Math.hypot(x, z);
    if (distance > TRAVEL_RADIUS) { x *= TRAVEL_RADIUS / distance; z *= TRAVEL_RADIUS / distance; }
    s.travel[0] = x; s.travel[1] = z;
  }

  update(delta: number) {
    const s = this.state;
    if (s.paused) return;
    const dt = clamp(Number.isFinite(delta) ? delta : 0, 0, MAX_DT);
    s.time += dt;

    // Natural environmental change, only when the user has not chosen a depth.
    if (!s.depthLocked && s.time >= this.nextAutoChange) {
      const step = (this.random() - 0.5) * 0.24;
      s.targetDepth = clamp(s.targetDepth + step, AUTO_DEPTH_RANGE[0], AUTO_DEPTH_RANGE[1]);
      this.nextAutoChange = s.time + 40 + this.random() * 30;
      this.emit('auto', `drift target ${s.targetDepth.toFixed(2)}`);
    }

    // Rate-limited damped approach: continuous, reversible mid-transition, never overshoots.
    const error = s.targetDepth - s.depth;
    const step = clamp(error * 0.9 * dt, -MAX_DEPTH_RATE * dt, MAX_DEPTH_RATE * dt);
    s.depth = Math.abs(error) < 1e-4 ? s.targetDepth : s.depth + step;
    applyEnvironment(s, s.depth);

    const band = bandFor(s.depth, s.band);
    if (band !== s.band) { s.band = band; this.emit('band', band); }

    // Passive drift: suspended matter flows with a slowly turning current; the viewer never moves.
    this.driftHeading += dt * 0.01;
    const flow = s.currentStrength * (s.reducedMotion ? 0.04 : 0.12) * dt;
    s.drift[0] += Math.cos(this.driftHeading) * flow;
    s.drift[1] += Math.sin(s.time * 0.05) * flow * 0.15;
    s.drift[2] += Math.sin(this.driftHeading) * flow;
  }
}
