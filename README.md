# ABYSS — The Living Ocean

Your room becomes an ocean, and the ocean responds to you. ABYSS is a seated, hands-first WebXR experience for Meta Quest 3/3S, built with IWSDK 1.1.0. Everything is procedural: no downloaded models, textures or audio files.

## Try it

- **Live build (GitHub Pages):** https://shogunace.github.io/abyss-vr/. Open it in Quest Browser, select Enter XR, and put the controllers down. It redeploys automatically on every push to `main` (`.github/workflows/pages.yml`).
- Laptop (IWER emulator): https://localhost:8081/
- Quest on the same Wi-Fi: use the Network URL from `npm run dev:status` (it was https://10.0.0.222:8081/).
- `?explore` switches off the deterministic showcase and uses a random seed. `?debug=1` puts detailed diagnostics on the spatial panel.

**The arc, 5–8 minutes, hands only:**

1. **Room.** Select **Enter XR** and stay seated. NAMI, a small glowing guide, invites you in while bubbles rise and a few scout fish circle the glowing sphere in your room.
2. **Arrival.** Touch or pinch the glowing pearl. Your room dissolves into a sunlit ocean over about 8 s.
3. **Fish.** Hold a steady or slowly moving hand toward the school and the fish gather around it. A quick sweep scatters them, and they regroup.
4. **Turtle.** A green sea turtle glides past. Point at it (it highlights), then pinch to discover it. Pinch the card to close it.
5. **Open blue.** Choose **Open blue** in the Dive menu (the panel to your lower left; make a fist to show or hide it). A reef shark arrives, investigates from a distance and turns away. Watch the school flee from it on their own. Pinch the shark to discover it.
6. **Midnight.** Choose **Midnight**. Moon jellies and an anglerfish appear in the dark. Open your palm and organisms near your hand begin to glow; plankton flash wherever your hands move.
7. **The reveal.** Keep your palm open for about a second: one pulse of light expands outward. When it reaches the dark, a giant squid emerges as a glowing silhouette. Pinch it to discover it.
8. **Exploring.** Point a finger to swim. Each zone has gold dive markers under a column of light; swim to one to log it and read about the real ocean at that depth. The menu's **Map & journal** page shows where you are, the markers, and which animals you've found.

**Hand signs (each sign does exactly one thing):**

| Sign | Does |
| --- | --- |
| 🤏 Pinch (with the hand ray on something) | Select: creatures, buttons, cards, the pearl |
| 👉 Point (index out, other fingers curled) | Swim: glide where your finger points; stop pointing to stop |
| ✋ Open palm, held | Make light; held about 1 s it sends one pulse (the deep answers it) |
| ✊ Fist, raised and held | Show or hide the Dive menu |
| 👋 Quick sweep | Startle a fish school |
| ☝️ Touch | Touch the pearl with a fingertip to dive |


**Dive menu** (three pages):
- **Dive:** Sunlit, Open blue, Twilight, Midnight · Drift, Pause, Calm (reduced motion), Restart · Recenter, Text size, Sound, Guide (shows or hides NAMI) · Reset layout, New expedition
- **Hand signs:** the table above
- **Map & journal:** top-down map of you and the dive markers, plus animals and markers found

Move the menu by pinching its top bar and moving your hand; move NAMI by pinching her orb. Both are remembered. Hide the menu with **×** or a fist; a small **Menu** tab stays behind to bring it back. Pinch NAMI's caption to dismiss it. Discoveries and comfort preferences are saved on the device.

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
