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

