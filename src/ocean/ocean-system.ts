import {
  CanvasTexture, ConeGeometry, createSystem, type Entity, Mesh, MeshBasicMaterial, Object3D,
  PlaneGeometry, Pressed, RayInteractable, ShaderMaterial, Vector3,
} from '@iwsdk/core';
import { audio } from '../audio/audio-engine.js';
import { runtime } from '../runtime.js';
import { env } from '../visuals/creature-models.js';
import { BANDS } from './ocean-director.js';
import { OceanControl, OceanStatus } from './ocean-components.js';

// Depth Compass layout in canvas pixels (640 × 460 → 0.32 m × 0.23 m).
const PANEL_W = 640, PANEL_H = 460, PANEL_M = 0.32 / PANEL_W;
type Button = { action: string; label: string; x: number; y: number; w: number; h: number };
const row = (y: number, items: Array<[string, string]>): Button[] => items.map(([action, label], i) => ({ action, label, x: 20 + i * 152, y, w: 140, h: 96 }));
const BUTTONS: Button[] = [
  ...row(112, BANDS.map(b => [`depth:${b.preset}`, b.label] as [string, string])),
  ...row(228, [['release', 'Drift'], ['toggle-pause', 'Pause'], ['toggle-reduced', 'Calm'], ['reset', 'Restart']]),
  ...row(344, [['recenter', 'Recenter'], ['text', 'Text size'], ['sound', 'Sound'], ['guide', 'Guide']]),
];
export const PALETTE = { navy: '#071824', sea: '#155B78', cyan: '#77D8DB', violet: '#9D82D4', neutral: '#E9E5DA' };

/**
 * Bridges the pure OceanDirector to the scene: environment uniforms, bounded
 * travel, the spatial Depth Compass, and diagnostics. The camera never moves.
 */
