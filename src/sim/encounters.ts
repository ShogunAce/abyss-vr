// Pure, seeded encounter scheduler: depth eligibility, cooldowns, one hero at a time,
// discovery-aware weights, timeouts, and a deterministic showcase sequence.

export type EncounterDef = {
  id: string;
  species: string;
  eligibleDepth: [number, number];
  hero: boolean;
  weight: number;
  cooldown: number;
  maxDuration: number;
};

export const ENCOUNTERS: EncounterDef[] = [
  { id: 'turtle_pass', species: 'green-sea-turtle', eligibleDepth: [0, 0.35], hero: false, weight: 1, cooldown: 70, maxDuration: 70 },
  { id: 'shark_pass', species: 'grey-reef-shark', eligibleDepth: [0.3, 0.75], hero: true, weight: 1, cooldown: 150, maxDuration: 110 },
];

export const MIN_SINCE_HERO = 45;
const CHECK_INTERVAL = 6;

export type EncounterEvent = { type: 'start' | 'complete' | 'timeout'; id: string; time: number };

export class EncounterScheduler {
  readonly showcase: boolean;
  active: { def: EncounterDef; startedAt: number } | null = null;
  readonly history: EncounterEvent[] = [];
  private lastEnd = new Map<string, number>();
  private lastHeroEnd = -Infinity;
  private nextCheck = 0;
  private random: () => number;
  private seed: number;
  /** Seconds spent continuously in each encounter's band (showcase pacing). */
  private dwell = new Map<string, number>();
  private showcaseDone = new Set<string>();

  constructor(seed: number, showcase: boolean) {
    this.seed = seed; this.showcase = showcase;
    this.random = () => 0;
    this.reset();
  }

  reset() {
    let s = this.seed >>> 0;
    this.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    this.active = null; this.history.length = 0; this.lastEnd.clear(); this.dwell.clear(); this.showcaseDone.clear();
    this.lastHeroEnd = -Infinity; this.nextCheck = 0;
  }

  /** Deterministic number for actors (spawn angles, etc.). */
  next() { return this.random(); }

  private eligible(def: EncounterDef, time: number, depth: number) {
    if (depth < def.eligibleDepth[0] || depth > def.eligibleDepth[1]) return false;
    if (time - (this.lastEnd.get(def.id) ?? -Infinity) < def.cooldown) return false;
    if (def.hero && time - this.lastHeroEnd < MIN_SINCE_HERO) return false;
    return true;
  }

  /** Returns the id of an encounter that starts now, or null. */
  update(time: number, delta: number, depth: number, discovered: ReadonlySet<string>): string | null {
    if (this.active) {
      if (time - this.active.startedAt > this.active.def.maxDuration) this.finish(time, 'timeout');
      return null;
    }
    for (const def of ENCOUNTERS) {
      const inBand = depth >= def.eligibleDepth[0] && depth <= def.eligibleDepth[1];
      this.dwell.set(def.id, inBand ? (this.dwell.get(def.id) ?? 0) + delta : 0);
    }
    if (this.showcase) {
      // Showcase: turtle early in the sunlit ocean; shark soon after reaching open blue.
      for (const [id, wait] of [['turtle_pass', 5], ['shark_pass', 4]] as const) {
        if (this.showcaseDone.has(id)) continue;
        const def = ENCOUNTERS.find(d => d.id === id)!;
        if ((this.dwell.get(id) ?? 0) >= wait && this.eligible(def, time, depth)) {
          this.showcaseDone.add(id);
          return this.begin(def, time);
        }
      }
    }
    // Showcase: no random picks until the scripted beats have played.
    if (this.showcase && this.showcaseDone.size < 2) return null;
    if (time < this.nextCheck) return null;
    this.nextCheck = time + CHECK_INTERVAL;
    let total = 0;
    for (const def of ENCOUNTERS) if (this.eligible(def, time, depth)) total += def.weight * (discovered.has(def.species) ? 1 : 2);
    if (total === 0) return null;
    let pick = this.random() * total;
    for (const def of ENCOUNTERS) {
      if (!this.eligible(def, time, depth)) continue;
      pick -= def.weight * (discovered.has(def.species) ? 1 : 2);
      if (pick <= 0) return this.begin(def, time);
    }
    return null;
  }

  private begin(def: EncounterDef, time: number) {
    this.active = { def, startedAt: time };
    this.history.push({ type: 'start', id: def.id, time });
    return def.id;
  }

  /** Called by the actor when its behaviour has resolved (or by timeout). */
  finish(time: number, type: 'complete' | 'timeout' = 'complete') {
    if (!this.active) return;
    const def = this.active.def;
    this.lastEnd.set(def.id, time);
    if (def.hero) this.lastHeroEnd = time;
    this.history.push({ type, id: def.id, time });
    this.active = null;
  }
}
