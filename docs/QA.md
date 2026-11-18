# QA — Phase 0

Verified locally on 2026-11-17. **Physical Quest 3 acceptance: pending, 0/10 recorded.** Desktop emulation does not establish real-device performance, Wi-Fi access, passthrough, comfort, or hand tracking.

## Automated and desktop results

| Check | Actual result |
| --- | --- |
| `npm run typecheck` | PASS, TypeScript exit 0 |
| `npm run build` | PASS, Vite production output in `dist/`; bundle-size and dependency annotation warnings only |
| HTTPS development server | PASS, port 8081, managed browser connected and command-ready |
| Quest 3 IWER session | PASS, `runtimeKind: emulated`, `sessionActive: true`, `sessionMode: immersive-ar` |
| Initial placement | PASS, sphere at approximately (0, 1.45, -0.7) for default 1.6 m emulated eye height |
| Right-hand select | PASS, first simulated pinch changed count 0 → 1 |
| Left-hand select | PASS, independently increments count by exactly one |
| Feedback | PASS, cyan sphere and confirmation ring visually inspected; scale > 1 and pulse > 0 measured while stepping frames |
| Held pinch | PASS, 90 more simulation frames did not increment count; scale returned to 1 and pulse to 0 |
| Loss of both hand sources | PASS, session stays active and explicit hands-unavailable message appears |
| Reconnect | PASS, next hand pinch records one event |
| Head orientation | PASS, target world position unchanged after head turn |
| Exit / re-entry | PASS, session inactive after exit, active after re-entry |
| Desktop fallback | PASS, mouse press changed count 7 → 8 and last event to `Desktop pointer select #8` |
| Browser console | PASS, no error-level messages in smoke test; SDK Clock deprecation warning remains |
| Shared Three runtime | PASS, `npm ls three --depth=2` reports generated alias deduplicated |

Repeatable checks: `npm run test:smoke` with the managed development server running. The test uses actual IWER select gestures through the official CLI, not direct manipulation of the interaction counter. Results and exact structured requests are saved in `artifacts/qa-results.json`. No unit-test runner existed in the generated starter.

Screenshots: `artifacts/initial-xr.png`, `artifacts/pinch-cyan.png`, `artifacts/desktop.png`, `artifacts/sphere.png`, `artifacts/scene.png`. The paused cyan screenshot shows emulator controls and the immediate response; diagnostic panel refresh is throttled to 4 Hz and may lag an individual paused frame.

## Physical Quest steps

1. Keep this laptop awake and the server running. If needed, from `C:\Users\coled\Projects\AbyssVR`, run `npm run dev`. Check `npm run dev:status` for current addresses.
2. Connect Quest 3 to the laptop's Wi-Fi network. This session's Wi-Fi IPv4 is `10.0.0.222`; virtual adapters `192.168.56.1` and `172.22.80.1` are not the Wi-Fi address.
3. In Quest Browser open **https://10.0.0.222:8081/**. Do not use localhost for the Wi-Fi route. If prompted about the local certificate, first verify that this is your own laptop address, then proceed.
4. Stay seated, look forward, select **Enter XR**, and grant the browser's requested XR permissions. Passthrough should remain visible.
5. Set controllers down and enable hand tracking. Point at the blue sphere and pinch with the right hand; release fully. Repeat with the left hand. Read the spatial event counter. Each separate pinch should add one; holding should not repeat.
6. Confirm cyan color, brief size increase and confirmation ring. Move your head gently: the sphere should remain world-fixed. The target should be about 0.7 m ahead and 0.15 m below eye height.
7. Put hands out of tracking view, then bring them back. Confirm the app stays responsive and the next pinch works. Availability reflects input-source presence; joint-level tracking loss can occur without immediate source removal.
8. Exit through Quest Browser's XR/system control. Re-enter to check recovery and reseat the target. The desktop page also has an Exit XR button.
9. Record each check below only after physical observation. Phase 0 is not fully accepted until all ten pass.

- [ ] Quest Browser opens the app over Wi-Fi.
- [ ] Enter XR starts an immersive session.
- [ ] Passthrough / MR scene renders.
- [ ] Sphere is comfortably positioned for seated use.
- [ ] Left-hand pointing pinch triggers feedback.
- [ ] Right-hand pointing pinch triggers feedback.
- [ ] Each separate pinch records exactly one event.
- [ ] Head movement preserves world-fixed content.
- [ ] Hand tracking loss/recovery does not crash the app.
- [ ] Exit XR and re-entry remain responsive.

## Blockers and troubleshooting

