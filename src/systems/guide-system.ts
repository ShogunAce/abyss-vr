import { CanvasTexture, createSystem, type Entity, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Pressed, RayInteractable } from '@iwsdk/core';
import { audio } from '../audio/audio-engine.js';
import { SPECIES, speciesById } from '../data/species.js';
import { Inspectable, OceanControl } from '../ocean/ocean-components.js';
import { PALETTE } from '../ocean/ocean-system.js';
import { runtime } from '../runtime.js';
import { createBubbles, createNami } from '../visuals/creature-models.js';

type Panel = { mesh: Mesh; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: CanvasTexture; entity: Entity; w: number; h: number };

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, line: number, maxLines = 6) {
  const words = text.split(' ');
  let current = '', lines = 0;
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > width && current) {
      ctx.fillText(current, x, y + lines * line); lines++; current = word;
      if (lines >= maxLines) return lines;
    } else current = test;
  }
  if (current) { ctx.fillText(current, x, y + lines * line); lines++; }
  return lines;
}

/**
 * NAMI (captions-first guide), discovery cards and persistence, opening bubbles,
 * and the procedural soundscape. Facts only come from src/data/species.ts.
 */
export class GuideSystem extends createSystem({
  pressedCreatures: { required: [Inspectable, Pressed] },
}) {
  private nami = createNami();
  private caption!: Panel;
  private card!: Panel;
  private cardUntil = 0;
  private cardSpecies = '';
  private captionText = '';
  private bubbles = createBubbles(28);
  private anchor!: Object3D;
  private generation = -1;
  private audioClock = 0;
  private enteredFor = 0;

  private makePanel(name: string, w: number, h: number, metres: number, action: string): Panel {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const texture = new CanvasTexture(canvas);
    const mesh = new Mesh(new PlaneGeometry(metres, metres * h / w), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    mesh.name = name; mesh.visible = false; mesh.renderOrder = 41;
    const entity = this.world.createTransformEntity(mesh, { parent: this.world.requireSceneEntity('experience') });
    entity.addComponent(OceanControl, { action });
    return { mesh, canvas, ctx, texture, entity, w, h };
  }

  init() {
    this.anchor = this.world.requireSceneObject('experience');
    const experience = this.world.requireSceneEntity('experience');
    // Layout keeps pinchable text above eye line, out of the rays aimed at the sphere, panel and creatures.
    this.nami.group.position.set(0.21, 0.24, 0.02);
    this.world.createTransformEntity(this.nami.group, { parent: experience });
    this.caption = this.makePanel('NAMI caption', 720, 190, 0.34, 'nami-dismiss');
    this.caption.mesh.position.set(0, 0.3, -0.02); this.caption.mesh.rotation.set(0.12, 0, 0);
    this.card = this.makePanel('Discovery card', 720, 470, 0.36, 'card-close');
    this.card.mesh.position.set(0.34, 0.26, 0.06); this.card.mesh.rotation.set(0.1, -0.45, 0);
    this.bubbles.points.position.set(0, -0.05, 0);
    this.world.createTransformEntity(this.bubbles.points, { parent: experience });

    Object.assign(runtime.commandHandlers, {
      'nami-dismiss': () => { runtime.nami.dismiss(); runtime.log('nami', 'dismissed'); },
      'card-close': () => { this.cardUntil = 0; runtime.log('discovery', 'card closed'); },
      'nami-mute': () => { runtime.prefs.namiMuted = !runtime.prefs.namiMuted; runtime.nami.setMuted(runtime.prefs.namiMuted); runtime.savePrefs(); },
      'clear-discoveries': () => { runtime.discovered.clear(); try { localStorage.removeItem('abyss.discoveries.v1'); } catch { /* ignore */ } },
    });

    this.cleanupFuncs.push(this.queries.pressedCreatures.subscribe('qualify', entity => {
      const id = entity.getValue(Inspectable, 'speciesId') ?? '';
      const species = speciesById(id);
      if (!species) return;
      const fresh = runtime.discover(id);
      this.showCard(id);
      audio.chime();
      runtime.nami.notify('discovery', runtime.clock, `${fresh ? 'New discovery' : 'Seen again'}: ${species.name}. ${runtime.discovered.size} of ${SPECIES.length} found.`);
    }));
    this.cleanupFuncs.push(() => {
      for (const p of [this.caption, this.card]) { p.texture.dispose(); p.mesh.geometry.dispose(); (p.mesh.material as MeshBasicMaterial).dispose(); }
    });
  }

  private setShown(panel: Panel, shown: boolean) {
    panel.mesh.visible = shown;
    if (shown && !panel.entity.hasComponent(RayInteractable)) panel.entity.addComponent(RayInteractable);
    if (!shown && panel.entity.hasComponent(RayInteractable)) panel.entity.removeComponent(RayInteractable);
  }

  private showCard(id: string) {
    const s = speciesById(id)!;
    const { ctx, w, h } = this.card;
    this.cardSpecies = id;
    this.cardUntil = runtime.clock + 30;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(7,24,36,0.9)'; ctx.beginPath(); ctx.roundRect(0, 0, w, h, 26); ctx.fill();
    ctx.strokeStyle = 'rgba(119,216,219,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = PALETTE.cyan; ctx.font = '600 20px Manrope, system-ui, sans-serif';
    ctx.fillText(`DISCOVERY ${runtime.discovered.size}/${SPECIES.length}`, 30, 44);
    ctx.fillStyle = PALETTE.neutral; ctx.font = '600 40px Manrope, system-ui, sans-serif'; ctx.fillText(s.name, 30, 96);
    ctx.fillStyle = '#a8d6d7'; ctx.font = 'italic 24px Manrope, system-ui, sans-serif'; ctx.fillText(s.scientificName, 30, 130);
    ctx.fillStyle = PALETTE.neutral; ctx.font = '26px Manrope, system-ui, sans-serif';
    const used = wrap(ctx, s.shortFact, 30, 178, w - 60, 34, 5);
    ctx.fillStyle = '#9fc4c9'; ctx.font = '21px Manrope, system-ui, sans-serif';
    wrap(ctx, s.extendedFact, 30, 186 + used * 34, w - 60, 28, 3);
    ctx.fillStyle = '#7fa3ab'; ctx.font = '18px Manrope, system-ui, sans-serif';
    ctx.fillText(`Source: ${s.sourceName} · ${s.habitat}`, 30, h - 52);
    ctx.fillStyle = PALETTE.cyan; ctx.fillText('Pinch this card to close', 30, h - 24);
    this.card.texture.needsUpdate = true;
  }

  private drawCaption(text: string) {
    const { ctx, w, h } = this.caption;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(7,24,36,0.82)'; ctx.beginPath(); ctx.roundRect(0, 0, w, h, 22); ctx.fill();
    ctx.fillStyle = PALETTE.violet; ctx.font = '600 18px Manrope, system-ui, sans-serif'; ctx.fillText('NAMI', 26, 36);
    ctx.fillStyle = PALETTE.neutral; ctx.font = '27px Manrope, system-ui, sans-serif';
    wrap(ctx, text, 26, 74, w - 52, 34, 3);
    this.caption.texture.needsUpdate = true;
  }

  update(delta: number) {
    if (runtime.generation !== this.generation) { this.generation = runtime.generation; this.cardUntil = 0; this.enteredFor = 0; }
    const t = runtime.clock;
    const scale = runtime.prefs.textScale;

    // NAMI story beats from world state.
    if (runtime.sessionActive && runtime.destination === 'room' && runtime.sessionTime > 1.5) runtime.nami.notify('welcome', t);
    this.enteredFor = runtime.immersion >= 0.999 ? this.enteredFor + delta : 0;
    if (this.enteredFor > 1.5) runtime.nami.notify('entered', t);

    // NAMI orb: gentle bob, brighter while speaking.
    const talking = runtime.nami.current !== null;
    this.nami.group.position.y = 0.24 + Math.sin(t * 1.1) * 0.01;
    this.nami.group.visible = runtime.sessionActive || runtime.immersion > 0;
    ((this.nami.core.material as unknown as { uniforms: { uTalk: { value: number } } }).uniforms.uTalk).value = talking ? 0.6 + 0.4 * Math.sin(t * 6) : 0;
    this.nami.halo.material.opacity = talking ? 0.9 : 0.5;

    const text = runtime.nami.current?.text ?? '';
    if (text !== this.captionText) { runtime.log('nami', text ? runtime.nami.current!.id : 'caption cleared'); this.captionText = text; if (text) this.drawCaption(text); }
    this.setShown(this.caption, text !== '' && this.cardUntil <= t);
    this.caption.mesh.scale.setScalar(scale);

    this.setShown(this.card, this.cardUntil > t);
    this.card.mesh.scale.setScalar(scale);

    // Opening bubbles rise around the sphere while the room is still visible.
    this.bubbles.material.uniforms.uOpacity.value = runtime.destination === 'room' ? 1 - runtime.immersion : Math.max(0, 0.6 - runtime.immersion);

    this.audioClock += delta;
    if (this.audioClock > 0.25) { this.audioClock = 0; audio.setDepth(runtime.director.state.depth, runtime.immersion); }
    void this.anchor;
  }
}
