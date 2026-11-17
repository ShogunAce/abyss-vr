# ABYSS — The Arrival

A seated, hands-first journey from your own room into an underwater world. Built on the verified Phase 0 foundation with IWSDK 1.1.0.

## Try it

- Laptop: https://localhost:8081/
- Quest on the same Wi-Fi: https://10.0.0.222:8081/ (current laptop address; check `ipconfig` after network changes).
- Select **Enter XR**, stay seated, and look forward.
- **Point and pinch the sphere** to let the room fade into an ocean over roughly eight seconds.
- **Pinch again at any time** to reverse toward your room. A full return takes roughly 4.5 seconds.
- The viewer never moves. The ocean surrounds the initial seated position.
- Desktop users can click the sphere. **Return to room** and **Escape** also reverse the reveal. Quest Browser's system exit always ends the immersive session.
- Opening a fresh XR session always starts in the room, including after exiting from the ocean.

The underwater environment includes a rippled seabed, distant reef outcrops, an overhead water surface, drifting motes and soft light shafts. This is the first environment/transition slice; wildlife, audio and ocean exploration are not implemented yet.

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
npm run test:smoke
```

Journey tests cover real emulated pinch input, gradual entry, reversal mid-transition, full immersion, stationary placement and session reset. The foundation smoke tests cover both hands, one event per press, hand loss/recovery and XR exit/re-entry. Structured evidence is in `artifacts/journey-results.json` and `artifacts/qa-results.json`.

Developer diagnostics are collapsed by default. Expand them on desktop; append `?debug=1` to the URL to replace the spatial journey instruction with the detailed developer panel.

The user reported that the preceding foundation worked. **This new ocean transition still needs physical Quest review**, especially passthrough blending, performance, readability and seated comfort. See [QA](docs/QA.md), [decisions](docs/DECISIONS.md), [asset licenses](docs/ASSET_LICENSES.md), and [commands](docs/COMMANDS.md).
