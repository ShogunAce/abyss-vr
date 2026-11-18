# Technical decisions

- Inspected an empty workspace at `C:\Users\coled\Projects\AbyssVR`; generated the official AR starter here instead of creating a second nested project. Node 24.14.1, npm 11.11.0, Git 2.53.0.windows.2.
- Installed IWSDK 1.1.0. Kept the generator's manifest-first `World.create(container, projectOptions)` lifecycle, native scene format, input system, HTTPS plugin, and `iwsdkDev()` call intact. `dev.emulator.device` was already `metaQuest3`.
- Kept AR hand tracking, room surfaces and anchors enabled; no locomotion, physics, grabbing, environment raycast, microphone or audio features added. Room understanding is optional to the actual interaction proof.
- All rendering imports come from `@iwsdk/core`; the generated `three` alias/override stays `super-three@0.185.0`. `npm ls three --depth=2` confirms shared/deduplicated resolutions.
- The 17 cm sphere, 96 particles, confirmation ring, and original line lettering are deterministic procedural manifest assets. No external model, texture, font, or media is required by the scene.
- Native `RayInteractable` plus an ECS query entering `Pressed` drives the interaction. ECS means the SDK's entity-component system: scene objects carry data components, and systems react to them. See https://iwsdk.dev/ for SDK concepts. There is exactly one activation path; no timer simulates input. A held select does not repeatedly activate. Each distinct press after release produces one event; simultaneous pointers on one object follow IWSDK's shared Pressed state, rather than being counted as independent overlapping gestures.
- The proof supports pointing/ray pinches from either hand, and the same supported path with mouse/controller fallback. It does not add a separate direct-touch/poke gesture. A target ray is the pointing direction used for selection; a grip pose locates the physical hand/controller. These are different poses; no grip position is substituted for a selection ray.
- On the first valid tracked frame of each XR session, the content anchor is placed 0.7 m ahead, 0.15 m below eye height. Only scene content moves; the tracked camera never does. Subsequent head motion leaves the anchor fixed. Re-enter XR to reposition from a new seated location. Exit restores the desktop framing.
- Transparent AR composition preserves passthrough. The living room seen on desktop is IWER's synthetic environment, not a physical camera feed. IWER is the SDK's browser-based XR emulator: https://iwsdk.dev/guides/02-testing-experience.html.
- Diagnostics count XR hand input separately from desktop input, but deliberately do not certify physical hardware. Hand availability means an XR hand input source exists; it does not certify every joint's tracking quality. FPS is a smoothed application frame interval, not a headset GPU benchmark.
- Diagnostics are shown in HTML and on a small spatial canvas-texture panel. The latter remains readable inside XR where HTML normally disappears. The app has desktop Enter/Exit buttons; Quest Browser's standard system control exits immersive mode on-device.
- The initial milestone was Phase 0. The approved Arrival extension below adds the ocean reveal. Schooling, predators, NAMI, audio reactivity, hosting and APK packaging remain outside this build.

## Known platform/dependency limits

Physical Quest 3, Wi-Fi reachability from the headset, permission prompts, actual passthrough and real hand tracking require manual verification. No ADB executable was available on PATH during this build. See QA for the same-Wi-Fi path; USB is a fallback.

The generated dependency tree reports eight high-severity npm audit findings (dev tooling chain including sharp/librsvg and picomatch). Some have no published fix in the report, and npm proposes a major Vite downgrade for others. The pinned SDK/Three setup was preserved rather than forcing an unverified upgrade/downgrade. The exact report is `artifacts/npm-audit.json`. Review upstream fixes before public deployment. Vite also reports a large main bundle and non-fatal Zod annotation warnings. These do not prevent the local build.

## The Arrival — room-to-ocean extension

Following the user's report that the foundation worked, the chosen direction is a short room-to-ocean transition. This extension keeps the established hand input and stationary viewer.

