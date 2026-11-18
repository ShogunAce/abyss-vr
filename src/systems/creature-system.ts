import {
  createSystem, type Entity, Group, Hovered, InstancedBufferAttribute, InstancedMesh, Matrix4, Object3D, Quaternion, RayInteractable,
  ShaderMaterial, Vector3,
} from '@iwsdk/core';
import { audio } from '../audio/audio-engine.js';
import { Inspectable } from '../ocean/ocean-components.js';
import { runtime } from '../runtime.js';
import { EncounterScheduler } from '../sim/encounters.js';
import { Flock } from '../sim/flock.js';
import { SharkBrain } from '../sim/shark.js';
import { createAnglerfish, createFishSchool, createJelly, createShark, createTurtle } from '../visuals/creature-models.js';

const FISH = 120;
const SCOUTS = 8;
const JELLIES = 6;

/** Toggle whether an entity can be ray-targeted (hidden creatures never catch rays). */
export function setTargetable(entity: Entity, on: boolean) {
  if (on && !entity.hasComponent(RayInteractable)) entity.addComponent(RayInteractable);
  if (!on && entity.hasComponent(RayInteractable)) entity.removeComponent(RayInteractable);
}

/**
 * Living creature engine: fish school (boids), turtle and shark encounters via the
 * seeded scheduler, drifting moon jellies, and an anglerfish at midnight.
 * Everything lives under one root that follows the ocean origin (the session's seated eye point).
 */