export class OceanSystem extends createSystem({
  status: { required: [OceanStatus] },
  pressedControls: { required: [OceanControl, Pressed] },
}) {
  private director = runtime.director;
  private ocean!: Object3D;
  private frame: Object3D | null = null;
  private materials: ShaderMaterial[] = [];
  private generation = -1;
  private panel!: Mesh;
  private panelCanvas = document.createElement('canvas');
  private panelContext!: CanvasRenderingContext2D;
  private panelTexture!: CanvasTexture;
  private panelDirty = true;
  private panelShown = false;
  private buttonEntities: Entity[] = [];
  private indicator!: Mesh;
  private oceanInstances = 1;
  private rayOrigin = new Vector3();
  private up = new Vector3(0, 1, 0);
  private dir = new Vector3();
  private diagnosticsClock = 0;
  private eventSeq = -1;
  private eventLog = '';
  private diagnostics = document.getElementById('ocean-values');

  init() {
    this.ocean = this.world.requireSceneObject('ocean');
    this.ocean.traverse(object => { if (object.name === 'Ocean travel frame') this.frame = object; });
    this.countOceanInstances();

    this.panelCanvas.width = PANEL_W; this.panelCanvas.height = PANEL_H;
    this.panelContext = this.panelCanvas.getContext('2d')!;
    this.panelTexture = new CanvasTexture(this.panelCanvas);
    const panelMaterial = new MeshBasicMaterial({ map: this.panelTexture, transparent: true, depthWrite: false });
    this.panel = new Mesh(new PlaneGeometry(PANEL_W * PANEL_M, PANEL_H * PANEL_M), panelMaterial);
    this.panel.name = 'Depth compass';
    this.panel.position.set(-0.35, -0.08, 0.15);
    this.panel.rotation.set(-0.15, 0.55, 0);
    this.panel.visible = false;
    this.panel.renderOrder = 40;
    const panelEntity = this.world.createTransformEntity(this.panel, { parent: this.world.requireSceneEntity('experience') });
    // Ray targets only. They must stay renderable: the SDK pointer ignores meshes whose material
    // is invisible, so colour and depth writes are masked instead (near-zero fill cost).
    const hitMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
    const hitGeometry = new PlaneGeometry(1, 1);
    for (const button of BUTTONS) {
      const hit = new Mesh(hitGeometry, hitMaterial);
      hit.name = `Depth control ${button.label}`;
      hit.scale.set(button.w * PANEL_M, button.h * PANEL_M, 1);
      hit.position.set((button.x + button.w / 2 - PANEL_W / 2) * PANEL_M, (PANEL_H / 2 - button.y - button.h / 2) * PANEL_M, 0.002);
      const entity = this.world.createTransformEntity(hit, { parent: panelEntity });
      entity.addComponent(OceanControl, { action: button.action });
      this.buttonEntities.push(entity);
    }

    this.indicator = new Mesh(new ConeGeometry(0.018, 0.06, 16), new MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.55, depthWrite: false }));
    this.indicator.name = 'Travel current indicator';
    this.indicator.visible = false;
    this.world.createTransformEntity(this.indicator);

    const d = this.director;
    Object.assign(runtime.commandHandlers, {
      release: () => d.releaseDepth(),
      'toggle-pause': () => d.setPaused(!d.state.paused),
      pause: () => d.setPaused(true),
      resume: () => d.setPaused(false),
      'toggle-reduced': () => { d.setReducedMotion(!d.state.reducedMotion); runtime.prefs.reducedMotion = d.state.reducedMotion; runtime.savePrefs(); },
      'reduced:on': () => { d.setReducedMotion(true); runtime.prefs.reducedMotion = true; runtime.savePrefs(); },
      'reduced:off': () => { d.setReducedMotion(false); runtime.prefs.reducedMotion = false; runtime.savePrefs(); },
      reset: () => { d.reset(); runtime.travelHand = null; runtime.generation++; this.countOceanInstances(); runtime.log('restart', 'ocean, encounters and reveal reset'); },
      recenter: () => { runtime.requests.recenter = true; runtime.log('comfort', 'recenter'); },
      text: () => { runtime.prefs.textScale = runtime.prefs.textScale > 1.1 ? 1 : 1.3; runtime.savePrefs(); runtime.log('comfort', `text ${runtime.prefs.textScale}`); },
      sound: () => { runtime.prefs.sound = !runtime.prefs.sound; audio.setEnabled(runtime.prefs.sound); runtime.savePrefs(); runtime.log('comfort', `sound ${runtime.prefs.sound ? 'on' : 'off'}`); },
      room: () => { runtime.requests.returnRoom = true; },
    });

    this.cleanupFuncs.push(this.queries.pressedControls.subscribe('qualify', entity => {
      audio.tap();
      this.runCommand(entity.getValue(OceanControl, 'action') ?? '');
    }));

    const debug = document.getElementById('ocean-debug');
    const onDebug = (event: Event) => {
      const action = (event.target as HTMLElement).dataset?.action;
      if (action) this.runCommand(action);
    };
    debug?.addEventListener('click', onDebug);
    this.cleanupFuncs.push(() => {
      debug?.removeEventListener('click', onDebug);
      this.panelTexture.dispose(); panelMaterial.dispose(); hitMaterial.dispose(); hitGeometry.dispose();
      this.panel.geometry.dispose();
      this.indicator.geometry.dispose(); (this.indicator.material as MeshBasicMaterial).dispose();
    });
  }

  private countOceanInstances() {
    let count = 0;
    this.world.scene.traverse(object => { if (object.name === 'Ocean environment') count++; });
    this.oceanInstances = count;
  }

  private runCommand(action: string) {
    if (action.startsWith('depth:')) {
      const value = Number(action.slice(6));
      if (Number.isFinite(value)) this.director.selectDepth(value);
    } else if (!runtime.command(action)) return;
    this.panelDirty = true;
    this.diagnosticsClock = 1;
  }

  private collectMaterials() {
    this.materials.length = 0;
    this.ocean.traverse(object => {
      const material = (object as Mesh).material;
      if (material instanceof ShaderMaterial && !this.materials.includes(material)) this.materials.push(material);
    });
  }

  private setPanelShown(shown: boolean) {
    if (shown === this.panelShown) return;
    this.panelShown = shown;
    this.panel.visible = shown;
    this.panelDirty = true;
    for (const entity of this.buttonEntities) {
      if (shown && !entity.hasComponent(RayInteractable)) entity.addComponent(RayInteractable);
      if (!shown && entity.hasComponent(RayInteractable)) entity.removeComponent(RayInteractable);
    }
  }

  update(delta: number) {
    if (runtime.generation !== this.generation) {
      // New XR session or restart: the director was reset by whoever bumped the generation.
      this.generation = runtime.generation;
      this.panelDirty = true;
    }
    if (this.materials.length === 0) this.collectMaterials();
    this.setPanelShown(runtime.destination === 'ocean' || runtime.immersion > 0);
    this.panel.scale.setScalar(runtime.prefs.textScale);

    for (const entity of this.queries.status.entities) {
      const command = entity.getValue(OceanStatus, 'command');
      if (command) { entity.setValue(OceanStatus, 'command', ''); this.runCommand(command); }
    }

    // Bounded hand-directed travel owned by GestureSystem's arbiter.
    const s = this.director.state;
    const hand = runtime.travelHand;
    if (hand) {
      this.director.travel(runtime.travelDir.x, runtime.travelDir.z, delta);
      this.player.raySpaces[hand].getWorldPosition(this.rayOrigin);
      this.dir.set(runtime.travelDir.x, runtime.travelDir.y, runtime.travelDir.z);
      this.indicator.position.copy(this.rayOrigin).addScaledVector(this.dir, 0.35);
      this.indicator.quaternion.setFromUnitVectors(this.up, this.dir);
    }
    this.indicator.visible = hand !== null;
    const owners = runtime.pinchOwner;
    this.director.setMode(hand ? 'travel' : owners.left === 'target' || owners.right === 'target' ? 'menu' : 'world');

    const before = s.band;
    this.director.update(delta);
    if (before !== s.band) { this.panelDirty = true; runtime.log('band', s.band); runtime.nami.notify(s.band, runtime.clock); }
    this.applyToScene();
    this.writeStatus();

    this.diagnosticsClock += delta;
    if (this.diagnosticsClock >= 0.25) {
      this.diagnosticsClock = 0;
      this.panelDirty = this.panelDirty || this.panelShown;
      this.refreshDiagnostics();
    }
    if (this.panelDirty && this.panelShown) { this.drawPanel(); this.panelDirty = false; }
  }

  private applyToScene() {
    const s = this.director.state;
    for (const material of this.materials) {
      const u = material.uniforms;
      if (u.uTime) u.uTime.value = s.time;
      if (u.uShallow) u.uShallow.value.setRGB(s.waterShallow[0], s.waterShallow[1], s.waterShallow[2]);
      if (u.uBlue) u.uBlue.value.setRGB(s.waterBlue[0], s.waterBlue[1], s.waterBlue[2]);
      if (u.uDeep) u.uDeep.value.setRGB(s.waterDeep[0], s.waterDeep[1], s.waterDeep[2]);
      if (u.uLight) u.uLight.value = s.ambientLight;
      if (u.uFog) u.uFog.value = s.fogDensity;
      if (u.uGlow) u.uGlow.value = s.bioluminescence;
      if (u.uDrift) u.uDrift.value.set(s.drift[0], s.drift[1], s.drift[2]);
      if (u.uTravel) u.uTravel.value.set(s.travel[0], 0, s.travel[1]);
    }
    this.frame?.position.set(-s.travel[0], 0, -s.travel[1]);
    // Shared creature environment: in the room (passthrough) creatures are lit normally and unfogged.
    const k = runtime.immersion;
    env.uTime.value = s.time;
    env.uLight.value = 1 + (s.ambientLight - 1) * k;
    env.uFog.value = s.fogDensity;
    env.uFogAmount.value = k;
    env.uGlow.value = s.bioluminescence * k;
    env.uFogColor.value.setRGB(
      s.waterBlue[0] * 0.75 + s.waterDeep[0] * 0.25, s.waterBlue[1] * 0.75 + s.waterDeep[1] * 0.25, s.waterBlue[2] * 0.75 + s.waterDeep[2] * 0.25);
  }

  private writeStatus() {
    const s = this.director.state;
    const last = this.director.lastEvent;
    for (const entity of this.queries.status.entities) {
      entity.setValue(OceanStatus, 'depth', s.depth);
      entity.setValue(OceanStatus, 'targetDepth', s.targetDepth);
      entity.setValue(OceanStatus, 'band', s.band);
      entity.setValue(OceanStatus, 'depthLocked', s.depthLocked);
      entity.setValue(OceanStatus, 'paused', s.paused);
      entity.setValue(OceanStatus, 'reducedMotion', s.reducedMotion);
      entity.setValue(OceanStatus, 'ambientLight', s.ambientLight);
      entity.setValue(OceanStatus, 'interactionMode', s.interactionMode);
      entity.setValue(OceanStatus, 'travelX', s.travel[0]);
      entity.setValue(OceanStatus, 'travelZ', s.travel[1]);
      entity.setValue(OceanStatus, 'oceanInstances', this.oceanInstances);
      entity.setValue(OceanStatus, 'panelVisible', this.panelShown);
      if (last) entity.setValue(OceanStatus, 'lastEvent', `${last.type}: ${last.detail}`);
      const r = runtime.stats;
      entity.setValue(OceanStatus, 'gesture', r.gesture);
      entity.setValue(OceanStatus, 'handFeatures', r.handFeatures);
      entity.setValue(OceanStatus, 'discoveries', runtime.discovered.size);
      entity.setValue(OceanStatus, 'pulses', r.pulses);
      entity.setValue(OceanStatus, 'revealState', r.revealState);
      entity.setValue(OceanStatus, 'sharkState', r.sharkState);
      entity.setValue(OceanStatus, 'schoolState', r.schoolState);
      entity.setValue(OceanStatus, 'encounter', r.encounter);
      entity.setValue(OceanStatus, 'namiLine', runtime.nami.current?.id ?? '');
      entity.setValue(OceanStatus, 'sweeps', r.sweeps);
      entity.setValue(OceanStatus, 'scatters', r.scatters);
      entity.setValue(OceanStatus, 'hovered', runtime.hoveredSpecies);
      if (runtime.eventSeq !== this.eventSeq) { this.eventSeq = runtime.eventSeq; this.eventLog = runtime.events.slice(-6).join(' | '); }
      entity.setValue(OceanStatus, 'eventLog', this.eventLog);
      entity.setValue(OceanStatus, 'sharkMinDistance', Number.isFinite(r.sharkMinDistance) ? r.sharkMinDistance : 0);
    }
  }

  private bandLabel(id: string) { return BANDS.find(b => b.id === id)?.label ?? id; }

  private drawPanel() {
    const s = this.director.state;
    const ctx = this.panelContext;
    ctx.clearRect(0, 0, PANEL_W, PANEL_H);
    ctx.fillStyle = 'rgba(7,24,36,0.82)';
    ctx.beginPath(); ctx.roundRect(0, 0, PANEL_W, PANEL_H, 24); ctx.fill();
    ctx.fillStyle = PALETTE.cyan; ctx.font = '600 22px Manrope, system-ui, sans-serif';
    ctx.fillText('DEPTH COMPASS', 26, 44);
    ctx.fillStyle = PALETTE.neutral; ctx.font = '28px Manrope, system-ui, sans-serif';
    const lock = s.depthLocked ? 'held' : 'drifting';
    ctx.fillText(`${this.bandLabel(s.band)} · ${s.depth.toFixed(2)} → ${s.targetDepth.toFixed(2)} ${lock}`, 26, 86);
    ctx.fillStyle = 'rgba(119,216,219,0.25)'; ctx.fillRect(26, 98, PANEL_W - 52, 3);
    ctx.fillStyle = PALETTE.cyan; ctx.fillRect(26, 98, (PANEL_W - 52) * s.depth, 3);
    for (const button of BUTTONS) {
      const selected = (button.action.startsWith('depth:') && s.depthLocked && Math.abs(Number(button.action.slice(6)) - s.targetDepth) < 1e-3)
        || (button.action === 'release' && !s.depthLocked)
        || (button.action === 'toggle-pause' && s.paused)
        || (button.action === 'toggle-reduced' && s.reducedMotion)
        || (button.action === 'text' && runtime.prefs.textScale > 1.1)
        || (button.action === 'sound' && runtime.prefs.sound)
        || (button.action === 'guide' && runtime.prefs.guide);
      ctx.fillStyle = selected ? PALETTE.sea : 'rgba(21,91,120,0.28)';
      ctx.strokeStyle = selected ? PALETTE.cyan : 'rgba(119,216,219,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(button.x, button.y, button.w, button.h, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = PALETTE.neutral; ctx.font = '600 25px Manrope, system-ui, sans-serif';
      ctx.textAlign = 'center';
      const label = button.action === 'toggle-pause' && s.paused ? 'Resume' : button.label;
      ctx.fillText(label, button.x + button.w / 2, button.y + button.h / 2 + 9);
      ctx.textAlign = 'start';
    }
    this.panelTexture.needsUpdate = true;
  }

  private refreshDiagnostics() {
    if (!this.diagnostics) return;
    const s = this.director.state;
    const r = runtime.stats;
    const last = this.director.lastEvent;
    this.diagnostics.textContent = [
      `Depth: ${s.depth.toFixed(3)} → ${s.targetDepth.toFixed(3)} (${s.depthLocked ? 'user locked' : 'auto'}) · ${this.bandLabel(s.band)}`,
      `Light ${s.ambientLight.toFixed(2)} · vis ${s.visibility.toFixed(2)} · mode ${s.interactionMode}${s.paused ? ' · PAUSED' : ''}${s.reducedMotion ? ' · calm' : ''}`,
      `Travel ${s.travel[0].toFixed(2)}, ${s.travel[1].toFixed(2)} m · oceans ${this.oceanInstances} · ${runtime.showcase ? 'showcase seed 42' : 'explore'}`,
      `Gesture: ${r.gesture} · ${r.handSpeed.toFixed(2)} m/s`,
      `School: ${r.schoolState} · ${r.fishCount} fish · threat ${r.threat.toFixed(2)}`,
      `Encounter: ${r.encounter} · shark ${r.sharkState} ${r.sharkDistance ? r.sharkDistance.toFixed(1) + ' m' : ''}`,
      `Pulses ${r.pulses} · responses ${r.organismResponses} · reveal ${r.revealState}`,
      `Discovered ${runtime.discovered.size}/6 · NAMI: ${runtime.nami.lastEvent}`,
      `Ocean event: ${last ? `${last.type} ${last.detail}` : 'none'}`,
      ...runtime.events.slice(-4),
    ].join('\n');
  }
}
