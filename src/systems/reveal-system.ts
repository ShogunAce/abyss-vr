import { createSystem, type Entity, Group, Object3D, ShaderMaterial, Vector3 } from '@iwsdk/core';
import { audio } from '../audio/audio-engine.js';
import { Inspectable } from '../ocean/ocean-components.js';
import { runtime } from '../runtime.js';
import { BiolumField } from '../sim/biolum.js';
import { createGiantSquid, createGlow, createOrganisms, createPulseShell } from '../visuals/creature-models.js';
import { setTargetable } from './creature-system.js';

/**
 * The midnight reveal: an open palm wakes nearby organisms; a pinch-release sends
 * one expanding wavefront; organisms light in wavefront order; when the wave
 * reaches the hidden giant squid, it slowly emerges as a bioluminescent silhouette.
 */
export class RevealSystem extends createSystem({}) {
  private root!: Object3D;
  private ocean!: Object3D;
  private field = new BiolumField(90, 5);
  private organisms!: ReturnType<typeof createOrganisms>;
  private pulse!: ReturnType<typeof createPulseShell>;
  private palmGlow = createGlow([0.47, 0.85, 0.86], 0.3);
  private squid!: ReturnType<typeof createGiantSquid>;
  private squidEntity!: Entity;
  private generation = -1;
  private viewer = new Vector3();
  private local = new Vector3();
  private lastHeroState = 'hidden';
  private glowUploaded = true;
  private palm = { x: 0, y: 0, z: 0, open: 0 };

  init() {
    this.ocean = this.world.requireSceneObject('ocean');
    const group = new Group(); group.name = 'Reveal root';
    const rootEntity = this.world.createTransformEntity(group);
    this.root = group;
    this.organisms = createOrganisms(this.field.pos);
    this.world.createTransformEntity(this.organisms.points, { parent: rootEntity });
    this.pulse = createPulseShell();
    this.world.createTransformEntity(this.pulse.mesh, { parent: rootEntity });
    this.palmGlow.visible = false;
    this.world.createTransformEntity(this.palmGlow);
    this.squid = createGiantSquid();
    this.squid.group.visible = false;
    this.squidEntity = this.world.createTransformEntity(this.squid.group, { parent: rootEntity });
    this.squidEntity.addComponent(Inspectable, { speciesId: 'giant-squid' });
    this.cleanupFuncs.push(() => { this.squid.mesh.geometry.dispose(); this.squid.material.dispose(); this.pulse.mesh.geometry.dispose(); this.pulse.material.dispose(); });
  }

  update(delta: number) {
    if (runtime.generation !== this.generation) { this.generation = runtime.generation; this.field.reset(); runtime.stim = 0; this.lastHeroState = 'hidden'; runtime.stats.pulses = 0; runtime.stats.organismResponses = 0; runtime.stats.revealState = 'hidden'; }
    this.root.position.copy(this.ocean.position);
    this.player.head.getWorldPosition(this.viewer).sub(this.root.position);
    const state = runtime.director.state;
    const dt = state.paused ? 0 : delta;
    const depth = state.depth;
    const f = this.field;
    f.enabled = Math.min(1, Math.max(0, (depth - 0.6) / 0.25)) * runtime.immersion;
    // The squid waits beyond visibility, in front of the seated viewer.
    f.hero.x = this.viewer.x; f.hero.y = this.viewer.y - 0.9; f.hero.z = this.viewer.z - 11;

    // Palm light: strongest open palm in deep water.
    const palm = this.palm;
    let found = false;
    palm.open = -1;
    for (let i = 0; i < 2; i++) {
      const g = i === 0 ? runtime.hands.left : runtime.hands.right;
      if (g.openPalm && g.ready && f.enabled > 0.3 && g.openFor > palm.open) { palm.x = g.x; palm.y = g.y; palm.z = g.z; palm.open = g.openFor; found = true; }
    }
    f.palm.active = found;
    if (found) {
      f.palm.x = palm.x - this.root.position.x; f.palm.y = palm.y - this.root.position.y; f.palm.z = palm.z - this.root.position.z;
      this.palmGlow.position.set(palm.x, palm.y, palm.z);
      this.palmGlow.scale.setScalar(0.22 + Math.min(1, palm.open) * 0.18 + Math.sin(runtime.clock * 3) * 0.015);
      this.palmGlow.material.opacity = 0.55 * f.enabled;
    }
    this.palmGlow.visible = found;

    if (runtime.pendingPulse) {
      const p = runtime.pendingPulse; runtime.pendingPulse = null;
      if (f.enabled > 0.3 && f.emitPulse(p.x - this.root.position.x, p.y - this.root.position.y, p.z - this.root.position.z)) {
        runtime.stats.pulses = f.pulseCount;
        runtime.stim = 1;
        audio.pulse();
        runtime.log('pulse', `#${f.pulseCount} released`);
        runtime.nami.notify('pulse', runtime.clock);
      }
    }
    f.update(dt, depth);
    runtime.stim = Math.max(0, runtime.stim - dt * 0.25);

    // Organisms
    // Skip the GPU upload entirely while the field is asleep and invisible.
    if (f.enabled > 0.001 || !this.glowUploaded) {
      (this.organisms.glow.array as Float32Array).set(f.glow);
      this.organisms.glow.needsUpdate = true;
      this.glowUploaded = f.enabled <= 0.001;
    }
    this.organisms.material.uniforms.uEnabled.value = f.enabled;
    this.organisms.points.visible = f.enabled > 0.001;

    // Wavefront shell (largest active pulse)
    let shown = false;
    for (const pulse of f.pulses) {
      if (!pulse.active) continue;
      shown = true;
      this.pulse.mesh.position.set(pulse.x, pulse.y, pulse.z);
      this.pulse.mesh.scale.setScalar(Math.max(0.01, pulse.radius));
      this.pulse.material.uniforms.uOpacity.value = 0.85 * (1 - pulse.radius / 16) * f.enabled;
    }
    this.pulse.mesh.visible = shown;

    // Hero reveal
    const hero = f.hero;
    if (hero.state !== this.lastHeroState) {
      runtime.log('reveal', hero.state);
      if (hero.state === 'emerging') audio.reveal();
      if (hero.state === 'revealed') runtime.nami.notify('reveal', runtime.clock);
      this.lastHeroState = hero.state;
    }
    const level = hero.level * runtime.immersion;
    this.squid.group.visible = level > 0.001;
    if (this.squid.group.visible) {
      // Drifts slightly closer as it emerges, staying ~9.5 m away.
      this.squid.group.position.set(hero.x + 0.6, hero.y + Math.sin(state.time * 0.2) * 0.15, hero.z + 1.5 * hero.level);
      this.squid.group.rotation.set(0.05 * Math.sin(state.time * 0.15), 0.2, 0);
      this.squid.material.uniforms.uReveal.value = level;
      (this.squid.eye.material as ShaderMaterial).uniforms.uReveal.value = level;
    }
    setTargetable(this.squidEntity, level > 0.6);
    runtime.stats.organismResponses = f.responses;
    runtime.stats.revealState = hero.state;
  }
}
