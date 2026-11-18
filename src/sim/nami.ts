// NAMI: deterministic, event-driven captions. No network, no generated facts.
// Lines are prewritten; species facts come only from the curated species table.

export type NamiLine = { id: string; text: string; priority: number; once: boolean };

export const NAMI_LINES: Record<string, NamiLine> = {
  welcome: { id: 'welcome', text: 'Hi, I’m NAMI. Touch or pinch the glowing pearl to let the ocean in. Make a fist any time for the menu and hand signs.', priority: 2, once: true },
  entered: { id: 'entered', text: 'The sunlit zone, the top 200 metres. Point a finger to swim — find the glowing dive markers and log every animal.', priority: 2, once: true },
  sweep: { id: 'sweep', text: 'A quick sweep startles a school — watch them regroup.', priority: 1, once: true },
  turtle: { id: 'turtle', text: 'A sea turtle is gliding by. Point at it and pinch to learn more.', priority: 2, once: true },
  suggestDeeper: { id: 'suggestDeeper', text: 'Ready to go deeper? Make a fist for the menu and choose Open blue.', priority: 1, once: true },
  openBlue: { id: 'openBlue', text: 'Open water. Larger animals patrol out here.', priority: 1, once: true },
  shark: { id: 'shark', text: 'A reef shark is passing. It keeps its distance — notice how the school reacts.', priority: 3, once: true },
  sharkGone: { id: 'sharkGone', text: 'Let’s descend further. Choose Twilight or Midnight in the menu.', priority: 1, once: true },
  twilight: { id: 'twilight', text: 'Twilight zone: sunlight fades, and many animals make their own light.', priority: 1, once: true },
  midnight: { id: 'midnight', text: 'Midnight: no sunlight reaches here. Hold your palm open to make light.', priority: 3, once: true },
  armed: { id: 'armed', text: 'Keep holding — your light will pulse out into the dark.', priority: 3, once: true },
  pulse: { id: 'pulse', text: 'Your pulse is travelling outward…', priority: 1, once: true },
  reveal: { id: 'reveal', text: 'Something enormous was here all along. Point and pinch to discover it.', priority: 3, once: true },
  discovery: { id: 'discovery', text: '', priority: 2, once: false },
  marker: { id: 'marker', text: '', priority: 2, once: false },
  markerHint: { id: 'markerHint', text: 'See the column of light? That’s a dive marker. Point your finger at it to swim there.', priority: 1, once: true },
  menu: { id: 'menu', text: 'Menu hidden. Make a fist, or pinch the small Menu tab, to bring it back.', priority: 2, once: true },
  journal: { id: 'journal', text: 'Every zone is logged. Open the menu’s Map & journal to see what you’ve found.', priority: 2, once: true },
  paused: { id: 'paused', text: 'Paused. Your ocean will wait for you.', priority: 3, once: false },
  tracking: { id: 'tracking', text: 'I can’t see your hands. Hold them in front of you, controllers down.', priority: 3, once: false },
};

export class NamiGuide {
  muted = false;
  current: { id: string; text: string; until: number } | null = null;
  lastSpoke = -Infinity;
  spoken = new Set<string>();
  lastEvent = 'none';
  minGap = 9;

  reset() { this.current = null; this.lastSpoke = -Infinity; this.spoken.clear(); this.lastEvent = 'none'; }

  /** Notify of a world event; returns true if NAMI says something now. */
  notify(id: string, time: number, override?: string): boolean {
    this.lastEvent = id;
    const line = NAMI_LINES[id];
    if (!line || this.muted) return false;
    if (line.once && this.spoken.has(id)) return false;
    const busy = this.current !== null && time < this.current.until;
    if (time - this.lastSpoke < this.minGap && (busy ? line.priority <= this.priorityOf(this.current!.id) : line.priority < 3)) return false;
    const text = override ?? line.text;
    if (!text) return false;
    this.current = { id, text, until: time + Math.min(12, 4 + text.split(/\s+/).length * 0.3) };
    this.lastSpoke = time;
    if (line.once) this.spoken.add(id);
    return true;
  }

  private priorityOf(id: string) { return NAMI_LINES[id]?.priority ?? 0; }

  dismiss() { this.current = null; }

  setMuted(muted: boolean) { this.muted = muted; if (muted) this.current = null; }

  update(time: number) { if (this.current && time >= this.current.until) this.current = null; }
}
