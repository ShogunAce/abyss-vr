import { defineAssets } from '@iwsdk/core';
import { createSphere, createParticles, createLabel, createConfirmation } from './scene-assets/abyss.scene-asset.js';
import { createOcean } from './scene-assets/ocean.scene-asset.js';
export default defineAssets({ sphere: createSphere(), particles: createParticles(), label: createLabel(), confirmation: createConfirmation(), ocean: createOcean() });