- No physical headset test was performed. ADB was not found on PATH; no USB/native test was attempted. Same-Wi-Fi testing does not require ADB.
- If the URL is unreachable, verify the server is running, the current Wi-Fi IPv4 and network isolation settings. Allow Node on the Windows **private** network if a firewall prompt appears. Do not disable the firewall globally.
- If hands do not appear, enable Quest hand tracking, set controllers down, and re-enter XR. A controller selection is not evidence of hand tracking.
- If XR fails, read the on-page error, check HTTPS, and use Quest Browser. Desktop input remains available on non-XR browsers.
- Dependency audit findings are recorded in `artifacts/npm-audit.json` and discussed in DECISIONS.md. They did not prevent local testing; deployment is outside Phase 0.
- USB fallback and official instructions: https://iwsdk.dev/guides/02-testing-experience.html.

## The Arrival — new transition checks (2026-11-17)

The user reported that the preceding foundation worked and approved the room-to-ocean direction. That report does not certify the new transition on physical hardware.

Automated results for the new build:

- `npm test`: 3/3 pass — entry/return endpoints, continuous reversal, frame-gap handling.
- `npm run typecheck`: pass.
- `npm run build`: pass; existing non-fatal bundle-size / Zod annotation warnings remain.
- `npm run test:journey`: pass — actual emulated hand input starts entry, halfway reveal is gradual, a held pinch does not toggle repeatedly, a second pinch reverses mid-fade, left-hand entry reaches full ocean, the interaction anchor stays fixed, exit clears the ocean, and re-entry begins in the room.
- Structured transition evidence: `artifacts/journey-results.json`.
- The first visual inspection found an abrupt edge in the overhead surface. The surface now fades radially into the surrounding water gradient. Fully revealed ground/reef materials write depth for correct opaque occlusion.

### Try the new build on Quest

Refresh **https://10.0.0.222:8081/** in Quest Browser, then enter XR while seated and looking forward. Use the current Network URL if the laptop address changed.

1. Confirm that you initially see your real room and the sphere.
2. Point and pinch once. Watch the room dissolve into the ocean over about eight seconds. Your viewpoint should not translate or drop.
3. Look around and upward. Confirm a continuous ocean, seabed and overhead water, without room leakage at full immersion.
4. Pinch the sphere again. Confirm that the room returns gradually (about 4.5 seconds from fully immersed).
5. Pinch again, then pinch midway through entry to verify a smooth early reversal.
6. Repeat with the other hand; hold a pinch to confirm it does not rapidly alternate states.
7. Hide/recover your hands, exit via Quest Browser, and re-enter. A new XR session must start in the room.
8. Check readable return instructions, comfortable seated target distance, steady frame rate, and absence of flashes or uncomfortable motion.

All eight new on-device observations remain **pending manual review**. If needed, the desktop Return to room button and Escape reverse the reveal; Quest Browser's system XR exit remains the headset fallback. Add `?debug=1` to show detailed diagnostics in the spatial panel.

## Re-verification handoff (2026-11-17, later session)

Re-run against the live managed dev server (`https://localhost:8081/`, Quest 3 IWER profile) after a runtime reload:

- `npm run typecheck`: PASS. `npm run build`: PASS (bundle-size warning only). `npm test`: 3/3 PASS.
- `npm run test:smoke`: 12/12 PASS after one test fix. The console check previously counted `net::ERR_ABORTED` requests cancelled by a page reload as app errors; it now ignores only those navigation aborts. No application error was logged.
- `npm run test:journey`: 12/12 PASS.
- Visual: in an emulated XR session a right-hand ray pinch turned the sphere cyan with the confirmation ring; label and instruction panel readable.

Physical Quest 3 checks remain **unverified**. Use the steps above with the current Network URL from `npm run dev:status` (it was `https://10.0.0.222:8081/` at this time).

## Phase 1 — persistent ocean (2026-11-17)

