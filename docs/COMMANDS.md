# Commands and outputs

All application commands were run from `C:\Users\coled\Projects\AbyssVR` in PowerShell. Read-only file inspection and documentation writes are omitted from this executable command list. The complete repeatable XR test requests/responses are in `artifacts/qa-results.json`; `scripts/smoke.mjs` executes those requests through the installed official CLI.

## Environment and scaffold

```powershell
node --version
npm --version
git --version
npx --yes @iwsdk/create@latest --help
npx --yes @iwsdk/create@latest . --yes --target ar --language ts --install --git --no-grabbing --no-physics --scene-understanding --no-environment-raycast --skip-reference-warmup
```

The generator installed dependencies and initialized Git. Initial invocation with the additional `--no-locomotion` flag was rejected because AR does not accept that flag. It was removed; the generated manifest correctly has locomotion disabled. The first sandboxed generator attempt could not complete network access; installation succeeded with the approved host execution.

## Build and launch

```powershell
npm run typecheck
npx @iwsdk/cli dev up --headed --screenshot-width 640 --screenshot-height 640
npx @iwsdk/cli dev status --raw
npm run build
npm ls three --depth=2
npm audit --json | Set-Content artifacts/npm-audit.json
ipconfig
```

Typecheck and build exited 0. Audit exited 1 with eight high findings. The network command established Wi-Fi address 10.0.0.222. A `Get-NetIPConfiguration` probe could not access CIM in the sandbox, so `ipconfig` was used. Local browser CLI calls require access to the server's named pipe; sandboxed calls returned EPERM and were rerun through approved host execution.

## Visual and interaction checks

```powershell
npx @iwsdk/cli browser logs --input-json '{"count":15}'
npx @iwsdk/cli asset render-preview --input-json '{"assetId":"sphere","mode":"material"}' --output-file artifacts/sphere.png
npx @iwsdk/cli xr enter
npx @iwsdk/cli xr set-input-mode --input-json '{"mode":"hand"}'
npx @iwsdk/cli xr status
npx @iwsdk/cli ecs find --input-json '{"withComponents":["AbyssSphere"]}'
npx @iwsdk/cli xr list-targets
npx @iwsdk/cli browser snapshot
npx @iwsdk/cli browser screenshot --output-file artifacts/initial-xr.png
npx @iwsdk/cli xr look-at --input-json '{"device":"hand-right","target":{"x":0,"y":1.45,"z":-0.7}}'
npx @iwsdk/cli xr select --input-json '{"device":"hand-right","duration":0.2}'
npx @iwsdk/cli ecs query --input-json '{"entityIndex":14}'
npx @iwsdk/cli ecs pause
npx @iwsdk/cli xr set-select-value --input-json '{"device":"hand-right","value":1}'
npx @iwsdk/cli ecs step --input-json '{"count":3}'
npx @iwsdk/cli ecs query --input-json '{"entityIndex":14}'
npx @iwsdk/cli browser screenshot --output-file artifacts/pinch-cyan.png
npx @iwsdk/cli ecs step --input-json '{"count":90}'
npx @iwsdk/cli ecs query --input-json '{"entityIndex":14}'
npx @iwsdk/cli xr set-select-value --input-json '{"device":"hand-right","value":0}'
npx @iwsdk/cli ecs resume
npx @iwsdk/cli xr look-at --input-json '{"device":"hand-left","target":{"x":0,"y":1.45,"z":-0.7}}'
npx @iwsdk/cli xr select --input-json '{"device":"hand-left","duration":0.2}'
npx @iwsdk/cli ecs query --input-json '{"entityIndex":14}'
npm run test:smoke
npx @iwsdk/cli browser screenshot --output-file artifacts/desktop.png
npx @iwsdk/cli browser interact --input-json '{"steps":[{"action":"pointerMove","point":{"x":519,"y":336}},{"action":"pointerDown","point":{"x":519,"y":336}},{"action":"wait","durationMs":150},{"action":"pointerUp","point":{"x":519,"y":336}}]}'
npx @iwsdk/cli ecs query --input-json '{"entityIndex":14}'
npx @iwsdk/cli scene render-file --input-json '{"path":"public/scenes/main.iwsdk.scene.json","viewId":"hero"}' --output-file artifacts/scene.png
npm run test:smoke
```

`entityIndex:14` was observed in this particular session, not hard-coded in the reusable test. Initial exploratory `ecs find` with `components` and `ecs step` with `frames` were rejected by CLI validation; corrected names are `withComponents` and `count`. An initial desktop click at (519,373) missed the sphere and correctly did not increment the counter. The observed sphere center was (519,336).

The first smoke run passed all assertions but attempted to release an already-ended XR session during cleanup. Cleanup now checks session activity first, and the suite was rerun. No application code changed for that harness correction.

Help was consulted with `dev up --help`, `xr --help`, `browser --help`, `ecs --help`, `xr look-at --help`, `xr set-input-mode --help`, `xr set-connected --help`, and `browser interact --help`.

## Restart and repeat

```powershell
npm run dev
npm run test:smoke
npm run dev:status
# When finished:
npm run dev:down
```

The managed development server is intentionally left running for the physical headset test. Host validation does not prove reachability from Quest.

## Final checks

```powershell
git diff --check
npm run typecheck
node --check scripts/smoke.mjs
Test-Path dist/index.html
npx @iwsdk/cli browser reload
npx @iwsdk/cli ecs find --input-json '{"withComponents":["AbyssSphere"]}'
npx @iwsdk/cli browser screenshot --output-file artifacts/desktop-ready.png
npx @iwsdk/cli dev status --raw
```

Final smoke rerun exited 0 with every assertion passing and clean cleanup. Typecheck and script syntax checks passed; production output exists. The browser was reset to the initial scene for handoff.

## The Arrival extension commands

```powershell
npm run typecheck
npm test
npx @iwsdk/cli dev status --raw
npx @iwsdk/cli browser reload
npx @iwsdk/cli xr enter
npx @iwsdk/cli xr set-input-mode --input-json '{"mode":"hand"}'
npx @iwsdk/cli xr look-at --input-json '{"device":"hand-right","target":{"x":0,"y":1.45,"z":-0.7}}'
npx @iwsdk/cli xr select --input-json '{"device":"hand-right","duration":0.2}'
npx @iwsdk/cli ecs find --input-json '{"withComponents":["AbyssSphere"]}'
npx @iwsdk/cli ecs query --input-json '{"entityIndex":15}'
npx @iwsdk/cli browser screenshot --output-file artifacts/ocean-first.png
npx @iwsdk/cli browser logs --input-json '{"count":100}'
node --check scripts/journey-smoke.mjs
npm run test:journey
npm run typecheck
npm run build
npm run test:smoke
```

The managed browser had been closed since the previous milestone; the first reload/enter attempts reported not-ready. The CLI recovered the visible browser, and fresh XR commands then succeeded. No application configuration change was needed. Transition test requests and responses are recorded in `artifacts/journey-results.json`; the new runtime sphere index was discovered as 15 rather than assumed from the earlier session.