export class CreatureSystem extends createSystem({
  hovered: { required: [Inspectable, Hovered] },
}) {
  private root!: Object3D;
  private ocean!: Object3D;
  private anchor!: Object3D;
  private flock = new Flock(FISH, 11);
  private school!: ReturnType<typeof createFishSchool>;
  private schoolEntity!: Entity;
  private shark!: ReturnType<typeof createShark>;
  private sharkEntity!: Entity;
  private sharkBrain = new SharkBrain();
  private turtle!: ReturnType<typeof createTurtle>;
  private turtleEntity!: Entity;
  private turtleTime = -1;
  private turtleDir = 1;
  private jellies: Array<{ model: ReturnType<typeof createJelly>; entity: Entity; base: Vector3; seed: number }> = [];
  private angler!: ReturnType<typeof createAnglerfish>;
  private anglerEntity!: Entity;
  private scheduler = new EncounterScheduler(runtime.seed, runtime.showcase);
  private highlight = new Map<string, ShaderMaterial[]>();
  private highlightLevel = new Map<string, number>();
  private generation = -1;
  private tier = 0;
  private frameCount = 0;
  private viewer = new Vector3();
  private anchorLocal = new Vector3();
  private forward = new Vector3();
  private temp = new Vector3();
  private matrix = new Matrix4();
  private quat = new Quaternion();
  private scale = new Vector3();
  private zAxis = new Vector3(0, 0, 1);
  private worldUp = new Vector3(0, 1, 0);
  private bx = new Vector3(); private by = new Vector3(); private bz = new Vector3();
  private rx = new Vector3(); private ry = new Vector3();
  private sharkBank = 0;
  private sharkPrevX = 0; private sharkPrevZ = -1;
  private sharkMinDistance = Infinity;
  private sunlitFor = 0;
  /** Scouts are small near the face in the room; the school grows to full size in the ocean. */
  private fishScale = 0.5;

  init() {
    this.ocean = this.world.requireSceneObject('ocean');
    this.anchor = this.world.requireSceneObject('experience');
    const rootGroup = new Group(); rootGroup.name = 'Creature root';
    const rootEntity = this.world.createTransformEntity(rootGroup);
    this.root = rootGroup;

    this.school = createFishSchool(FISH);
    this.schoolEntity = this.world.createTransformEntity(this.school.mesh, { parent: rootEntity });
    this.schoolEntity.addComponent(Inspectable, { speciesId: 'blue-green-chromis' });
    // Fish attracted to a hand swim between the hand and nearby UI. Ignore school hits
    // within reach so the Depth Compass, sphere and cards always win (UI focus first);
    // fish farther away remain pinchable.
    const schoolRaycast = this.school.mesh.raycast.bind(this.school.mesh);
    this.school.mesh.raycast = (raycaster, intersects) => {
      const start = intersects.length;
      schoolRaycast(raycaster, intersects);
      for (let i = intersects.length - 1; i >= start; i--) if (intersects[i].distance < 0.9) intersects.splice(i, 1);
    };
    this.register('blue-green-chromis', this.school.material);

    this.shark = createShark();
    this.shark.mesh.visible = false;
    this.sharkEntity = this.world.createTransformEntity(this.shark.mesh, { parent: rootEntity });
    this.sharkEntity.addComponent(Inspectable, { speciesId: 'grey-reef-shark' });
    this.register('grey-reef-shark', this.shark.material);

    this.turtle = createTurtle();
    this.turtle.group.visible = false;
    this.turtleEntity = this.world.createTransformEntity(this.turtle.group, { parent: rootEntity });
    this.turtleEntity.addComponent(Inspectable, { speciesId: 'green-sea-turtle' });
    this.register('green-sea-turtle', ...this.turtle.materials);

    for (let i = 0; i < JELLIES; i++) {
      const model = createJelly(i * 1.7);
      // Jellies keep to the flanks (≥ ~25° off centre) so the forward corridor stays clear for the squid reveal.
      const offsets = [-1.15, -0.8, -0.48, 0.48, 0.8, 1.15];
      const a = -Math.PI / 2 + offsets[i % offsets.length];
      const r = 2.2 + (i % 3) * 0.9;
      const base = new Vector3(Math.cos(a) * r, -0.1 + ((i * 0.37) % 0.8) - 0.3, Math.sin(a) * r);
      model.group.visible = false;
      model.group.scale.setScalar(0.85 + (i % 3) * 0.2);
      const entity = this.world.createTransformEntity(model.group, { parent: rootEntity });
      entity.addComponent(Inspectable, { speciesId: 'moon-jelly' });
      this.register('moon-jelly', ...model.materials);
      this.jellies.push({ model, entity, base, seed: i * 1.7 });
    }

    this.angler = createAnglerfish();
    this.angler.group.visible = false;
    this.anglerEntity = this.world.createTransformEntity(this.angler.group, { parent: rootEntity });
    this.anglerEntity.addComponent(Inspectable, { speciesId: 'anglerfish' });
    this.register('anglerfish', ...this.angler.materials);

    this.cleanupFuncs.push(() => {
      this.school.mesh.geometry.dispose(); this.school.material.dispose();
      this.shark.mesh.geometry.dispose(); this.shark.material.dispose();
    });
  }

  private register(id: string, ...materials: ShaderMaterial[]) {
    this.highlight.set(id, [...(this.highlight.get(id) ?? []), ...materials]);
  }

  private restart() {
    this.scheduler.reset();
    this.sharkBrain.stop();
    this.turtleTime = -1;
    this.sharkMinDistance = Infinity;
    this.sunlitFor = 0;
    this.flock.activeCount = SCOUTS;
    this.updateFrames();
    this.flock.scatterAround(this.anchorLocal.x, this.anchorLocal.y, this.anchorLocal.z, 0.35);
  }

  /** Viewer, anchor and forward direction in creature-root (ocean-local) space. */
  private updateFrames() {
    this.root.position.copy(this.ocean.position);
    this.player.head.getWorldPosition(this.viewer).sub(this.root.position);
    this.anchor.getWorldPosition(this.anchorLocal).sub(this.root.position);
    this.forward.copy(this.anchorLocal).sub(this.viewer); this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-4) this.forward.set(0, 0, -1);
    this.forward.normalize();
  }

  update(delta: number) {
    this.updateFrames();
    if (runtime.generation !== this.generation) { this.generation = runtime.generation; this.restart(); }
    const state = runtime.director.state;
    const paused = state.paused;
    const dt = paused ? 0 : delta;
    const immersion = runtime.immersion;
    const inOcean = immersion >= 0.999;
    const depth = state.depth;

    // ---- fish school: scouts circle the sphere in the room, the full school joins in the ocean.
    const f = this.flock;
    f.viewer.x = this.viewer.x; f.viewer.y = this.viewer.y; f.viewer.z = this.viewer.z;
    if (runtime.destination === 'room' && immersion < 0.05) {
      f.home.x = this.anchorLocal.x; f.home.y = this.anchorLocal.y + 0.05; f.home.z = this.anchorLocal.z; f.home.radius = 0.3;
      f.activeCount = runtime.sessionActive ? SCOUTS : 0;
      this.tier = 0;
    } else {
      f.home.x = this.viewer.x + this.forward.x * 2.8; f.home.y = this.viewer.y - 0.1; f.home.z = this.viewer.z + this.forward.z * 2.8; f.home.radius = 1.7;
      // Population tiers with hysteresis (no flicker at band edges).
      if (this.tier === 0 && depth > 0.59) this.tier = 1; else if (this.tier === 1 && depth < 0.51) this.tier = 0;
      if (this.tier === 1 && depth > 0.84) this.tier = 2; else if (this.tier === 2 && depth < 0.76) this.tier = 1;
      f.activeCount = this.tier === 0 ? FISH : this.tier === 1 ? 36 : 0;
    }
    // Keep the school clear of the sphere and the Depth Compass (left of the sphere) in the ocean.
    const clearUi = runtime.destination === 'ocean' || immersion > 0.05;
    const o0 = f.obstacles[0], o1 = f.obstacles[1];
    o0.active = clearUi; o0.x = this.anchorLocal.x; o0.y = this.anchorLocal.y; o0.z = this.anchorLocal.z; o0.r = 0.45;
    o1.active = clearUi;
    o1.x = this.anchorLocal.x + this.forward.z * 0.35; o1.y = this.anchorLocal.y - 0.08; o1.z = this.anchorLocal.z - this.forward.x * 0.35; o1.r = 0.45;
    for (let i = 0; i < 2; i++) {
      const g = i === 0 ? runtime.hands.left : runtime.hands.right;
      const h = f.hands[i];
      h.active = g.ready && g.motion !== 'fast' && (inOcean || runtime.destination === 'room');
      h.x = g.x - this.root.position.x; h.y = g.y - this.root.position.y; h.z = g.z - this.root.position.z;
    }
    if (runtime.sweepEvent) {
      const e = runtime.sweepEvent; runtime.sweepEvent = null;
      f.scatter(e.x - this.root.position.x, e.y - this.root.position.y, e.z - this.root.position.z);
      if (inOcean) runtime.nami.notify('sweep', runtime.clock);
    }

    // ---- encounters (only once the ocean is fully present)
    if (inOcean && !paused) {
      const started = this.scheduler.update(state.time, delta, depth, runtime.discovered);
      if (started === 'shark_pass') this.startShark();
      if (started === 'turtle_pass') this.startTurtle();
      if (state.band === 'sunlit' && !state.depthLocked) this.sunlitFor += delta; else this.sunlitFor = 0;
      if (this.sunlitFor > 45 || (runtime.discovered.has('green-sea-turtle') && this.sunlitFor > 12)) runtime.nami.notify('suggestDeeper', runtime.clock);
    }
    if (!inOcean && this.sharkBrain.active) { this.sharkBrain.stop(); this.scheduler.finish(state.time, 'timeout'); }
    // Leaving its band (e.g. descending to midnight) sends the shark away: no overlap with the hero reveal.
    if (this.sharkBrain.active && depth > 0.8) this.sharkBrain.leave();

    // ---- shark
    const sb = this.sharkBrain;
    sb.viewer.x = this.viewer.x; sb.viewer.y = this.viewer.y; sb.viewer.z = this.viewer.z;
    sb.focus.x = f.home.x; sb.focus.y = f.home.y; sb.focus.z = f.home.z;
    const wasState = sb.state;
    sb.update(dt);
    if (sb.state !== wasState) {
      runtime.log('shark', sb.state);
      if (sb.state === 'done') { this.scheduler.finish(state.time); runtime.log('encounter', 'shark_pass complete'); runtime.nami.notify('sharkGone', runtime.clock); }
    }
    f.threat.active = sb.active && sb.presence > 0.3;
    f.threat.x = sb.x; f.threat.y = sb.y; f.threat.z = sb.z;
    this.shark.mesh.visible = sb.presence > 0.01 && immersion > 0.5;
    if (this.shark.mesh.visible) {
      // Level body that banks gently into turns (no arbitrary roll).
      const yaw = dt > 0 ? (this.sharkPrevX * sb.hz - this.sharkPrevZ * sb.hx) / dt : 0;
      this.sharkPrevX = sb.hx; this.sharkPrevZ = sb.hz;
      this.sharkBank += (Math.max(-0.35, Math.min(0.35, yaw * 0.6)) - this.sharkBank) * Math.min(1, delta * 2);
      this.orient(this.matrix, sb.x, sb.y, sb.z, sb.hx, sb.hy, sb.hz, this.sharkBank, 1);
      this.matrix.decompose(this.shark.mesh.position, this.shark.mesh.quaternion, this.shark.mesh.scale);
      this.shark.material.uniforms.uPhase.value = sb.phase;
      this.shark.material.uniforms.uOpacity.value = sb.presence;
      this.sharkMinDistance = Math.min(this.sharkMinDistance, sb.distanceToViewer());
      runtime.stats.sharkMinDistance = this.sharkMinDistance;
    }
    setTargetable(this.sharkEntity, this.shark.mesh.visible && sb.presence > 0.5);

    this.fishScale += ((runtime.immersion > 0.3 ? 1 : 0.5) - this.fishScale) * Math.min(1, delta * 0.8);
    f.update(dt);
    this.writeSchool();

    // ---- turtle: a slow sunlit pass across the front, 4.5 m away
    this.updateTurtle(dt, inOcean);

    // ---- moon jellies: twilight and deeper
    const jellyPresence = Math.min(1, Math.max(0, (depth - 0.5) / 0.15)) * immersion;
    for (const j of this.jellies) {
      const visible = jellyPresence > 0.01;
      j.model.group.visible = visible;
      setTargetable(j.entity, jellyPresence > 0.6);
      if (!visible) continue;
      const t = state.time;
      j.model.group.position.set(
        this.viewer.x + j.base.x + Math.sin(t * 0.07 + j.seed) * 0.4,
        this.viewer.y + j.base.y + Math.sin(t * 0.21 + j.seed) * 0.12 + 0.05 * Math.sin(t * 1.5 + j.seed),
        this.viewer.z + j.base.z + Math.cos(t * 0.05 + j.seed) * 0.4);
      j.model.group.rotation.z = Math.sin(t * 0.3 + j.seed) * 0.15;
      for (const m of j.model.materials) { m.uniforms.uPresence.value = jellyPresence; m.uniforms.uStim.value = runtime.stim; }
    }

    // ---- anglerfish: midnight only, hovering with its living lure
    const anglerPresence = Math.min(1, Math.max(0, (depth - 0.72) / 0.12)) * immersion;
    this.angler.group.visible = anglerPresence > 0.01;
    setTargetable(this.anglerEntity, anglerPresence > 0.6);
    if (this.angler.group.visible) {
      const t = state.time;
      this.angler.group.position.set(this.viewer.x + this.forward.x * 2.1 + 0.9, this.viewer.y - 0.35 + Math.sin(t * 0.4) * 0.05, this.viewer.z + this.forward.z * 2.1 + 0.4);
      this.angler.group.rotation.y = Math.atan2(-this.forward.x, -this.forward.z) + Math.PI * 0.6 + Math.sin(t * 0.2) * 0.2;
      const level = 0.5 + 0.35 * Math.sin(t * 1.7) + runtime.stim;
      (this.angler.lure.material as ShaderMaterial).uniforms.uLevel.value = level * anglerPresence;
      this.angler.glow.material.opacity = Math.min(1, level) * anglerPresence;
      for (const m of this.angler.materials) { m.uniforms.uOpacity.value = anglerPresence; m.uniforms.uPhase.value = t * 2.5; }
    }

    // ---- hover highlight: noticed → highlighted before pinch
    let hovered = '';
    for (const entity of this.queries.hovered.entities) { hovered = entity.getValue(Inspectable, 'speciesId') ?? ''; break; }
    runtime.hoveredSpecies = hovered;
    for (const [id, materials] of this.highlight) {
      const target = id === hovered ? 1 : 0;
      const level = (this.highlightLevel.get(id) ?? 0) + (target - (this.highlightLevel.get(id) ?? 0)) * Math.min(1, delta * 8);
      this.highlightLevel.set(id, level);
      for (const m of materials) if (m.uniforms.uHighlight) m.uniforms.uHighlight.value = level;
    }

    const stats = runtime.stats;
    stats.schoolState = f.state; stats.fishCount = f.activeCount; stats.threat = f.threatLevel; stats.scatters = f.scatterCount;
    stats.sharkState = sb.state; stats.sharkDistance = sb.active ? sb.distanceToViewer() : 0;
    stats.encounter = this.scheduler.active ? this.scheduler.active.def.id : 'none';
  }

  private startShark() {
    // Enter from the haze within the viewer's forward arc, never from behind.
    const heading = Math.atan2(this.forward.z, this.forward.x);
    this.sharkBrain.start(heading + (this.scheduler.next() - 0.5) * 1.4);
    this.sharkMinDistance = Infinity;
    runtime.log('encounter', 'shark_pass start');
    runtime.nami.notify('shark', runtime.clock);
  }

  private startTurtle() {
    this.turtleTime = 0;
    this.turtleDir = this.scheduler.next() > 0.5 ? 1 : -1;
    runtime.log('encounter', 'turtle_pass start');
    runtime.nami.notify('turtle', runtime.clock);
  }

  private updateTurtle(dt: number, inOcean: boolean) {
    const g = this.turtle.group;
    if (this.turtleTime < 0 || !inOcean) {
      g.visible = false; setTargetable(this.turtleEntity, false);
      if (this.turtleTime >= 0 && !inOcean) { this.turtleTime = -1; this.scheduler.finish(runtime.director.state.time, 'timeout'); }
      return;
    }
    const duration = 40;
    this.turtleTime += dt;
    const u = this.turtleTime / duration;
    if (u >= 1) { this.turtleTime = -1; g.visible = false; setTargetable(this.turtleEntity, false); this.scheduler.finish(runtime.director.state.time); runtime.log('encounter', 'turtle_pass complete'); return; }
    // Across the forward view, right → left (or reverse), gently rising and falling.
    const side = this.turtleDir * (u * 2 - 1) * 5.5;
    const rightX = -this.forward.z, rightZ = this.forward.x;
    g.position.set(
      this.viewer.x + this.forward.x * 4.2 + rightX * side,
      this.viewer.y - 0.3 + Math.sin(u * Math.PI * 2) * 0.25,
      this.viewer.z + this.forward.z * 4.2 + rightZ * side);
    g.rotation.set(0, Math.atan2(-rightX * this.turtleDir, -rightZ * this.turtleDir), Math.sin(this.turtleTime * 0.6) * 0.05);
    g.visible = true;
    const presence = Math.min(1, u * 8, (1 - u) * 8);
    for (const m of this.turtle.materials) m.uniforms.uOpacity.value = presence;
    setTargetable(this.turtleEntity, presence > 0.6);
    const stroke = Math.sin(this.turtleTime * 1.6);
    for (const pivot of this.turtle.pivots) {
      const { front, side: s } = pivot.userData as { front: boolean; side: number };
      pivot.rotation.z = (front ? 0.55 * stroke : 0.25 * Math.sin(this.turtleTime * 1.6 + 1)) * s;
      pivot.rotation.x = front ? 0.25 * Math.cos(this.turtleTime * 1.6) : 0;
    }
  }

  /** Level, upright orientation facing (fx,fy,fz) with a roll of `bank`; writes a full TRS matrix. */
  private orient(m: Matrix4, px: number, py: number, pz: number, fx: number, fy: number, fz: number, bank: number, scale: number) {
    const z = this.bz.set(fx, fy, fz);
    if (z.lengthSq() < 1e-8) z.set(0, 0, 1); else z.normalize();
    const x = this.bx.crossVectors(this.worldUp, z);
    if (x.lengthSq() < 1e-6) x.set(1, 0, 0); else x.normalize();
    const y = this.by.crossVectors(z, x);
    const c = Math.cos(bank), sn = Math.sin(bank);
    this.rx.copy(x).multiplyScalar(c).addScaledVector(y, sn);
    this.ry.copy(y).multiplyScalar(c).addScaledVector(x, -sn);
    m.makeBasis(this.rx, this.ry, z);
    this.scale.setScalar(scale);
    m.scale(this.scale);
    m.setPosition(px, py, pz);
    return m;
  }

  private writeSchool() {
    const f = this.flock, mesh = this.school.mesh as InstancedMesh, phase = this.school.phase;
    if (f.activeCount === 0 && !mesh.visible) { setTargetable(this.schoolEntity, false); return; }
    const variantAttr = mesh.geometry.getAttribute('aVariant') as InstancedBufferAttribute;
    const variant = variantAttr.array as Float32Array;
    let visible = 0;
    for (let i = 0; i < f.capacity; i++) {
      const presence = f.presence[i];
      const ix = i * 3;
      const size = presence < 0.02 ? 0 : presence * (0.8 + (i % 7) * 0.06) * this.fishScale;
      if (size === 0) continue;
      // Compact visible fish into [0, visible) and draw only those (hidden fish cost nothing).
      this.orient(this.matrix, f.pos[ix], f.pos[ix + 1], f.pos[ix + 2], f.dir[ix], f.dir[ix + 1], f.dir[ix + 2], f.bank[i], size);
      mesh.setMatrixAt(visible, this.matrix);
      (phase.array as Float32Array)[visible] = f.phase[i];
      variant[visible] = (i * 0.6180339) % 1;
      visible++;
    }
    mesh.count = visible;
    mesh.instanceMatrix.needsUpdate = true;
    variantAttr.needsUpdate = true;
    phase.needsUpdate = true;
    mesh.visible = visible > 0;
    // Keep ray picking accurate as the school moves (cheap at this count).
    if (++this.frameCount % 10 === 0) mesh.computeBoundingSphere();
    setTargetable(this.schoolEntity, visible > 3 && runtime.immersion > 0.5);
  }
}