Automated, actually executed against the managed dev server (Quest 3 IWER profile):

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` | PASS (bundle-size warning only) |
| `npm test` | 14/14 PASS. 11 Ocean Director unit tests, including the spec input: 0.15 → 0.95 reversed to 0.30 at ~0.55, max step ≤ rate cap, settles at 0.30. Also covers lock vs. automatic change, seeded reproducibility, pause, bounded travel, reset, band hysteresis, invalid deltas |
| `npm run test:ocean` | 22/22 PASS with real emulated hand pinches: starts sunlit at 0.15 with panel hidden and one ocean instance; Arrival entry; right-hand Midnight selection locks target without travel; gradual descent (0.297 after 2 s), no jumps; continuous mid-transition reversal (0.577 → 0.542); settles at 0.30; lock holds 90 s; left-hand panel pinch; open-water pinch travels 0.35 m in 1 s and stops on release; headset pose unchanged; pause freezes and resume continues; reset restores defaults with no duplicates; re-entry starts fresh sunlit; no console errors |
| `npm run test:smoke`, `npm run test:journey` (Phase 0 regressions) | 12/12 and 12/12 PASS |
| Visual | `artifacts/phase1-depth-bands.png`: sunlit, open blue and midnight in emulated XR are clearly distinct; panel readable; midnight shows sparse cyan/violet motes |

FPS was **not measured** on hardware. Emulator frame times are not representative.

### Phase 1 Quest checks (manual, pending)

Open the current Network URL (`npm run dev:status`) in Quest Browser, seated, then Enter XR.

- [ ] Pinch the sphere: the room fades into a bright sunlit ocean.
- [ ] Depth Compass appears to the lower left, is readable, and every button responds to a hand pinch (either hand).
- [ ] Midnight: the ocean darkens gradually over ~13 s with no flashes. Choose Open blue halfway through and the change reverses smoothly.
- [ ] Twilight/Midnight feel like the same ocean, only deeper. No reload, no pop.
- [ ] Pinch-and-hold while pointing at open water: the scenery glides and a small cyan cone shows direction. Release stops it immediately. No nausea at the default rate. Calm makes it slower.
- [ ] Pinching the panel or sphere never makes you travel.
- [ ] Pause freezes the ocean while head tracking stays live. Resume, Reset and Drift work.
- [ ] Exit XR and re-enter: starts in the room, then sunlit.
- [ ] Frame rate feels smooth at Midnight and Sunlit (record FPS from `?debug=1` if possible).

## Phases 2–5 — living ocean, encounters, reveal, NAMI, opening (2026-11-17/18)

All results are from the managed dev server with the Quest 3 IWER emulator, unless marked **UNVERIFIED**.

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | 26/26 PASS: 11 Ocean Director tests, 12 simulation tests and 3 transition tests (details below) |
| `npm run build` | PASS (bundle-size warning only) |
| `npm run test:ocean` (Phase 1) | 22/22 PASS |
| `npm run test:smoke` (Phase 0) | 12/12 PASS |
| `npm run test:journey` (Arrival) | 12/12 PASS |
| `npm run test:experience` (full arc, real emulated hands) | 34/34 PASS. **Known intermittent:** the first pinch on the revealed squid sometimes registers no press even while the ray hovers it. One retry always worked; a pick volume was added. Watch this on Quest. |

The 12 simulation unit tests (`tests/sims.test.mjs`) cover:
- gestures: 0.1 m/s reads as slow; a 1 m/s sweep fires exactly once; noise never toggles; tracking reacquire and implausible jumps never fire; open palm needs a stable hold, and IWER's relaxed hand is rejected
- arbiter priority
- flock: attract, scatter, regroup; viewer keep-out; bounded steps
- seed-42 shark at depth 0.45: all states, fish threat, comfort radius, completion, no duplicate spawn
- scheduler reproducibility, eligibility and timeout
- pulse at depth 0.95: palm glow, one pulse, wavefront order, reveal completes; no reveal in shallow water
- NAMI rate limiting and dismiss

`npm run test:experience` drives the full arc with real emulated hand input:
1. relaxed hands don't start the ocean; NAMI welcomes; an open palm starts it
2. a steady hand attracts the school; a fast sweep is detected and scatters it; the school regroups
3. the showcase turtle appears; pinching it makes a discovery and card without triggering travel
4. the showcase shark goes cruise → notice → investigate → turn away → done
5. the school evades it with no user input
6. the shark's minimum distance is 3.64 m (more than the 3.2 m comfort radius); it can be inspected with the left hand
7. midnight: open palm is detected, NAMI prompts, no pulse until release and no travel while armed
8. exactly one pulse; the wavefront reaches the squid and the reveal completes
9. the squid can be inspected; 4 species discovered
10. pause freezes the ocean; restart resets ocean, encounters and reveal
11. hand loss is reported with no gesture storm on return; XR exits; no console errors

### Bugs found and fixed during QC

All of these would have shown up on the headset.

1. **Render loop freeze at twilight.** The SDK pointer raycast the anglerfish's glow `Sprite`, which throws without `Raycaster.camera`, every frame. Fixed: decorative sprites have a no-op `raycast`.
2. **Relaxed hand read as an open palm** (4 straight fingers), which auto-started the ocean. Fixed with thresholds measured on IWER poses: thumb gap > 11 cm and finger spread > 11.5 cm.
3. **Tracking jumps counted as sweeps.** Fixed: movements over 4 m/s are treated as glitches.
4. **Fish blocked UI pinches.** Fish attracted to a hand swim between the hand and the panel or sphere, so the pinch became a fish discovery. Fixed: school ray hits closer than 0.9 m are ignored, so UI wins, per the spec's "UI focus first".
5. **NAMI caption and discovery card sat in pointing paths** right of the sphere. Moved above eye line.
6. **Jellies drifted into the squid's corridor, and the shark could linger into midnight.** Jellies now keep to the flanks; the shark turns away when depth leaves its band (above 0.8).
7. **Restart left the pulse count in diagnostics.** Fixed.

### Performance

Measured with `node scripts/perf-probe.mjs` (IWER, desktop GPU) and recorded in `artifacts/perf-results.json`. These are **not Quest numbers**.

| State | Draw calls | Triangles | Points / lines |
| --- | --- | --- | --- |
| Room (passthrough) | 30 | 38.7k | 248 / 60 |
| Sunlit | 78 (was 90) | 104k | 968 / 60 |
| Open blue | 78 (was 90) | 104k | 968 / 60 |
| Midnight | 98 (was 114) | 97k | 1148 / 2140 |
| Reveal | 102 (was 120) | 103k | 1148 / 2140 |

Optimizations made:
- Sun shafts merged into one instanced draw.
- Jelly tentacles excluded from raycasts.
- Generous squid pick volume.
- Per-frame allocations removed (palm lookup, diagnostic strings rebuilt at about 15 Hz, event-log string cached).
- Idle uploads skipped (dormant organisms, empty school).

Already in place:
- One instanced draw for 56 fish and one draw for 90 organisms; no dynamic lights or shadows.
- 60 Hz fixed-step boids with a spatial hash.

At midnight the emulator holds 16.7 ms p50 / 16.8 ms p95 (vsync-capped, 0 dropped frames of 482).

**Quest FPS: UNVERIFIED.** Measure on the headset; the spec requires at least 60 FPS. If it is short, reduce first: transparent overdraw from the water shell, jelly tentacle lines, organism count (90), then fish count (56).

### Physical Quest checks — Phases 2–5 (manual, all UNVERIFIED)

Open the Network URL from `npm run dev:status` in Quest Browser, sit down, select Enter XR, and put the controllers down.

- [ ] NAMI's welcome caption is readable. Bubbles and small scout fish circle the sphere in your real room.
- [ ] A relaxed hand never starts the ocean. A deliberate open palm (high five) held for about half a second does, and so does pinching the sphere.
- [ ] A steady hand held toward the school draws fish closer. A quick sweep scatters them; they regroup. No startle from small hand jitter.
- [ ] The turtle passes within the first minute in sunlit water. It highlights when pointed at; a pinch shows a readable card. Pinch the card to close it.
- [ ] Open blue: the shark arrives in front, circles at a distance (never closer than about 3 m), the school flees, and it leaves. No lunges. It feels calm, not threatening.
- [ ] The Depth Compass buttons work even while fish crowd around your hand.
- [ ] Midnight: the jellies, the anglerfish's lure and the sparse glow read well. An open palm wakes nearby lights.
- [ ] Open palm, then pinch and release: one pulse ring expands. The squid emerges slowly about 9 m away. It is impressive, not scary. Pinch it for its card. **Watch item:** note whether the first pinch on the squid registers.
- [ ] Pause, Calm, Recenter, Text size, Sound, Room and Restart each do what they say.
- [ ] Losing and returning your hands causes no stray scatter or pulse, and NAMI reports the loss.
- [ ] Audio: the soft water hush deepens with depth, and the chimes are audible. With the Sound button off it is silent.
- [ ] Frame rate in sunlit, open blue with the shark, and midnight during the reveal (enable `?debug=1` for FPS). Target at least 60.
- [ ] Fact check: verify each species' wording against its `sourceUrl` in `src/data/species.ts`, then set `reviewStatus: 'checked'`.

### Not implemented (deliberate scope cuts)

- Clownfish and reef shelf.
- Room-aware placement (scene understanding is enabled but unused).
- Open-palm-toward-UI summon (the compass is always shown in the ocean).
- Sound-reactive / microphone mode.
- LLM / agentic NAMI.
- Licensed glTF creatures (procedural stand-ins, with a documented swap path).
- Bundled Manrope font.
- Hosting and deployment (Phase 6).

### Hosting

Live at **https://shogunace.github.io/abyss-vr/**, from the public repo https://github.com/ShogunAce/abyss-vr. GitHub Actions (`.github/workflows/pages.yml`) runs typecheck, unit tests and build, then deploys `dist/` on every push to `main`.

Verified: the page returns HTTP 200, and assets load under the `/abyss-vr/` subpath (the production build was also checked locally under the same subpath with zero console errors).

CI fixes:
- `npm_config_onnxruntime_node_install_cuda=skip` (a dev-tool dependency's CUDA download 404s on Linux)
- `--experimental-strip-types` for the Node 22 test runner

Not done: PWA manifest, icons and APK packaging. A Pages project site is a subpath, so a TWA would also need `assetlinks.json` at the `shogunace.github.io` origin root.
