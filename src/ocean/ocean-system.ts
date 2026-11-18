import {
  CanvasTexture, ConeGeometry, createSystem, type Entity, Mesh, MeshBasicMaterial, Object3D,
  PlaneGeometry, Pressed, RayInteractable, ShaderMaterial, Vector3,
} from '@iwsdk/core';
import { audio } from '../audio/audio-engine.js';
import { MARKERS } from '../data/markers.js';
import { SPECIES } from '../data/species.js';
import { HAND_SIGNS } from '../sim/gesture.js';
import { registerDraggable } from '../systems/drag-system.js';
import { runtime } from '../runtime.js';
import { env } from '../visuals/creature-models.js';
import { BANDS } from './ocean-director.js';
import { OceanControl, OceanStatus } from './ocean-components.js';

// Dive menu layout in canvas pixels (640 × 620 → 0.32 m × 0.31 m).
const PANEL_W = 640, PANEL_H = 620, PANEL_M = 0.32 / PANEL_W;
type Page = 'controls' | 'signs' | 'journal';
type Button = { action: string; label: string; x: number; y: number; w: number; h: number; page: Page | 'all' };
const row = (y: number, items: Array<[string, string]>): Button[] => items.map(([action, label], i) => ({ action, label, x: 20 + i * 152, y, w: 140, h: 92, page: 'controls' as const }));
const BUTTONS: Button[] = [
  // Grab bar (pinch and move the whole menu) and hide button.
  { action: 'drag:menu', label: '', x: 0, y: 0, w: 548, h: 58, page: 'all' },
  { action: 'menu', label: '×', x: 568, y: 8, w: 60, h: 44, page: 'all' },
  { action: 'page:controls', label: 'Dive', x: 20, y: 66, w: 192, h: 50, page: 'all' },
  { action: 'page:signs', label: 'Hand signs', x: 224, y: 66, w: 192, h: 50, page: 'all' },
  { action: 'page:journal', label: 'Map & journal', x: 428, y: 66, w: 192, h: 50, page: 'all' },
  ...row(176, BANDS.map(b => [`depth:${b.preset}`, b.label] as [string, string])),
  ...row(282, [['release', 'Drift'], ['toggle-pause', 'Pause'], ['toggle-reduced', 'Calm'], ['reset', 'Restart']]),
  ...row(388, [['recenter', 'Recenter'], ['text', 'Text size'], ['sound', 'Sound'], ['guide', 'Guide']]),
  { action: 'music', label: 'Music', x: 20, y: 494, w: 192, h: 70, page: 'controls' },
  { action: 'reset-layout', label: 'Reset layout', x: 224, y: 494, w: 192, h: 70, page: 'controls' },
  { action: 'clear-discoveries', label: 'New expedition', x: 428, y: 494, w: 192, h: 70, page: 'controls' },
];
/** Which zone each species lives in (for the journal's hints). */
const SPECIES_ZONE: Record<string, string> = {
  'blue-green-chromis': 'Sunlit', 'green-sea-turtle': 'Sunlit', 'grey-reef-shark': 'Open blue',
  'moon-jelly': 'Twilight', anglerfish: 'Midnight', 'giant-squid': 'Midnight',
};
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
  private page: Page = 'controls';
  private pill!: Mesh;
  private pillEntity!: Entity;
  private pillShown = false;
  private headWorld = new Vector3();
  private headLocal = new Vector3();
  private look = new Vector3();
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
    this.panel.name = 'Dive menu';
    this.panel.position.set(-0.36, -0.1, 0.15);
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
    registerDraggable('menu', this.panel);

    // When the menu is hidden, a small "Menu" tab stays where it was (a fist works too).
    const pillCanvas = document.createElement('canvas'); pillCanvas.width = 256; pillCanvas.height = 96;
    const pc = pillCanvas.getContext('2d')!;
    pc.fillStyle = 'rgba(7,24,36,0.85)'; pc.beginPath(); pc.roundRect(2, 2, 252, 92, 46); pc.fill();
    pc.strokeStyle = PALETTE.cyan; pc.lineWidth = 3; pc.stroke();
    pc.fillStyle = PALETTE.neutral; pc.font = '600 40px Manrope, system-ui, sans-serif'; pc.textAlign = 'center'; pc.fillText('\u270A  Menu', 128, 62);
    const pillTexture = new CanvasTexture(pillCanvas);
    this.pill = new Mesh(new PlaneGeometry(0.1, 0.0375), new MeshBasicMaterial({ map: pillTexture, transparent: true, depthWrite: false }));
    this.pill.name = 'Menu tab'; this.pill.visible = false; this.pill.renderOrder = 40;
    this.pillEntity = this.world.createTransformEntity(this.pill, { parent: this.world.requireSceneEntity('experience') });
    this.pillEntity.addComponent(OceanControl, { action: 'menu' });
    this.cleanupFuncs.push(() => { pillTexture.dispose(); this.pill.geometry.dispose(); (this.pill.material as MeshBasicMaterial).dispose(); });

    this.indicator = new Mesh(new ConeGeometry(0.018, 0.06, 16), new MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.55, depthWrite: false }));
    this.indicator.name = 'Travel current indicator';
    this.indicator.visible = false;
    this.world.createTransformEntity(this.indicator);

    audio.setMusic(runtime.prefs.music);
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
      music: () => { runtime.prefs.music = !runtime.prefs.music; audio.setMusic(runtime.prefs.music); runtime.savePrefs(); runtime.log('comfort', `music ${runtime.prefs.music ? 'on' : 'off'}`); },
      sound: () => { runtime.prefs.sound = !runtime.prefs.sound; audio.setEnabled(runtime.prefs.sound); runtime.savePrefs(); runtime.log('comfort', `sound ${runtime.prefs.sound ? 'on' : 'off'}`); },
      room: () => { runtime.requests.returnRoom = true; },
      menu: () => {
        runtime.prefs.menu = !runtime.prefs.menu; runtime.savePrefs();
        runtime.log('comfort', `menu ${runtime.prefs.menu ? 'shown' : 'hidden'}`);
        if (!runtime.prefs.menu) runtime.nami.notify('menu', runtime.clock);
      },
      'page:controls': () => { this.page = 'controls'; this.syncButtons(); },
      'page:signs': () => { this.page = 'signs'; this.syncButtons(); },
      'page:journal': () => { this.page = 'journal'; this.syncButtons(); },
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
    this.syncButtons();
  }

  /** Only the shown page's buttons take rays. */
  private syncButtons() {
    this.panelDirty = true;
    for (let i = 0; i < BUTTONS.length; i++) {
      const entity = this.buttonEntities[i], page = BUTTONS[i].page;
      const on = this.panelShown && (page === 'all' || page === this.page);
      if (on && !entity.hasComponent(RayInteractable)) entity.addComponent(RayInteractable);
      if (!on && entity.hasComponent(RayInteractable)) entity.removeComponent(RayInteractable);
    }
  }

  private setPillShown(shown: boolean) {
    if (shown && !this.pillShown) {
      // Park the tab at the top of where the menu was, facing the same way.
      this.pill.position.copy(this.panel.position); this.pill.quaternion.copy(this.panel.quaternion);
      this.pill.translateY(PANEL_H * PANEL_M * 0.5 - 0.02);
    }
    if (shown === this.pillShown) return;
    this.pillShown = shown;
    this.pill.visible = shown;
    if (shown && !this.pillEntity.hasComponent(RayInteractable)) this.pillEntity.addComponent(RayInteractable);
    if (!shown && this.pillEntity.hasComponent(RayInteractable)) this.pillEntity.removeComponent(RayInteractable);
  }

  update(delta: number) {
    if (runtime.generation !== this.generation) {
      // New XR session or restart: the director was reset by whoever bumped the generation.
      this.generation = runtime.generation;
      this.panelDirty = true;
    }
    if (this.materials.length === 0) this.collectMaterials();
    const oceanUi = runtime.destination === 'ocean' || runtime.immersion > 0;
    this.setPanelShown(oceanUi && runtime.prefs.menu);
    this.setPillShown(oceanUi && !runtime.prefs.menu);
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
      const g = runtime.hands[hand];
      this.rayOrigin.set(g.x, g.y, g.z);
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
    if (this.panelDirty && this.panelShown) {
      if (this.page === 'journal') {
        this.player.head.getWorldPosition(this.headWorld);
        this.headLocal.copy(this.headWorld); this.ocean.worldToLocal(this.headLocal);
        this.player.head.getWorldDirection(this.look).negate();
      }
      this.drawPanel(); this.panelDirty = false;
    }
  }

  private oceanWorld = new Vector3();
  private applyToScene() {
    const s = this.director.state;
    this.ocean.getWorldPosition(this.oceanWorld);
    const hl = runtime.hands.left, hr = runtime.hands.right;
    const wake = (g: typeof hl) => (g.ready && runtime.immersion > 0.5 ? Math.min(1, 0.25 + g.speed * 1.6) : 0);
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
      if (u.uHandA) {
        const o = this.oceanWorld;
        u.uHandA.value.set(hl.x - o.x, hl.y - o.y, hl.z - o.z, wake(hl)); u.uHandVA.value.set(hl.vx, hl.vy, hl.vz);
        u.uHandB.value.set(hr.x - o.x, hr.y - o.y, hr.z - o.z, wake(hr)); u.uHandVB.value.set(hr.vx, hr.vy, hr.vz);
      }
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
      entity.setValue(OceanStatus, 'markers', runtime.markers.size);
      entity.setValue(OceanStatus, 'menuPage', this.page);
      entity.setValue(OceanStatus, 'sharkMinDistance', Number.isFinite(r.sharkMinDistance) ? r.sharkMinDistance : 0);
    }
  }

  private bandLabel(id: string) { return BANDS.find(b => b.id === id)?.label ?? id; }

  private drawPanel() {
    const s = this.director.state;
    const ctx = this.panelContext;
    const font = (size: number, weight = '') => `${weight} ${size}px Manrope, system-ui, sans-serif`;
    ctx.clearRect(0, 0, PANEL_W, PANEL_H);
    ctx.fillStyle = 'rgba(7,24,36,0.86)';
    ctx.beginPath(); ctx.roundRect(0, 0, PANEL_W, PANEL_H, 24); ctx.fill();
    // Grab bar
    ctx.fillStyle = 'rgba(119,216,219,0.12)'; ctx.beginPath(); ctx.roundRect(6, 6, 548, 48, 18); ctx.fill();
    ctx.fillStyle = 'rgba(233,229,218,0.55)';
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { ctx.beginPath(); ctx.arc(30 + j * 10, 20 + i * 10, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = PALETTE.cyan; ctx.font = font(22, '600'); ctx.fillText('DIVE MENU', 60, 38);
    ctx.fillStyle = '#7fa3ab'; ctx.font = font(17); ctx.fillText('pinch this bar to move', 340, 37);
    ctx.fillStyle = 'rgba(21,91,120,0.5)'; ctx.beginPath(); ctx.roundRect(568, 8, 60, 44, 14); ctx.fill();
    ctx.fillStyle = PALETTE.neutral; ctx.font = font(30, '600'); ctx.textAlign = 'center'; ctx.fillText('×', 598, 40); ctx.textAlign = 'start';
    for (const b of BUTTONS) {
      if (b.action.startsWith('page:')) {
        const on = b.action === `page:${this.page}`;
        ctx.fillStyle = on ? PALETTE.sea : 'rgba(21,91,120,0.22)';
        ctx.strokeStyle = on ? PALETTE.cyan : 'rgba(119,216,219,0.25)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 14); ctx.fill(); ctx.stroke();
        ctx.fillStyle = on ? PALETTE.neutral : '#a8c7cb'; ctx.font = font(22, '600'); ctx.textAlign = 'center';
        ctx.fillText(b.label, b.x + b.w / 2, b.y + 33); ctx.textAlign = 'start';
      }
    }
    if (this.page === 'controls') this.drawControls(ctx, font);
    else if (this.page === 'signs') this.drawSigns(ctx, font);
    else this.drawJournal(ctx, font);
    void s;
    this.panelTexture.needsUpdate = true;
  }

  private drawControls(ctx: CanvasRenderingContext2D, font: (size: number, weight?: string) => string) {
    const s = this.director.state;
    ctx.fillStyle = PALETTE.neutral; ctx.font = font(24);
    const lock = s.depthLocked ? 'held' : 'drifting';
    ctx.fillText(`${this.bandLabel(s.band)} · depth ${s.depth.toFixed(2)} → ${s.targetDepth.toFixed(2)} ${lock}`, 22, 150);
    ctx.fillStyle = 'rgba(119,216,219,0.25)'; ctx.fillRect(22, 160, PANEL_W - 44, 3);
    ctx.fillStyle = PALETTE.cyan; ctx.fillRect(22, 160, (PANEL_W - 44) * s.depth, 3);
    for (const button of BUTTONS) {
      if (button.page !== 'controls') continue;
      const selected = (button.action.startsWith('depth:') && s.depthLocked && Math.abs(Number(button.action.slice(6)) - s.targetDepth) < 1e-3)
        || (button.action === 'release' && !s.depthLocked)
        || (button.action === 'toggle-pause' && s.paused)
        || (button.action === 'toggle-reduced' && s.reducedMotion)
        || (button.action === 'text' && runtime.prefs.textScale > 1.1)
        || (button.action === 'sound' && runtime.prefs.sound)
        || (button.action === 'music' && runtime.prefs.music)
        || (button.action === 'guide' && runtime.prefs.guide);
      ctx.fillStyle = selected ? PALETTE.sea : 'rgba(21,91,120,0.28)';
      ctx.strokeStyle = selected ? PALETTE.cyan : 'rgba(119,216,219,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(button.x, button.y, button.w, button.h, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = PALETTE.neutral; ctx.font = font(button.h < 80 ? 22 : 25, '600');
      ctx.textAlign = 'center';
      const label = button.action === 'toggle-pause' && s.paused ? 'Resume' : button.label;
      ctx.fillText(label, button.x + button.w / 2, button.y + button.h / 2 + 9);
      ctx.textAlign = 'start';
    }
    ctx.fillStyle = PALETTE.cyan; ctx.font = font(19, '600');
    ctx.fillText(`Hands: ${runtime.stats.gesture}`, 22, 600, PANEL_W - 44);
  }

  private drawSigns(ctx: CanvasRenderingContext2D, font: (size: number, weight?: string) => string) {
    ctx.fillStyle = '#a8c7cb'; ctx.font = font(18);
    ctx.fillText('Each sign does exactly one thing.', 22, 146);
    let y = 160;
    for (const sign of HAND_SIGNS) {
      ctx.fillStyle = 'rgba(21,91,120,0.22)'; ctx.beginPath(); ctx.roundRect(16, y, PANEL_W - 32, 70, 14); ctx.fill();
      ctx.font = font(40); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(sign.icon, 56, y + 50); ctx.textAlign = 'start';
      ctx.fillStyle = PALETTE.neutral; ctx.font = font(22, '600'); ctx.fillText(sign.name, 96, y + 30);
      ctx.fillStyle = PALETTE.cyan; ctx.font = font(22, '600'); ctx.fillText(`→ ${sign.does}`, 260, y + 30);
      ctx.fillStyle = '#a8c7cb'; ctx.font = font(16);
      ctx.fillText(sign.detail, 96, y + 56, PANEL_W - 120);
      y += 76;
    }
  }

  private drawJournal(ctx: CanvasRenderingContext2D, font: (size: number, weight?: string) => string) {
    const s = this.director.state;
    // Map: top-down, forward (−z) up, 6 m travel radius.
    const cx = 168, cy = 334, r = 138, k = r / 6.2;
    ctx.fillStyle = 'rgba(4,14,22,0.7)'; ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(119,216,219,0.35)'; ctx.lineWidth = 2;
    for (const f of [1, 0.5]) { ctx.beginPath(); ctx.arc(cx, cy, r * f, 0, Math.PI * 2); ctx.stroke(); }
    for (const m of MARKERS) {
      const here = m.band === s.band, found = runtime.markers.has(m.id);
      const mx = cx + m.x * k, my = cy + m.z * k;
      ctx.globalAlpha = here ? 1 : 0.3;
      ctx.fillStyle = found ? '#7fa3ab' : '#FFD678';
      ctx.beginPath(); ctx.moveTo(mx, my - 9); ctx.lineTo(mx + 7, my); ctx.lineTo(mx, my + 9); ctx.lineTo(mx - 7, my); ctx.closePath(); ctx.fill();
      if (found) { ctx.strokeStyle = '#E9E5DA'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    // You: position = travel offset + head offset, arrow = heading.
    const px = cx + (s.travel[0] + this.headLocal.x) * k, py = cy + (s.travel[1] + this.headLocal.z) * k;
    const heading = Math.atan2(this.look.x, -this.look.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(heading);
    ctx.fillStyle = PALETTE.cyan; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(9, 9); ctx.lineTo(0, 4); ctx.lineTo(-9, 9); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#a8c7cb'; ctx.font = font(16);
    ctx.fillText('◆ dive marker  ▲ you', 70, 508);
    ctx.fillText('\u{1F449} Point to swim to the gold markers', 30, 540);
    ctx.fillText(`Zone now: ${this.bandLabel(s.band)}`, 30, 566);

    // Journal
    const x0 = 340;
    ctx.fillStyle = PALETTE.cyan; ctx.font = font(20, '600');
    ctx.fillText(`ANIMALS ${SPECIES.filter(sp => runtime.discovered.has(sp.id)).length}/${SPECIES.length}`, x0, 150);
    let y = 182;
    for (const sp of SPECIES) {
      const got = runtime.discovered.has(sp.id);
      ctx.fillStyle = got ? '#9be7c4' : '#56707a'; ctx.font = font(20, '600'); ctx.fillText(got ? '✓' : '○', x0, y);
      ctx.fillStyle = got ? PALETTE.neutral : '#7fa3ab'; ctx.font = font(19, got ? '600' : '');
      ctx.fillText(got ? sp.name : `??? · ${SPECIES_ZONE[sp.id] ?? ''}`, x0 + 28, y, 250);
      y += 32;
    }
    ctx.fillStyle = '#FFD678'; ctx.font = font(20, '600');
    ctx.fillText(`DIVE MARKERS ${runtime.markers.size}/${MARKERS.length}`, x0, y + 18);
    y += 50;
    for (const band of BANDS) {
      const all = MARKERS.filter(m => m.band === band.id);
      const got = all.filter(m => runtime.markers.has(m.id)).length;
      ctx.fillStyle = got === all.length ? '#9be7c4' : PALETTE.neutral; ctx.font = font(19);
      ctx.fillText(`${band.label}`, x0, y); ctx.fillText(`${got}/${all.length}`, x0 + 200, y);
      y += 30;
    }
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
