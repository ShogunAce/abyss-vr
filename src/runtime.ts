// Shared runtime services used by the ABYSS systems. Simulation lives in src/sim
// and src/ocean; this module only wires instances together and persists preferences.
import { OceanDirector } from './ocean/ocean-director.js';
import { HandGesture } from './sim/gesture.js';
import { NamiGuide } from './sim/nami.js';
import type { PinchOwner } from './sim/gesture.js';

const params = new URLSearchParams(location.search);
const DISCOVERY_KEY = 'abyss.discoveries.v1';
const PREFS_KEY = 'abyss.prefs.v1';

type Prefs = { reducedMotion: boolean; textScale: number; sound: boolean; namiMuted: boolean };

function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? { ...fallback, ...JSON.parse(raw) } : fallback; } catch { return fallback; }
}
function save(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: keep in memory */ } }

export const runtime = {
  /** Showcase (default) uses seed 42 and a guaranteed turtle → shark → reveal arc; ?explore is free play. */
  showcase: !params.has('explore'),
  seed: params.has('explore') ? (Date.now() >>> 0) : 42,
  director: new OceanDirector(params.has('explore') ? (Date.now() >>> 0) : 42),
  hands: { left: new HandGesture(), right: new HandGesture() },
  pinchOwner: { left: 'none' as PinchOwner, right: 'none' as PinchOwner },
  travelHand: null as 'left' | 'right' | null,
  /** World-space unit direction of the travelling ray (set by GestureSystem). */
  travelDir: { x: 0, y: 0, z: -1 },
  pulseArmedUntil: 0,
  immersion: 0,
  destination: 'room' as 'room' | 'ocean',
  sessionActive: false,
  sessionTime: 0,
  requests: { recenter: false, enterOcean: false, returnRoom: false },
  /** Incremented on full restart and on every XR session change; systems compare to their last seen value. */
  generation: 0,
  /** Real (unpaused) seconds, advanced by GestureSystem; used for UI and NAMI timing. */
  clock: 0,
  pendingPulse: null as null | { x: number; y: number; z: number },
  sweepEvent: null as null | { x: number; y: number; z: number },
  /** Glow boost for jellies/anglerfish after a pulse, decays in RevealSystem. */
  stim: 0,
  commandHandlers: {} as Record<string, () => void>,
  command(action: string) { const handler = this.commandHandlers[action]; if (handler) { handler(); return true; } return false; },
  hoveredSpecies: '' as string,
  discovered: new Set<string>(load<{ ids: string[] }>(DISCOVERY_KEY, { ids: [] }).ids),
  newDiscovery: '' as string,
  prefs: load<Prefs>(PREFS_KEY, { reducedMotion: false, textScale: 1, sound: true, namiMuted: false }),
  nami: new NamiGuide(),
  events: [] as string[],
  /** Increments on every log() so readers can cache derived strings. */
  eventSeq: 0,
  stats: { pulses: 0, organismResponses: 0, revealState: 'hidden', sharkState: 'absent', sharkDistance: 0, encounter: 'none', schoolState: 'schooling', fishCount: 0, threat: 0, gesture: 'none', handSpeed: 0, cooldown: 0, handFeatures: '', sweeps: 0, scatters: 0, sharkMinDistance: 0 },

  log(type: string, detail: string) {
    const line = `${this.director.state.time.toFixed(1)}s ${type}: ${detail}`;
    this.events.push(line);
    this.eventSeq++;
    if (this.events.length > 30) this.events.shift();
  },
  discover(id: string) {
    const fresh = !this.discovered.has(id);
    this.discovered.add(id);
    this.newDiscovery = id;
    save(DISCOVERY_KEY, { ids: [...this.discovered] });
    this.log('discovery', `${id}${fresh ? ' (new)' : ''}`);
    return fresh;
  },
  savePrefs() { save(PREFS_KEY, this.prefs); },
};
runtime.director.setReducedMotion(runtime.prefs.reducedMotion);
runtime.nami.setMuted(runtime.prefs.namiMuted);
