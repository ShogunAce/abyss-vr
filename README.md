# ABYSS — The Living Ocean

Your room becomes an ocean, and the ocean responds to you. ABYSS is a seated, hands-first WebXR experience for Meta Quest 3/3S, built with IWSDK 1.1.0. Everything is procedural: no downloaded models, textures or audio files.

## Try it

- Laptop (IWER emulator): https://localhost:8081/
- Quest on the same Wi-Fi: use the Network URL from `npm run dev:status` (it was https://10.0.0.222:8081/).
- `?explore` switches off the deterministic showcase and uses a random seed. `?debug=1` puts detailed diagnostics on the spatial panel.

**The arc, 5–8 minutes, hands only:**

1. **Room.** Select **Enter XR** and stay seated. NAMI, a small glowing guide, invites you in while bubbles rise and a few scout fish circle the glowing sphere in your room.
2. **Arrival.** Pinch the sphere, or hold an open palm (a high five, fingers spread) for about half a second. Your room dissolves into a sunlit ocean over about 8 s.
3. **Fish.** Hold a steady or slowly moving hand toward the school and the fish gather around it. A quick sweep scatters them, and they regroup.
4. **Turtle.** A green sea turtle glides past. Point at it (it highlights), then pinch to discover it. Pinch the card to close it.
5. **Open blue.** Choose **Open blue** on the Depth Compass (the panel to your lower left). A reef shark arrives, investigates from a distance and turns away. Watch the school flee from it on their own. Pinch the shark to discover it.
6. **Midnight.** Choose **Midnight**. Moon jellies and an anglerfish appear in the dark. Open your palm and organisms near your hand begin to glow.
7. **The reveal.** While your palm has recently been open, pinch and release: one pulse of light expands outward. When it reaches the dark, a giant squid emerges as a glowing silhouette. Pinch it to discover it.
8. **Exploring.** Pinch and hold while pointing at open water to glide gently in that direction; release to stop.

**Depth Compass buttons:**
- Bands: Sunlit, Open blue, Twilight, Midnight
- Drift, Pause, Calm (reduced motion), Restart
- Recenter, Text size, Sound, Room

Pinch NAMI's caption to dismiss it. Discoveries and comfort preferences are saved on the device.

The viewer is never moved. Travel and depth change the world, never the camera. There is no microphone use.

## Run

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

IWSDK manages Vite, local HTTPS and the visible IWER browser emulator. Check an existing server with `npm run dev:status`; stop it with `npm run dev:down`.

## Verify

With the managed development browser/server running:

```powershell
npm run test:journey
npm run test:ocean
npm run test:experience
npm run test:smoke
```

Journey tests cover real emulated pinch input, gradual entry, reversal mid-transition, full immersion, stationary placement and session reset. The foundation smoke tests cover both hands, one event per press, hand loss/recovery and XR exit/re-entry. Structured evidence is in `artifacts/journey-results.json` and `artifacts/qa-results.json`.

Developer diagnostics are collapsed by default. Expand them on desktop; append `?debug=1` to the URL to replace the spatial journey instruction with the detailed developer panel.

The user reported that the preceding foundation worked. **This new ocean transition still needs physical Quest review**, especially passthrough blending, performance, readability and seated comfort. See [QA](docs/QA.md), [decisions](docs/DECISIONS.md), [asset licenses](docs/ASSET_LICENSES.md), and [commands](docs/COMMANDS.md).
