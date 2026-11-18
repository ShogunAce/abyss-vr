import {
  CanvasTexture, Color, ConeGeometry, createSystem, type Entity, Mesh, MeshBasicMaterial, Object3D,
  PlaneGeometry, Pressed, RayInteractable, ShaderMaterial, Vector3,
} from '@iwsdk/core';
import { AbyssSphere } from '../abyss-component.js';
import { BANDS, OceanDirector } from './ocean-director.js';
import { OceanControl, OceanStatus } from './ocean-components.js';

type Hand = 'left' | 'right';
const HANDS: Hand[] = ['left', 'right'];

// Depth panel layout in canvas pixels (640 × 360 → 0.32 m × 0.18 m).
const PANEL_W = 640, PANEL_H = 360, PANEL_M = 0.32 / PANEL_W;
type Button = { action: string; label: string; x: number; y: number; w: number; h: number };
const BUTTONS: Button[] = [
  ...BANDS.map((band, i) => ({ action: `depth:${band.preset}`, label: band.label, x: 20 + i * 152, y: 112, w: 140, h: 96 })),
  { action: 'release', label: 'Drift', x: 20, y: 228, w: 140, h: 96 },
  { action: 'toggle-pause', label: 'Pause', x: 172, y: 228, w: 140, h: 96 },
  { action: 'toggle-reduced', label: 'Calm', x: 324, y: 228, w: 140, h: 96 },
  { action: 'reset', label: 'Reset', x: 476, y: 228, w: 140, h: 96 },
];
const PALETTE = { navy: '#071824', sea: '#155B78', cyan: '#77D8DB', violet: '#9D82D4', neutral: '#E9E5DA' };

/**
 * Bridges the pure OceanDirector to the scene: environment uniforms, bounded
 * travel, the spatial depth panel, gesture arbitration, and diagnostics.
 * The camera is never moved; only scenery offsets change.
 */