- The first pinch targets full immersion; each subsequent separate pinch reverses the destination. Entry is eight seconds and return is 4.5 seconds from full immersion. Reversal continues from current progress without a discontinuous alpha jump. Held input retains the existing one-event behavior.
- The WebXR session remains `immersive-ar` throughout. A world-fixed enclosing ocean volume fades from transparent to opaque, visually replacing passthrough without terminating/re-requesting the XR session. This is a rendering transition, not a switch of WebXR session modes.
- The scene uses a procedural water volume, seabed, instanced reef outcrops, overhead wave highlights, soft light shafts and 360 suspended motes. Custom shader materials own the water shading and reveal alpha; no extra runtime dependency or external asset was installed.
- The ocean origin is the initial tracked viewer eye position. Seabed is roughly 3.4 m below it. No camera translation, gravity or locomotion is applied. The closest reef outcrops are several metres away; the existing sphere stays 0.7 m forward.
- Scene materials are cloned once at runtime before changing uniforms. Manifest prototypes stay deterministic and immutable across editor/runtime realms.
- Large frame gaps are capped at 50 ms for transition progress; hidden/blurred XR sessions do not advance the reveal. Exit/re-entry resets the destination, progress and ocean visibility to the room.
- The sphere remains visible and selectable in the ocean. Desktop Return to room / Escape provide additional return paths, and Quest Browser's standard XR exit remains available.
- The normal spatial panel now explains the journey and return action; verbose developer diagnostics are opt-in with `?debug=1` and remain available in the desktop details panel.
- Wildlife, sound, depth progression and exploration remain future work. New physical Quest visual/performance/comfort checks are pending; prior foundation success does not certify this new environment.


## Phase 1 — persistent ocean and Ocean Director (2026-11-17)

- **One ocean, never reloaded.** The existing ocean asset is the only environment instance. Depth changes are continuous shader-uniform blends (water gradient, ambient light, fog density, bioluminescent mote glow), driven every frame from the Ocean Director. `OceanStatus.oceanInstances` counts scene objects named `Ocean environment` so duplicates are detectable.
- **Simulation separate from rendering.** `src/ocean/ocean-director.ts` imports nothing from Three.js, ECS or the DOM and holds the spec's `OceanState` (depth, targetDepth, depthLocked, light, visibility, fog, current, wildlife density, bioluminescence, activeEncounter, discoveries, interactionMode, paused) plus reducedMotion, drift and travel. `OceanSystem` only reads it and writes uniforms/transforms. Unit tests run it directly under Node.
- **Bands** follow the spec's overlapping ranges (Sunlit 0–0.30, Open blue 0.25–0.60, Twilight 0.55–0.85, Midnight 0.80–1.00). The reported band only changes after depth leaves the current band's range (hysteresis). Visual parameters blend between anchors at 0.10 / 0.42 / 0.70 / 0.95 with smoothstep easing.
- **Depth motion** is a damped approach capped at 0.07 normalized units/s, with frame deltas clamped to 50 ms. 0.15 → 0.95 takes roughly 13 s; reversing mid-transition continues from the current value with no jump.
- **User choice wins.** Selecting a band locks depth (`depthLocked`). Automatic change only runs while unlocked: every 40–70 s of simulated time a seeded step of at most ±0.12, clamped to 0.05–0.45, so the director never takes a viewer into darkness on its own. "Drift" on the panel releases the lock.
- **Deterministic seed.** mulberry32 seeded with 42; `reset()` re-seeds, so a reset ocean replays the same automatic history (unit-tested).
- **Depth Compass.** A 32 × 18 cm canvas-texture panel, left of the sphere and angled toward the seated viewer (~0.6 m away, below eye height). Eight ray/pinch targets: Sunlit, Open blue, Twilight, Midnight, Drift, Pause/Resume, Calm (reduced motion), Reset. It is offered once the user has chosen the ocean and is hidden (and its `RayInteractable`s removed) in the room. Phase 2's "open palm toward UI" summon gesture is not implemented yet. Manrope is named in the canvas font stack but not bundled, so the panel uses the system sans-serif fallback.
- **Hybrid exploration.** Passive drift moves only suspended matter with a slowly turning current (wrapping in a 32 m cell, fixed count, no allocation). Hand-directed travel: a pinch that *starts* while the hand's ray is not on an interactable, once fully immersed and unpaused, travels horizontally along the target ray at 0.35 m/s (0.15 m/s in Calm), bounded to a 6 m radius. It stops on release or when that hand stops tracking. A small cyan cone marks the current direction. Only the scenery's travel frame moves; the camera/XR origin never does, and the water volume stays centred on the viewer. Vertical motion is expressed as depth, never as camera translation.
- **Gesture priority (Phase 1 subset).** A pinch that starts on an interactable (sphere or panel, via `multiPointers[hand].getRayBusy()`) is treated as menu/target input for its whole duration and can never become travel. Only one hand travels at a time. The full Phase 2 GestureArbiter (discovery, palm, sweeps) will replace this.
- **Pause** freezes simulation time, depth progression, drift, travel and shader time. Head tracking and rendering continue. The room-to-ocean fade (Phase 0 Arrival) is independent and still runs.
- **Session lifecycle.** Every new XR session starts with a fresh, reset director, so a re-entry begins sunlit with no travel offset.
- **Debug controls.** The desktop diagnostics panel has 0.00 / 0.35 / 0.65 / 1.00, Auto, Pause and Reset buttons. `OceanStatus.command` accepts the same vocabulary (`depth:<v>`, `release`, `pause`, `resume`, `reset`, `reduced:on|off`) for automated tests.
- Not in Phase 1: animals, encounters, discoveries, palm gestures, audio. `activeEncounter` and `discoveries` exist in state but are unused.

