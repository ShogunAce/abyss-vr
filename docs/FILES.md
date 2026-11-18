# Files delivered

Generated baseline: official `@iwsdk/create` 1.1.0 TypeScript AR project, including package lock, native scene framework, TypeScript/Vite configuration, development tools and harness guidance. Generated `iwsdk.config.json` and `vite.config.ts` retained without changes; the former already targets `metaQuest3`.

## Application files created or replaced

- `src/index.ts`: starts the generated manifest-configured World and ABYSS system; reports startup failure.
- `src/abyss.ts`: SDK selection subscription, feedback, session placement, recovery and diagnostics.
- `src/abyss-component.ts`: inspectable interaction count, last event and pulse state.
- `src/components.ts`: registers the ABYSS component.
- `src/assets.ts`: registers the four active procedural assets.
- `src/scene-assets/abyss.scene-asset.ts`: blue sphere, 96 particles, line lettering and confirmation ring.
- `public/scenes/main.iwsdk.scene.json`: minimal AR scene, native interactable sphere, aqua light and desktop view.
- `index.html`, `src/style.css`: desktop introduction, Enter/Exit XR, input instructions and diagnostic panel.
- `package.json`: adds `test:smoke` to the generated scripts.
- `scripts/smoke.mjs`: repeatable CLI-driven IWER checks and saved evidence.

## Documentation

- `README.md`: run and test entry points.
- `docs/DECISIONS.md`: API choices, platform assumptions and limits.
- `docs/QA.md`: actual observed results and ten unchecked physical Quest tests.
- `docs/ASSET_LICENSES.md`, `docs/THIRD_PARTY_NOTICES.txt`: asset origins and upstream MIT notices.
- `docs/COMMANDS.md`: executable command record, including corrected exploratory failures.
- `docs/FILES.md`: this inventory.

## Outputs

- `dist/`: successful production build (Git-ignored).
- `artifacts/qa-results.json`: successful final emulator assertions, requests and responses.
- `artifacts/npm-audit.json`: generated dependency audit findings.
- `artifacts/sphere.png`, `initial-xr.png`, `pinch-cyan.png`, `desktop.png`, `desktop-ready.png`, `scene.png`: runtime and asset/scene inspection evidence.
- `.iwsdk/`: generated local HTTPS/runtime state and logs (Git-ignored).

Unused starter models/systems/UI remain in the tree but are not registered by the active application. No external remote was created and no deployment was performed.

## The Arrival extension

New files: `src/transition.ts`, `src/scene-assets/ocean.scene-asset.ts`, `tests/transition.test.mjs`, `scripts/journey-smoke.mjs`.

Updated files: `src/abyss.ts`, `src/abyss-component.ts`, `src/assets.ts`, `public/scenes/main.iwsdk.scene.json`, `index.html`, `src/style.css`, `package.json`, `README.md`, and the existing documentation files. The IWSDK/Vite configuration and installed dependency versions are unchanged.

New evidence: `artifacts/journey-results.json`, `artifacts/journey-halfway.png`, `artifacts/journey-ocean.png`, and final ocean capture. The earlier Phase 0 artifacts remain historical evidence.

## Phase 1 — persistent ocean and Ocean Director

New files: `src/ocean/ocean-director.ts` (pure seeded simulation), `src/ocean/ocean-system.ts` (ECS bridge, Depth Compass, travel, diagnostics), `src/ocean/ocean-components.ts` (`OceanStatus`, `OceanControl`), `tests/ocean-director.test.mjs`, `scripts/ocean-smoke.mjs` (`npm run test:ocean`).

Updated: `src/scene-assets/ocean.scene-asset.ts` (depth uniforms, travel frame, drifting motes), `src/abyss.ts` (no longer writes ocean time), `src/components.ts`, `src/index.ts`, `public/scenes/main.iwsdk.scene.json` (authored `OceanStatus`), `index.html`/`src/style.css` (ocean diagnostics and debug buttons), `package.json`.

Evidence: `artifacts/ocean-results.json`, `artifacts/phase1-depth-bands.png` (sunlit / open blue / midnight in emulated XR).

## Phases 2–5 — living ocean

New source:
- `src/runtime.ts`: shared services
- `src/sim/{gesture,flock,shark,encounters,biolum,nami}.ts`: pure simulations
- `src/systems/{gesture,creature,reveal,guide}-system.ts`
- `src/visuals/creature-models.ts`: procedural creatures and shaders
- `src/data/species.ts`: curated facts
- `src/audio/audio-engine.ts`: procedural sound

Updated: `src/ocean/ocean-system.ts` (shared director, comfort row, shared creature environment uniforms, test surface), `src/ocean/ocean-components.ts` (`Inspectable`, diagnostic fields), `src/abyss.ts` (runtime requests, audio start, sprite raycast guard), `src/index.ts` (system order), `src/components.ts`, `public/scenes/main.iwsdk.scene.json`, `README.md`, `package.json` (`test:experience`).

Tests:
- `tests/sims.test.mjs`: gestures, arbiter, flock, shark, scheduler, bioluminescence, NAMI
- `scripts/experience-smoke.mjs`: the full arc with emulated hands
- Evidence: `artifacts/experience-results.json`, `artifacts/phase2-5-*.png`
