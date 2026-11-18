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

## Phases 2–5 additions

| Asset | Origin | License / contest use |
| --- | --- | --- |
| Fish school, reef shark, green sea turtle, moon jellies, anglerfish, giant squid | Original procedural geometry and shaders in `src/visuals/creature-models.ts` | Created for this project; permissible |
| Bioluminescent organisms, pulse wavefront, glow sprite, NAMI orb, opening bubbles | Same module; the glow texture is drawn at runtime on a canvas | Created for this project; permissible |
| Soundscape, chimes, pulse and reveal tones | Synthesized at runtime with Web Audio (`src/audio/audio-engine.ts`) | Created for this project; no audio files |
| Species facts | Written for ABYSS, paraphrasing the per-species sources in `src/data/species.ts` (FishBase, NOAA Fisheries, Florida Museum, Monterey Bay Aquarium, NOAA Ocean Exploration, Smithsonian Ocean) | Paraphrased, not copied; **re-check each fact and URL before submission** |

No third-party models, textures, fonts, music or AI-generated media were added. To use a licensed model later, register the glTF in `src/assets.ts` and swap the matching `create*()` call. Behaviour code does not depend on the mesh.