## Phases 2–5 — living ocean, encounters, midnight reveal, NAMI, opening and comfort (2026-11-17)

**Architecture.** Simulation is pure and unit-tested in `src/sim/` (no Three.js/DOM):
- `gesture.ts`: HandGesture interpreter and `arbitratePinch`
- `flock.ts`: boids
- `shark.ts`: shark state machine
- `encounters.ts`: seeded scheduler
- `biolum.ts`: organisms, pulse wavefronts and the hero reveal
- `nami.ts`: caption controller

Systems in `src/systems/` render these and wire them through one shared service object, `src/runtime.ts`. It holds the director, hands, pinch owners, requests, discoveries, prefs, NAMI, the event log and stats. System order is Gesture → Abyss → Ocean → Creature → Reveal → Guide. `runtime.generation` increments on every XR session change and on Restart; each system resets its own state when it sees a new generation.

**Spec module mapping.**
- XRBootstrap = AbyssSystem + `iwsdk.config.json`
- GestureInterpreter/Arbiter = `sim/gesture.ts` + GestureSystem
- OceanDirector/WorldRenderer = `ocean/`
- CreatureManager/FlockingSystem = CreatureSystem + `sim/flock.ts` + `sim/shark.ts`
- Encounter scheduler = `sim/encounters.ts`
- Bioluminescence = RevealSystem + `sim/biolum.ts`
- DiscoveryManager/NamiGuide = GuideSystem + `data/species.ts` + `sim/nami.ts`
- AudioSystem = `audio/audio-engine.ts`
- ComfortManager = Depth Compass rows 2–3 + runtime prefs
- Diagnostics = HTML panel + the `OceanStatus` component (also the automated-test surface)

**Gestures (hands-first).** Joint poses come from `XRFrame.getJointPose`, transformed by the XR origin. From them we derive the palm centre, extended-finger count, thumb–index gap and index–pinky spread.
- **Open palm** requires 4 extended fingers, a thumb gap over 11 cm and a finger spread over 11.5 cm, held 0.25 s, with 0.2 s release hysteresis. These thresholds come from measurements: IWER's relaxed default hand reads as 4 fingers / 9.4 cm / 10.3 cm and must not count; its "open" (high-five) pose reads 12.7 cm / 13.2 cm. They still need tuning against real hands on Quest.
- **Fast sweep:** speed above 0.7 m/s (exit below 0.45), with a 0.8 s cooldown.
- **Tracking jumps:** any movement over 4 m/s snaps position with zero velocity and produces no gesture.
- **Recovery:** gestures are ignored for 0.3 s after a hand (re)appears, so tracking recovery cannot cause a gesture storm.
- **Fallbacks:** controllers use grip position (no palm gestures); the desktop has no gestures.

**Pinch arbiter.** Each pinch is owned for its whole duration by the first applicable owner:
1. **Target:** the hand's ray is on any interactable (panel, card, caption, sphere, creature). Its `Pressed` handler acts.
2. **Pulse:** only when armed, meaning an open palm at depth ≥ 0.75 within the last 3 s. It fires once, on release.
3. **Travel:** fully immersed, unpaused, and the other hand is not already travelling.

