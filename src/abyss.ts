import { CanvasTexture, createSystem, Mesh, MeshStandardMaterial, Object3D, Pressed, ShaderMaterial, Sprite, SpriteMaterial, Vector3 } from '@iwsdk/core';
import { AbyssSphere } from './abyss-component.js';
import { immersionPhase, smoothReveal, stepImmersion } from './transition.js';

export class AbyssSystem extends createSystem({
  spheres: { required: [AbyssSphere] },
  pressed: { required: [AbyssSphere, Pressed] },
}) {
  private anchor!: Object3D;
  private sphere!: Mesh;
  private ring!: Object3D;
  private particles!: Object3D;
  private material!: MeshStandardMaterial;
  private ocean!: Object3D;
  private oceanMaterials: ShaderMaterial[] = [];
  private immersion = 0;
  private destination = 0;
  private debugSpatial = new URLSearchParams(location.search).has('debug');
  private returnButton = document.getElementById('return-room') as HTMLButtonElement;
  private journeyStatus = document.getElementById('journey-status')!;
  private progress = document.getElementById('journey-progress') as HTMLProgressElement;
  private position = new Vector3();
  private forward = new Vector3();
  private session: XRSession | null = null;
  private needsPlacement = false;
  private elapsed = 0;
  private pulse = 0;
  private count = 0;
  private lastEvent = 'None';
  private frameMs = 0;
  private diagnosticClock = 0;
  private canvas = document.createElement('canvas');
  private context!: CanvasRenderingContext2D;
  private texture!: CanvasTexture;
  private status = document.getElementById('app-status')!;
  private diagnostics = document.getElementById('diagnostic-values')!;
  private enter = document.getElementById('enter-xr') as HTMLButtonElement;
  private exit = document.getElementById('exit-xr') as HTMLButtonElement;

  init() {
    this.anchor = this.world.requireSceneObject('experience');
    this.sphere = this.world.requireSceneObject<Mesh>('sphere');
    this.ring = this.world.requireSceneObject('confirmation');
    this.particles = this.world.requireSceneObject('particles');
    this.ocean = this.world.requireSceneObject('ocean');
    this.ocean.visible = false;
    // Own runtime material copies: editor prototypes must remain immutable.
    const copies = new Map<ShaderMaterial, ShaderMaterial>();
    this.ocean.traverse(object => {
      const renderable = object as Mesh;
      if (!(renderable.material instanceof ShaderMaterial)) return;
      let copy = copies.get(renderable.material);
      if (!copy) {
        copy = renderable.material.clone();
        copies.set(renderable.material, copy);
        this.oceanMaterials.push(copy);
      }
      renderable.material = copy;
    });
    this.material = (this.sphere.material as MeshStandardMaterial).clone();
    this.sphere.material = this.material;
    this.ring.visible = false;
    this.canvas.width = 768;
    this.canvas.height = 256;
    this.context = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    const panelMaterial = new SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false });
    const panel = new Sprite(panelMaterial);
    panel.name = 'Journey instruction';
    panel.scale.set(0.43, 0.143, 1);
    panel.position.set(0, -0.22, 0);
    this.world.createTransformEntity(panel, { parent: this.world.requireSceneEntity('experience') });

    this.cleanupFuncs.push(this.queries.pressed.subscribe('qualify', entity => {
      // Pressed is the SDK's edge-triggered ray selection (hand pinch, trigger, or mouse).
      // No select listener or polling duplicates this event.
      this.count++;
      this.destination = this.destination === 0 ? 1 : 0;
      this.pulse = 0.65;
      this.lastEvent = `${this.inputMode()} select #${this.count}`;
      entity.setValue(AbyssSphere, 'interactions', this.count);
      entity.setValue(AbyssSphere, 'lastEvent', this.lastEvent);
      this.material.color.setHex(0x26fff0);
      this.material.emissive.setHex(0x06e8df);
      this.diagnosticClock = 1;
    }));
    const launch = async () => {
      this.enter.disabled = true;
      try { await this.world.launchXR(); }
      catch (error) { this.status.textContent = `XR could not start: ${String(error)}. Check HTTPS and XR support.`; }
      finally { this.enter.disabled = false; }
    };
    const leave = async () => {
      try { await this.world.exitXR(); }
      catch (error) { this.status.textContent = `XR exit failed: ${String(error)}`; }
    };
    const returnToRoom = () => { this.destination = 0; this.diagnosticClock = 1; };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') returnToRoom(); };
    this.returnButton.addEventListener('click', returnToRoom);
    window.addEventListener('keydown', escape);
    this.enter.addEventListener('click', launch);
    this.exit.addEventListener('click', leave);
    this.enter.textContent = 'Enter XR';
    this.enter.disabled = !this.world.xrEnabled;
    this.status.textContent = this.world.xrEnabled ? 'Ready. Stay seated and keep your hands in view.' : 'XR unavailable. Desktop sphere clicking is available.';
    this.cleanupFuncs.push(() => {
      this.enter.removeEventListener('click', launch);
      this.exit.removeEventListener('click', leave);
      this.returnButton.removeEventListener('click', returnToRoom);
      window.removeEventListener('keydown', escape);
      for (const mat of this.oceanMaterials) mat.dispose();
      this.texture.dispose(); panelMaterial.dispose(); this.material.dispose();
    });
  }

  private handAvailable(hand: XRHandedness) {
    if (!this.session) return false;
    for (const source of this.session.inputSources) if (source.handedness === hand && source.hand) return true;
    return false;
  }
  private inputMode() {
    if (!this.session) return 'Desktop pointer';
    return this.handAvailable('left') || this.handAvailable('right') ? 'XR hand' : 'XR controller / no hands';
  }

  update(delta: number) {
    this.elapsed += delta;
    this.frameMs = this.frameMs === 0 ? delta * 1000 : this.frameMs * 0.95 + delta * 50;
    const active = this.world.renderer.xr.getSession() ?? null;
    if (active !== this.session) {
      this.session = active;
      this.needsPlacement = active !== null;
      this.pulse = 0;
      this.immersion = 0;
      this.destination = 0;
      this.enter.hidden = active !== null;
      this.exit.hidden = active === null;
      this.diagnosticClock = 1;
      if (!active) {
        this.anchor.position.set(0, 1.35, -0.7);
        this.anchor.quaternion.identity();
        this.ocean.position.set(0, 1.5, 0);
        this.status.textContent = 'XR ended. Desktop input remains available; enter again to reconnect.';
      }
    }
    if (this.needsPlacement && this.world.renderer.xr.getFrame()) {
      // Wait for a valid tracked pose; place content once, never move the camera.
      const frame = this.world.renderer.xr.getFrame();
      const reference = this.world.renderer.xr.getReferenceSpace();
      if (reference && frame.getViewerPose(reference)) {
        this.player.head.getWorldPosition(this.position);
        this.player.head.getWorldDirection(this.forward);
        this.forward.y = 0;
        if (this.forward.lengthSq() > 0.01) {
          this.forward.normalize();
          this.anchor.position.copy(this.position).addScaledVector(this.forward, -0.7);
          this.anchor.position.y = this.position.y - 0.15;
          this.anchor.rotation.y = Math.atan2(this.forward.x, this.forward.z);
          this.ocean.position.copy(this.position);
          this.needsPlacement = false;
        }
      }
    }
    this.pulse = Math.max(0, this.pulse - delta);
    const strength = Math.sin(this.pulse / 0.65 * Math.PI);
    this.sphere.scale.setScalar(1 + strength * 0.16);
    this.ring.visible = this.pulse > 0;
    this.ring.scale.setScalar(1 + (1 - this.pulse / 0.65) * 0.5);
    if (this.pulse === 0) {
      this.material.color.setHex(0x1677ff);
      this.material.emissive.setHex(0x096bff);
    }
    this.particles.position.y = Math.sin(this.elapsed * 0.2) * 0.012;
    // Do not advance through a hidden session; resumption never skips a fade.
    const visible = !this.session || this.session.visibilityState === 'visible';
    if (visible) this.immersion = stepImmersion(this.immersion, this.destination, delta);
    const reveal = smoothReveal(this.immersion);
    this.ocean.visible = reveal > 0;
    for (const mat of this.oceanMaterials) {
      mat.uniforms.uReveal.value = reveal;
      mat.uniforms.uTime.value = this.elapsed;
      mat.depthWrite = reveal === 1 && mat.userData.solid === true;
    }
    for (const entity of this.queries.spheres.entities) {
      entity.setValue(AbyssSphere, 'pulse', this.pulse);
      entity.setValue(AbyssSphere, 'immersion', this.immersion);
      entity.setValue(AbyssSphere, 'destination', this.destination === 1 ? 'ocean' : 'room');
      entity.setValue(AbyssSphere, 'phase', immersionPhase(this.immersion, this.destination));
    }
    this.diagnosticClock += delta;
    if (this.diagnosticClock >= 0.25) {
      this.diagnosticClock = 0;
      this.refreshDiagnostics();
    }
  }

  private refreshDiagnostics() {
    const left = this.handAvailable('left');
    const right = this.handAvailable('right');
    const input = this.inputMode();
    const phase = immersionPhase(this.immersion, this.destination);
    const heading = phase === 'room' ? 'An ocean is waiting.' : phase === 'entering' ? 'Let the room become ocean.' : phase === 'ocean' ? 'You are here. Breathe.' : 'Returning to your room.';
    const instruction = this.destination === 1 ? 'Pinch the sphere to return to your room.' : 'Pinch the sphere to enter the ocean.';
    this.journeyStatus.textContent = heading;
    this.progress.value = this.immersion;
    this.returnButton.hidden = this.immersion === 0 && this.destination === 0;
    const tracking = this.session ? (left || right ? 'Hand sources available; point and pinch.' : 'Hands unavailable. Enable tracking and set controllers down.') : 'No XR hand sources. Desktop click is a test only.';
    const lines = [
      `XR session: ${this.session ? 'active' : 'inactive'}`,
      `Session mode: ${this.session ? 'immersive-ar' : 'none'}`,
      `Left hand: ${left ? 'available' : 'unavailable'}`,
      `Right hand: ${right ? 'available' : 'unavailable'}`,
      `Input mode: ${input}`,
      `Journey: ${phase} / ${Math.round(this.immersion * 100)}%`,
      `FPS: ${Math.round(1000 / Math.max(1, this.frameMs))} / ${this.frameMs.toFixed(1)} ms`,
      `Interactions: ${this.count}`,
      `Last event: ${this.lastEvent}`,
      tracking,
      'Physical device: not verified by app',
    ];
    this.diagnostics.textContent = lines.join('\n');
    if (this.session) this.status.textContent = tracking;
    const ctx = this.context;
    ctx.clearRect(0, 0, 768, 256);
    if (!this.debugSpatial) {
      ctx.fillStyle = 'rgba(3,16,23,0.72)'; ctx.fillRect(0, 16, 768, 220);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#92d4d8'; ctx.font = '18px monospace';
      ctx.fillText('A B Y S S  /  STAY SEATED', 384, 62);
      ctx.fillStyle = '#e0fffa'; ctx.font = '30px sans-serif'; ctx.fillText(heading, 384, 114);
      ctx.fillStyle = '#a8d6d7'; ctx.font = '22px sans-serif'; ctx.fillText(instruction, 384, 157);
      ctx.fillStyle = '#26474e'; ctx.fillRect(100, 194, 568, 3);
      ctx.fillStyle = '#84e7d6'; ctx.fillRect(100, 194, 568 * this.immersion, 3);
      ctx.textAlign = 'start';
      this.texture.needsUpdate = true;
      return;
    }
    ctx.fillStyle = 'rgba(3,16,23,0.88)'; ctx.fillRect(0, 0, 768, 256);
    ctx.fillStyle = '#9ebdc9'; ctx.font = '22px monospace';
    ctx.fillText(`DEV / ${phase.toUpperCase()} · ${Math.round(this.immersion * 100)}%`, 24, 36);
    ctx.fillStyle = '#c9f7f0'; ctx.font = '26px monospace';
    ctx.fillText(`${this.session ? 'XR active' : 'Desktop'} · L ${left ? 'yes' : 'no'} / R ${right ? 'yes' : 'no'}`, 24, 86);
    ctx.fillText(`Events ${this.count} · ${Math.round(1000 / Math.max(1, this.frameMs))} FPS`, 24, 132);
    ctx.font = '21px monospace'; ctx.fillText(this.lastEvent, 24, 178);
    ctx.fillText(this.session && !left && !right ? 'Hands unavailable — enable hand tracking' : 'Point at sphere + pinch / desktop click', 24, 222);
    this.texture.needsUpdate = true;
  }
}
