import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { AbyssSystem } from './abyss.js';
import './style.css';
World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions)
  .then(world => { world.registerSystem(AbyssSystem); })
  .catch(error => {
    console.error('ABYSS initialization failed', error);
    document.getElementById('app-status')!.textContent = `Unable to start: ${error instanceof Error ? error.message : String(error)}`;
  });
