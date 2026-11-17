# Asset licenses

| Asset | Origin | License / usage |
| --- | --- | --- |
| Sphere, ring, particles | Original procedural geometry in `src/scene-assets/abyss.scene-asset.ts` | Created for this project; no external asset attribution |
| ABYSS line lettering | Original stroke coordinates in that same module | Created for this project; no downloaded font |
| Diagnostic text | Browser system monospace font, rasterized at runtime | No font redistributed |
| IWSDK starter/runtime | Meta, `@iwsdk/core` 1.1.0 | MIT; upstream notice in `node_modules/@iwsdk/core/LICENSE` |
| Three.js / super-three | Three.js authors, generated alias 0.185.0 | MIT; upstream notice in `node_modules/three/LICENSE` |
| IWER simulated room and hands | Generated development emulator dependencies | Development only; not ABYSS production media. Preserve package notices |

Unused starter files are retained but are not registered in the active manifest or scene. The active scene does not fetch the starter robot or audio. No music, photos, third-party models or generative media were added.

Dependency package licenses remain in installed packages; this file is an asset inventory, not a replacement for their license texts. Retain applicable upstream notices when distributing a hosted build.

## Additional original assets — The Arrival

`src/scene-assets/ocean.scene-asset.ts` contains original procedural terrain, reef instances, water/light shaders and particle geometry. No downloaded texture, 3D model, sound or font was added. The same installed IWSDK/Three MIT notices apply.
