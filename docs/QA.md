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