So one pinch can never both inspect and travel, or pulse and travel.

**Fish.** 56 boids (within the spec's 48–64), one InstancedMesh and one draw call. A swim shader bends the body in a travelling wave driven by a per-instance phase.
- Forces: separation, alignment, cohesion, home volume, hand attraction (steady or slow hands within 1.6 m; fish settle in a ring and never enter the hand), sweep scatter (1.6 s burst), shark threat (4 m field) and a 0.55 m viewer keep-out.
- Fixed 60 Hz sub-steps (at most 4 per frame) and a 512-cell spatial hash. No per-step allocation.
- Population tiers with hysteresis:

  | Depth | Fish |
  | --- | --- |
  | below 0.59 (back below 0.51) | 56 |
  | 0.59 to 0.84 (back below 0.76) | 18 |
  | above 0.84 | 0 |

  Leaving fish swim off and fade rather than popping.
- In the passthrough room, 8 half-size scouts circle the sphere: the MR "fish move past" beat.

**Shark.** CRUISE → NOTICE → INVESTIGATE → TURN_AWAY → done.
- Spawns 22 m out inside the viewer's forward arc and cruises past the far side of the school, so the cause and effect is visible.
- Turns at most 0.55 rad/s. In INVESTIGATE it arcs at a 4.2 m radius.
- A hard 3.2 m comfort radius is enforced after every move. A 75 s timeout forces it to turn away, and it fades out with distance.
- The fish respond only to its threat field; the user never triggers this.
- Procedural countershaded model. To replace it, register a licensed glTF and swap `createShark()`; `SharkBrain` stays.

**Encounters.** The scheduler is seeded (42 in the default showcase mode, time-based with `?explore`). It handles depth eligibility, per-encounter cooldowns, a 45 s minimum gap between hero encounters, double weight for undiscovered species, and timeouts.
- Showcase guarantees a turtle pass after 5 s in sunlit water and a shark pass after 4 s in open blue, then switches to weighted free scheduling.
- The turtle is the one additional lightweight encounter: a 40 s sunlit pass 4.2 m away with animated flippers.

**Midnight reveal.**
- 90 organisms (one additive Points draw call), each running DORMANT → STIMULATED → GLOWING → FADING.
- The palm light wakes organisms within 1.1 m of an open palm. It is a glow sprite, not a dynamic light.
- Each pinch-release while armed sends one wavefront (3.2 m/s, 16 m max, 1.2 s cooldown). Organisms light in wavefront order (unit-tested).
- When a wavefront reaches the hidden giant squid (11 m ahead, depth ≥ 0.78), it emerges over 5 s and drifts 1.5 m closer, staying about 9.5 m away. It stays 32 s, then fades over 6 s. No jump scare.
- The squid is a single merged procedural mesh: arm sway in the vertex shader, a fresnel rim plus photophore speckles for the reveal. No volumetrics.
- The discovery card and NAMI both say the reveal is stylized.

**Other creatures.** Six moon jellies (twilight and deeper) with pulsing bells, gonad rings and swaying tentacles; they glow after a pulse. One anglerfish at midnight with a living lure.

**Decorative sprites are never ray targets.** `Sprite.raycast` throws without `Raycaster.camera`. When the anglerfish (which contains a glow sprite) became pinchable at twilight, this exception stopped the render loop, as found by the live experience test. Every glow sprite and the instruction sprite now has a no-op `raycast`.

**Discovery and NAMI.** Six species with curated facts and source URLs (`src/data/species.ts`), all marked `needs-human-check`.
- Flow: ray hover highlights the creature (rim glow); pinching shows a card and saves the discovery to localStorage, with a chime and a NAMI caption.
- Close the card by pinching it.
- NAMI is captions-only and deterministic: one-time story lines, a 9 s minimum gap, and high priority can interrupt. Pinch the caption to dismiss it. There is no network or LLM.
- Clownfish (in the spec's list) is not implemented, since it needs a reef/anemone set. The blue-green chromis school and the giant squid hero were added instead.

**Opening (Phase 5).** In passthrough, NAMI invites the user, bubbles rise around the sphere and scout fish circle it. Pinching the sphere or holding an open palm for 0.6 s starts the 8 s room-to-ocean fade inside the same `immersive-ar` session.
- Room understanding is **not** used. Plane and mesh detection are enabled in config, but nothing is placed against room geometry.
- Passthrough is a deliberate, user-initiated transition. Do not claim room-aware placement in the submission.

**Comfort and accessibility.**
- No camera motion ever. Travel moves scenery only, at 0.35 m/s (0.15 in Calm), within 6 m.
- Depth Compass row 3:
  - **Recenter:** re-places the content anchor and ocean in front of the current head pose.
  - **Text size:** 1.0 or 1.3 scale for the panel, captions and cards.
  - **Sound:** toggles the procedural soundscape.
  - **Room:** returns to passthrough.
- Restart resets the ocean, encounters, reveal and school while staying in XR.
- Pause freezes simulation, creatures and the reveal; head tracking stays live.
- NAMI says when hands are lost.
- Preferences persist locally. There is no microphone code, and sound-reactive mode is not implemented (lowest-priority optional).

**Audio.** Procedural Web Audio:
- brown-noise water hush with a depth-dependent low-pass
- a deep drone that rises with depth
- synthesized tones for UI, discovery, pulse and reveal

It starts from the Enter XR click, and every call is a no-op if audio is blocked. No audio files.

**Visual identity.** The spec palette (#071824, #155B78, #77D8DB, #9D82D4, #E9E5DA) is used for all spatial UI. Manrope is named but not bundled (system sans-serif fallback). All creatures share the environment uniforms, so they darken, fog and glow consistently with depth.

## Headset feedback pass: sphere, fish, guide clutter, living reef (2026-11-18)

Feedback from the first Quest session, and what changed:

- **Opening sphere felt unresponsive to pointing.**
  - A 15 cm invisible pick volume now surrounds the 8.5 cm sphere. Its colour and depth writes are masked rather than hidden, because the SDK pointer skips invisible materials.
  - While a ray hovers it, the sphere glows brighter and swells about 7%, so you see it respond before you pinch.
  - An index fingertip within 13 cm of its centre also activates it. Touch re-arms only after every fingertip is more than 20 cm away.
  - Pinch and touch share a 0.5 s cooldown, so one gesture never fires twice.
- **Fish attracted to the hand got in the way.**
  - Hand pull: weight 1.4 → 0.9, range 1.6 → 1.2 m, minimum gap to the hand 0.18 → 0.32 m.
  - Viewer keep-out radius 0.55 → 0.85 m.
  - New keep-out spheres (0.45 m) around the sphere and the Depth Compass while in the ocean.
  - The school's home moved 2.3 → 2.8 m ahead.
- **The ABYSS screen and NAMI orb sat in the centre.**
  - The title label and instruction screen hide as soon as the ocean starts.
  - NAMI and its captions now sit to the left, above the Depth Compass.
  - New Depth Compass **Guide** button turns NAMI and captions on or off (persisted). It replaced Room; pinching the sphere still returns you to the room.
- **Fish "shape physics".** Fish swam pitched nearly vertical and rolled arbitrarily, because their orientation was taken from raw velocity.
  - Climb is now limited to 0.35 × horizontal speed.
  - Each fish keeps a smoothed heading (turn rate 5/s) and banks into turns (up to 0.55 rad).
  - Orientation is built from an upright basis, so fish and shark stay level.
- **More fish.** 120 instead of 56, still one instanced draw. Population tiers: 120 / 36 / 0 by depth.
- **Fish look.** New damselfish profile: blunt head, deep body, forked tail, long dorsal and anal fins, pectorals. Added eyes, a wet specular highlight, iridescent sheen, per-fish colour variation and lighter fins.
- **Shark look.** Fin tagging, a dark-edged tail (a grey reef shark field mark) and eyes.

### Living reef (`src/scene-assets/reef.scene-asset.ts`)

**Terrain.** `seabedHeight()` combines:
- dunes and undulation
- a reef mound about 6 m ahead and two flanking mounds
- a calm hollow beneath the viewer

The seabed is a 150×150-segment heightfield, capped at 1.5 m below eye level.

**Sand shader.** Wave ripples whose direction wanders across the seabed, grain, colour patches, rock on steep slopes, algae on the mounds, red absorption, and caustics.

**Rocks.** Deterministic noise-displaced icospheres with welded smooth normals, coralline crust and algae on upward faces, sitting on the terrain.

**Reef.** Each type is one InstancedMesh with per-instance colour and seed:

| Type | Count |
| --- | --- |
| Branching corals (paler growing tips) | 70 |
| Brain corals (groove pattern) | 40 |
| Table corals | 12 |
| Sea fans (lattice, swaying) | 28 |
| Tube sponges (dark interiors) | 32 |
| Anemones (swaying tentacles, pale tips) | 18 |
| Seagrass blades | 1300 |
| Starfish | 36 |

- Placement is seeded and weighted toward garden zones, densest on the mound ahead, with nothing within about 2.4 m of the viewer.
- All reef pieces share the ocean's depth uniforms: they darken and fog with depth, and some corals faintly fluoresce at midnight.
- They live in the travel frame (they move with hand-directed travel) and fade in with the room-to-ocean reveal.
- Cost: 8 extra instanced draws.

## Visual, physics and hand-tracking upgrade (2026-11-18)

**Light and colour**
- One shared shader library (`src/visuals/glsl.ts`): value noise, fbm and an animated two-layer caustic web.
- Caustics now land on sand, rocks, coral and the backs of creatures, not just the floor.
- Depth palettes are richer: turquoise shallows, cobalt open blue, indigo twilight.
- Coral uses wrap lighting, darkened bases, a wet rim, backlit translucency on thin tissue (fans, seagrass, kelp, anemones) and a saturation lift that survives the water's blue cast.

**Procedural surfaces (no texture files)**
- **Sand:** noise-warped ripples lit by their slope, grain, shell fragments, damp troughs, algae turf on mounds.
- **Rocks:** layered limestone with crevices, barnacle specks, coralline crust, turf and orange/violet encrusting sponge.
- **Coral:** polyps on branching and table coral, ridged brain coral, pitted sponges with bright lips, striped anemones, bumpy starfish.

**Ecosystem**
- New instanced types: kelp forest (72 three-blade stands ringing the garden), sea whips (46), sea urchins (40).
- The whole reef sways in one travelling tidal surge, plus a little local flutter. Bending shortens stalks instead of stretching them.
- A second fish school of 72 anthias, tangs and basslets (one draw) lives over the reef mound ahead. It reacts to the shark and thins with depth.

**Creatures**
- New skin system in `creatureMaterial`:
  - fish scales and lateral line
  - reptile scales
  - turtle scutes (Voronoi plates with dark streaks over a pale plastron)
  - shark denticles and five gill slits
  - a mixed reef-fish palette
- Translucent ribbed fins and eye catchlights.
- Shark: sharper snout and pelvic fins.
- Turtle: domed carapace, flat plastron, beaked head and neck. The body lifts and pitches with each flipper stroke.
- Jelly: radial canals and a frilled margin.
- Anglerfish: an open lower jaw lined with needle teeth.

**The sphere** was a flat blue disc underwater (a standard material with no ocean lighting). It is now a pearl portal shader with a slowly swirling interior and a fresnel rim. It shrinks 30% in the ocean so it never dominates the view.

**Physics and hands**
- Fish schools have a soft seabed floor.
- About 900 suspended particles (a dense near field) are stirred by your hands: pushed aside and dragged along in the hand's wake.
- Palm tracking uses a One Euro filter (steady at rest, low lag in motion). Index fingertips get their own One Euro filters, so fingertip touch on the sphere is jitter-free.
- The pinch-and-hold travel direction is low-pass filtered, so tremor never makes the glide wobble.
- New unit tests cover the One Euro filter and the flock floor (29 total).

**Cost** (emulator, both eyes, sunlit): 104 draws and about 386k triangles, up from 96 and 293k. Sand and rock noise was trimmed to a few lookups per pixel for Quest's fill rate. If the Quest drops below 72 fps, trim in this order: urchins → sea whips → seagrass count → kelp count.
