import {
  AdditiveBlending, CylinderGeometry, createSystem, Group, Mesh, MeshBasicMaterial, type Object3D,
  OctahedronGeometry, ShaderMaterial, type Sprite, Vector3,
} from '@iwsdk/core';
import { audio } from '../audio/audio-engine.js';
import { MARKER_REACH, MARKERS } from '../data/markers.js';
import { runtime } from '../runtime.js';
import { createGlow } from '../visuals/creature-models.js';

const BAND_COLOR: Record<string, [number, number, number]> = {
  sunlit: [1.0, 0.86, 0.45], openBlue: [0.45, 0.85, 1.0], twilight: [0.66, 0.55, 1.0], midnight: [0.4, 1.0, 0.85],
};

type Beacon = { group: Group; crystal: Mesh; column: Mesh; glow: Sprite; fade: number; pop: number };

/**
 * Exploration: a glowing dive marker beacon stands in each depth zone. Swim to one
 * (point sign) and it logs itself and opens a card about the real ocean at that depth.
 * Beacons are positioned in the ocean's travel frame, so they come closer as you swim.
 */
export class ExploreSystem extends createSystem({}) {
  private ocean!: Object3D;
  private beacons: Beacon[] = [];
  private head = new Vector3();
  private local = new Vector3();
  private reached = new Set<string>();
  private generation = -1;
  private columnMaterial!: ShaderMaterial;
  private crystalGeometry = new OctahedronGeometry(0.075, 0);
  private columnGeometry = new CylinderGeometry(0.035, 0.08, 7, 10, 1, true);
  private hintClock = 0;

  init() {
    this.ocean = this.world.requireSceneObject('ocean');
    const oceanEntity = this.world.requireSceneEntity('ocean');
    this.columnGeometry.translate(0, 2.0, 0);
    this.columnMaterial = new ShaderMaterial({
      uniforms: { uColor: { value: new Vector3() } },
      transparent: true, depthWrite: false, blending: AdditiveBlending,
      vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying float vY; void main(){ float a = smoothstep(-1.5, -0.2, vY) * (1.0 - smoothstep(0.5, 5.5, vY)); gl_FragColor = vec4(vec3(0.6,0.95,1.0) * a * 0.28, 1.0); }',
    });
    for (const marker of MARKERS) {
      const color = BAND_COLOR[marker.band];
      const group = new Group(); group.name = `Dive marker ${marker.title}`; group.visible = false;
      const crystal = new Mesh(this.crystalGeometry, new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false }));
      (crystal.material as MeshBasicMaterial).color.setRGB(color[0], color[1], color[2]);
      const column = new Mesh(this.columnGeometry, this.columnMaterial);
      column.raycast = () => {}; crystal.raycast = () => {};
      const glow = createGlow(color, 0.55);
      group.add(column, crystal, glow);
      this.world.createTransformEntity(group, { parent: oceanEntity });
      this.beacons.push({ group, crystal, column, glow, fade: 0, pop: 0 });
    }
    this.cleanupFuncs.push(() => {
      this.crystalGeometry.dispose(); this.columnGeometry.dispose(); this.columnMaterial.dispose();
      for (const b of this.beacons) { (b.crystal.material as MeshBasicMaterial).dispose(); b.glow.material.dispose(); }
    });
  }

  update(delta: number) {
    if (runtime.generation !== this.generation) { this.generation = runtime.generation; this.reached.clear(); }
    const s = runtime.director.state;
    const t = runtime.clock;
    const inOcean = runtime.immersion > 0.5;
    this.player.head.getWorldPosition(this.head);
    this.local.copy(this.head); this.ocean.worldToLocal(this.local);
    let nearest = Infinity;
    for (let i = 0; i < MARKERS.length; i++) {
      const m = MARKERS[i], b = this.beacons[i];
      const show = inOcean && m.band === s.band;
      b.fade += ((show ? 1 : 0) - b.fade) * Math.min(1, delta * 2);
      b.group.visible = b.fade > 0.01;
      if (!b.group.visible) continue;
      const x = m.x - s.travel[0], z = m.z - s.travel[1];
      b.group.position.set(x, m.y + Math.sin(t * 0.9 + i) * 0.04, z);
      const found = runtime.markers.has(m.id);
      const distance = Math.hypot(x - this.local.x, z - this.local.z);
      if (show && !found) nearest = Math.min(nearest, distance);
      if (show && distance < MARKER_REACH && !this.reached.has(m.id)) {
        this.reached.add(m.id);
        const fresh = runtime.reachMarker(m.id);
        b.pop = 1;
        audio.chime();
        runtime.nami.notify('marker', t, `${fresh ? 'Dive marker logged' : 'Marker revisited'}: ${m.title}. ${runtime.markers.size} of ${MARKERS.length} found.`);
      }
      b.pop = Math.max(0, b.pop - delta * 1.5);
      const scale = (found ? 0.6 : 1 + Math.sin(t * 2.4 + i) * 0.08) + b.pop * 1.4;
      b.crystal.scale.setScalar(scale);
      b.crystal.rotation.y = t * 0.8 + i;
      (b.crystal.material as MeshBasicMaterial).opacity = b.fade * (found ? 0.45 : 1);
      b.glow.material.opacity = b.fade * (found ? 0.25 : 0.85 + b.pop * 0.5);
      b.column.visible = !found;
    }
    this.columnMaterial.uniforms.uColor.value.set(1, 1, 1);
    // A gentle hint when a marker is waiting in this zone and nobody is swimming.
    this.hintClock += delta;
    if (this.hintClock > 2 && nearest < Infinity && runtime.travelHand === null && runtime.immersion >= 0.999) {
      this.hintClock = 0;
      runtime.nami.notify('markerHint', t);
    }
  }
}