export class OceanSystem extends createSystem({
  status: { required: [OceanStatus] },
  spheres: { required: [AbyssSphere] },
  pressedControls: { required: [OceanControl, Pressed] },
}) {
  private director = new OceanDirector(42);
  private ocean!: Object3D;
  private frame: Object3D | null = null;
  private materials: ShaderMaterial[] = [];
  private session: XRSession | null = null;
  private panel!: Mesh;
  private panelEntity!: Entity;
  private panelCanvas = document.createElement('canvas');
  private panelContext!: CanvasRenderingContext2D;
  private panelTexture!: CanvasTexture;
  private panelDirty = true;
  private panelShown = false;
  private buttonEntities: Entity[] = [];
  private indicator!: Mesh;
  private travelHand: Hand | null = null;
  private menuHands = { left: false, right: false };
  private immersion = 0;
  private oceanInstances = 1;
  private shallow = new Color();
  private blue = new Color();
  private deep = new Color();
  private rayOrigin = new Vector3();
  private rayDirection = new Vector3();
  private up = new Vector3(0, 1, 0);
  private diagnosticsClock = 0;
  private diagnostics = document.getElementById('ocean-values');

  init() {
    this.ocean = this.world.requireSceneObject('ocean');
    this.ocean.traverse(object => { if (object.name === 'Ocean travel frame') this.frame = object; });
    this.countOceanInstances();

    // Spatial depth panel, left of the sphere, angled toward the seated viewer.
    this.panelCanvas.width = PANEL_W; this.panelCanvas.height = PANEL_H;
    this.panelContext = this.panelCanvas.getContext('2d')!;
    this.panelTexture = new CanvasTexture(this.panelCanvas);
    const panelMaterial = new MeshBasicMaterial({ map: this.panelTexture, transparent: true, depthWrite: false });
    this.panel = new Mesh(new PlaneGeometry(PANEL_W * PANEL_M, PANEL_H * PANEL_M), panelMaterial);
    this.panel.name = 'Depth compass';
    this.panel.position.set(-0.34, -0.06, 0.14);
    this.panel.rotation.set(-0.12, 0.55, 0);
    this.panel.visible = false;
    this.panelEntity = this.world.createTransformEntity(this.panel, { parent: this.world.requireSceneEntity('experience') });
    const hitMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
    const hitGeometry = new PlaneGeometry(1, 1);
    for (const button of BUTTONS) {
      const hit = new Mesh(hitGeometry, hitMaterial);
      hit.name = `Depth control ${button.label}`;
      hit.scale.set(button.w * PANEL_M, button.h * PANEL_M, 1);
      hit.position.set((button.x + button.w / 2 - PANEL_W / 2) * PANEL_M, (PANEL_H / 2 - button.y - button.h / 2) * PANEL_M, 0.002);
      const entity = this.world.createTransformEntity(hit, { parent: this.panelEntity });
      entity.addComponent(OceanControl, { action: button.action });
      this.buttonEntities.push(entity);
    }

    // Current indicator: a small translucent cone along the pointing ray while travelling.
    this.indicator = new Mesh(new ConeGeometry(0.018, 0.06, 16), new MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.55, depthWrite: false }));
    this.indicator.name = 'Travel current indicator';
    this.indicator.visible = false;
    this.world.createTransformEntity(this.indicator);

    this.cleanupFuncs.push(this.queries.pressedControls.subscribe('qualify', entity => {
      this.runCommand(entity.getValue(OceanControl, 'action') ?? '');
    }));

    // Desktop debug controls (spec: test depths 0, 0.35, 0.65, 1 and reset).
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
    const d = this.director;
    if (action.startsWith('depth:')) {
      const value = Number(action.slice(6));
      if (Number.isFinite(value)) d.selectDepth(value);
    } else if (action === 'release') d.releaseDepth();
    else if (action === 'toggle-pause') d.setPaused(!d.state.paused);
    else if (action === 'pause') d.setPaused(true);
    else if (action === 'resume') d.setPaused(false);
    else if (action === 'toggle-reduced') d.setReducedMotion(!d.state.reducedMotion);
    else if (action === 'reduced:on') d.setReducedMotion(true);
    else if (action === 'reduced:off') d.setReducedMotion(false);
    else if (action === 'reset') { d.reset(); this.travelHand = null; this.countOceanInstances(); }
    else return;
    this.panelDirty = true;
    this.diagnosticsClock = 1;
  }

  private collectMaterials() {
    // AbyssSystem swaps in runtime material copies during its init; use whatever is live now.
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
    // Hidden controls must not catch rays.
    for (const entity of this.buttonEntities) {
      if (shown && !entity.hasComponent(RayInteractable)) entity.addComponent(RayInteractable);
      if (!shown && entity.hasComponent(RayInteractable)) entity.removeComponent(RayInteractable);
    }
  }

  /**
   * Gesture arbitration for pinches that start this frame:
   * menu/targets (ray already on an interactable) win; otherwise, once fully
   * immersed and unpaused, the pinch becomes travel until it is released.
   */
  private updateGestures(delta: number) {
    const xr = this.input.xr;
    const immersed = this.session !== null && this.immersion >= 0.999;
    for (const hand of HANDS) {
      const select = xr.getSelectState(hand);
      if (select.start) {
        if (xr.multiPointers[hand].getRayBusy()) this.menuHands[hand] = true;
        else if (immersed && !this.director.state.paused && this.travelHand === null) this.travelHand = hand;
      }
      if (!select.active) {
        this.menuHands[hand] = false;
        if (this.travelHand === hand) this.travelHand = null;
      }
    }
    if (this.travelHand && (!immersed || !xr.getPrimaryInputSource(this.travelHand))) this.travelHand = null;

    let mode: 'world' | 'travel' | 'menu' = 'world';
    if (this.menuHands.left || this.menuHands.right) mode = 'menu';
    if (this.travelHand) {
      mode = 'travel';
      const space = this.player.raySpaces[this.travelHand];
      space.getWorldPosition(this.rayOrigin);
      space.getWorldDirection(this.rayDirection).negate(); // target rays point down -Z
      this.director.travel(this.rayDirection.x, this.rayDirection.z, delta);
      this.indicator.position.copy(this.rayOrigin).addScaledVector(this.rayDirection, 0.35);
      this.indicator.quaternion.setFromUnitVectors(this.up, this.rayDirection);
    }
    this.indicator.visible = this.travelHand !== null;
    this.director.setMode(mode);
  }

  update(delta: number) {
    const active = this.world.renderer.xr.getSession() ?? null;
    if (active !== this.session) {
      // Every XR session starts in the default sunlit ocean.
      this.session = active;
      this.director.reset();
      this.travelHand = null;
      this.menuHands.left = this.menuHands.right = false;
      this.panelDirty = true;
    }
    if (this.materials.length === 0) this.collectMaterials();

    let destination = 'room';
    for (const entity of this.queries.spheres.entities) {
      this.immersion = entity.getValue(AbyssSphere, 'immersion') ?? 0;
      destination = entity.getValue(AbyssSphere, 'destination') ?? 'room';
    }
    // The depth panel is offered once the ocean is the chosen destination.
    this.setPanelShown(destination === 'ocean' || this.immersion > 0);

    for (const entity of this.queries.status.entities) {
      const command = entity.getValue(OceanStatus, 'command');
      if (command) { entity.setValue(OceanStatus, 'command', ''); this.runCommand(command); }
    }

    this.updateGestures(delta);
    const before = this.director.state.band;
    this.director.update(delta);
    if (before !== this.director.state.band) this.panelDirty = true;
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
    this.shallow.setRGB(s.waterShallow[0], s.waterShallow[1], s.waterShallow[2]);
    this.blue.setRGB(s.waterBlue[0], s.waterBlue[1], s.waterBlue[2]);
    this.deep.setRGB(s.waterDeep[0], s.waterDeep[1], s.waterDeep[2]);
    for (const material of this.materials) {
      const u = material.uniforms;
      if (u.uTime) u.uTime.value = s.time;
      if (u.uShallow) (u.uShallow.value as Color).copy(this.shallow);
      if (u.uBlue) (u.uBlue.value as Color).copy(this.blue);
      if (u.uDeep) (u.uDeep.value as Color).copy(this.deep);
      if (u.uLight) u.uLight.value = s.ambientLight;
      if (u.uFog) u.uFog.value = s.fogDensity;
      if (u.uGlow) u.uGlow.value = s.bioluminescence;
      if (u.uDrift) (u.uDrift.value as Vector3).set(s.drift[0], s.drift[1], s.drift[2]);
      if (u.uTravel) (u.uTravel.value as Vector3).set(s.travel[0], 0, s.travel[1]);
    }
    this.frame?.position.set(-s.travel[0], 0, -s.travel[1]);
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
    // Depth gauge along the top edge.
    ctx.fillStyle = 'rgba(119,216,219,0.25)'; ctx.fillRect(26, 98, PANEL_W - 52, 3);
    ctx.fillStyle = PALETTE.cyan; ctx.fillRect(26, 98, (PANEL_W - 52) * s.depth, 3);
    for (const button of BUTTONS) {
      const selected = (button.action.startsWith('depth:') && s.depthLocked && Math.abs(Number(button.action.slice(6)) - s.targetDepth) < 1e-3)
        || (button.action === 'release' && !s.depthLocked)
        || (button.action === 'toggle-pause' && s.paused)
        || (button.action === 'toggle-reduced' && s.reducedMotion);
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
    const last = this.director.lastEvent;
    this.diagnostics.textContent = [
      `Depth: ${s.depth.toFixed(3)} → ${s.targetDepth.toFixed(3)} (${s.depthLocked ? 'user locked' : 'auto'})`,
      `Band: ${this.bandLabel(s.band)} · light ${s.ambientLight.toFixed(2)} · vis ${s.visibility.toFixed(2)}`,
      `Mode: ${s.interactionMode}${s.paused ? ' · PAUSED' : ''}${s.reducedMotion ? ' · calm' : ''}`,
      `Travel: ${s.travel[0].toFixed(2)}, ${s.travel[1].toFixed(2)} m · ocean instances ${this.oceanInstances}`,
      `Ocean event: ${last ? `${last.type} ${last.detail}` : 'none'}`,
    ].join('\n');
  }
}
