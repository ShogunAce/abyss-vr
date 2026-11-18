import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { AbyssSystem } from './abyss.js';
import { OceanSystem } from './ocean/ocean-system.js';
import { GestureSystem } from './systems/gesture-system.js';
import { CreatureSystem } from './systems/creature-system.js';
import { RevealSystem } from './systems/reveal-system.js';
import { GuideSystem } from './systems/guide-system.js';
import './style.css';
World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions)
  .then(world => { world
      .registerSystem(GestureSystem)
      .registerSystem(AbyssSystem)
      .registerSystem(OceanSystem)
      .registerSystem(CreatureSystem)
      .registerSystem(RevealSystem)
      .registerSystem(GuideSystem); })
  .catch(error => {
    console.error('ABYSS initialization failed', error);
    document.getElementById('app-status')!.textContent = `Unable to start: ${error instanceof Error ? error.message : String(error)}`;
  });
