import { createSystem, Vector3 } from '@iwsdk/core';
import { runtime } from '../runtime.js';
import { arbitratePinch, OneEuro3, type HandSample } from '../sim/gesture.js';

type Hand = 'left' | 'right';
const HANDS: Hand[] = ['left', 'right'];
const TIPS = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'] as const;
const PROXIMAL = ['index-finger-phalanx-proximal', 'middle-finger-phalanx-proximal', 'ring-finger-phalanx-proximal', 'pinky-finger-phalanx-proximal'] as const;

/**
 * Sense → interpret: reads WebXR hand joints (or controller grip as a fallback),
 * feeds the pure HandGesture interpreter, and arbitrates each pinch exactly once.
 */
export class GestureSystem extends createSystem({}) {
  private session: XRSession | null = null;
  private samples: Record<Hand, HandSample> = {
    left: { tracked: false, x: 0, y: 0, z: 0, extended: 0, pinchDistance: 1, spread: 0, select: false },
    right: { tracked: false, x: 0, y: 0, z: 0, extended: 0, pinchDistance: 1, spread: 0, select: false },
  };
  private joint = new Vector3();
  private wrist = new Vector3();
  private palm = new Vector3();
  private thumb = new Vector3();
  private index = new Vector3();
  private tip = new Vector3();
  private knuckle = new Vector3();
  private dir = new Vector3();
  private noHandsFor = 0;
  private roomPalmFor = 0;
  private features = '';
  private frame = 0;
  private tipFilters = { left: new OneEuro3(), right: new OneEuro3() };
  private dt = 0;
  private travelSnap = true;

  private readJoint(frame: XRFrame, ref: XRReferenceSpace, hand: XRHand, name: XRHandJoint, out: Vector3) {
    const space = hand.get(name);
    const pose = space ? frame.getJointPose?.(space, ref) : undefined;
    if (!pose) return false;
    const p = pose.transform.position;
    out.set(p.x, p.y, p.z).applyMatrix4(this.player.matrixWorld);
    return true;
  }

  private sample(hand: Hand, frame: XRFrame | null, ref: XRReferenceSpace | null) {
    const s = this.samples[hand];
    const select = this.input.xr.getSelectState(hand);
    s.select = select.active;
    s.tracked = false;
    runtime.tips[hand].ok = false;
    const filter = this.tipFilters[hand];
    const source = this.input.xr.getPrimaryInputSource(hand);
    if (!source || !frame || !ref) { filter.reset(); return; }
    if (source.hand) {
      if (!this.readJoint(frame, ref, source.hand, 'wrist', this.wrist)) return;
      if (!this.readJoint(frame, ref, source.hand, 'middle-finger-metacarpal', this.palm)) return;
      this.palm.lerp(this.wrist, 0.35);
      let extended = 0;
      for (let i = 0; i < 4; i++) {
        if (this.readJoint(frame, ref, source.hand, TIPS[i], this.tip) && this.readJoint(frame, ref, source.hand, PROXIMAL[i], this.knuckle)) {
          if (this.tip.distanceTo(this.wrist) > this.knuckle.distanceTo(this.wrist) * 1.45) extended++;
        }
      }
      const hasThumb = this.readJoint(frame, ref, source.hand, 'thumb-tip', this.thumb) && this.readJoint(frame, ref, source.hand, 'index-finger-tip', this.index);
      s.tracked = true;
      s.x = this.palm.x; s.y = this.palm.y; s.z = this.palm.z;
      s.extended = extended;
      s.pinchDistance = hasThumb ? this.thumb.distanceTo(this.index) : 1;
      if (hasThumb) {
        filter.update(this.index.x, this.index.y, this.index.z, this.dt);
        const t = runtime.tips[hand]; t.ok = true; t.x = filter.x; t.y = filter.y; t.z = filter.z;
      } else filter.reset();
      const spread = hasThumb && this.readJoint(frame, ref, source.hand, 'pinky-finger-tip', this.tip) ? this.index.distanceTo(this.tip) : 0;
      s.spread = spread;
      if ((this.frame & 3) === 0) this.features += `${hand[0]} ext${extended} pinch${s.pinchDistance.toFixed(3)} spread${spread.toFixed(3)} `;
    } else {
      // Controller fallback: position only (no open palm), so gestures degrade gracefully.
      this.player.gripSpaces[hand].getWorldPosition(this.joint);
      s.tracked = true; s.x = this.joint.x; s.y = this.joint.y; s.z = this.joint.z; s.extended = 0; s.pinchDistance = 1; s.spread = 0;
    }
  }

  update(delta: number) {
    runtime.clock += Math.min(Math.max(delta, 0), 0.1);
    this.dt = Math.min(Math.max(delta, 0), 0.1);
    const active = this.world.renderer.xr.getSession() ?? null;
    if (active !== this.session) {
      this.session = active;
      runtime.sessionActive = active !== null;
      runtime.sessionTime = 0;
      runtime.director.reset();
      runtime.travelHand = null;
      runtime.pinchOwner.left = runtime.pinchOwner.right = 'none';
      runtime.pulseArmedUntil = 0;
      runtime.hands.left.reset(); runtime.hands.right.reset();
      runtime.nami.reset();
      runtime.generation++;
      runtime.log('session', active ? 'XR started' : 'XR ended');
    }
    if (active) runtime.sessionTime += delta;
    const frame = active ? this.world.renderer.xr.getFrame() : null;
    const ref = active ? this.world.renderer.xr.getReferenceSpace() : null;
    const depth = runtime.director.state.depth;
    const immersed = active !== null && runtime.immersion >= 0.999;
    // Diagnostic strings are rebuilt at ~15 Hz, not every frame (no per-frame string garbage).
    const describe = (++this.frame & 3) === 0;
    if (describe) this.features = '';
    let anyTracked = false;
    let label = '';
    let fastest = 0;

    for (const hand of HANDS) {
      this.sample(hand, frame, ref);
      const g = runtime.hands[hand];
      g.update(this.samples[hand], delta);
      anyTracked ||= g.tracked;
      fastest = Math.max(fastest, g.speed);
      if (describe && g.tracked) label += `${hand[0].toUpperCase()}: ${g.openPalm ? 'open palm' : this.samples[hand].select ? 'pinch' : 'hand'}/${g.motion} `;

      if (g.sweep && g.ready) { runtime.sweepEvent = { x: g.x, y: g.y, z: g.z }; runtime.stats.sweeps++; runtime.log('gesture', `${hand} fast sweep`); }

      // Open palm in deep water arms the light pulse (kept armed briefly so a pinch can follow).
      if (g.openPalm && immersed && depth >= 0.75 && !runtime.director.state.paused) {
        if (runtime.pulseArmedUntil < runtime.clock) { runtime.log('gesture', `${hand} palm armed pulse`); runtime.nami.notify('armed', runtime.clock); }
        runtime.pulseArmedUntil = runtime.clock + 3;
      }

      const select = this.input.xr.getSelectState(hand);
      if (select.start) {
        const owner = arbitratePinch({
          rayOnTarget: this.input.xr.multiPointers[hand].getRayBusy(),
          immersed, paused: runtime.director.state.paused,
          pulseArmed: runtime.clock < runtime.pulseArmedUntil && depth >= 0.75,
          otherHandTravelling: runtime.travelHand !== null && runtime.travelHand !== hand,
        });
        runtime.pinchOwner[hand] = owner;
        if (owner === 'travel') { runtime.travelHand = hand; this.travelSnap = true; }
        if (owner !== 'none') runtime.log('pinch', `${hand} → ${owner}`);
      }
      if (runtime.travelHand === hand) {
        this.player.raySpaces[hand].getWorldDirection(this.dir).negate();
        // Smooth the pointing direction so hand tremor never makes the glide wobble.
        const td = runtime.travelDir, k = this.travelSnap ? 1 : 1 - Math.exp(-delta * 5);
        this.travelSnap = false;
        td.x += (this.dir.x - td.x) * k; td.y += (this.dir.y - td.y) * k; td.z += (this.dir.z - td.z) * k;
        const tl = Math.hypot(td.x, td.y, td.z) || 1; td.x /= tl; td.y /= tl; td.z /= tl;
        if (!g.tracked && !this.input.xr.getPrimaryInputSource(hand)) runtime.travelHand = null;
      }
      if (select.end || (!select.active && runtime.pinchOwner[hand] !== 'none')) {
        if (runtime.pinchOwner[hand] === 'pulse') {
          // One pulse per release, from the pinching hand.
          this.player.raySpaces[hand].getWorldPosition(this.joint);
          runtime.pendingPulse = g.tracked ? { x: g.x, y: g.y, z: g.z } : { x: this.joint.x, y: this.joint.y, z: this.joint.z };
          runtime.pulseArmedUntil = runtime.clock + 1.5;
        }
        runtime.pinchOwner[hand] = 'none';
        if (runtime.travelHand === hand) runtime.travelHand = null;
      }
    }

    // Room opening: a deliberate open palm also lets the ocean in.
    const palmInRoom = active !== null && runtime.destination === 'room' && runtime.sessionTime > 2 && (runtime.hands.left.openFor > 0 || runtime.hands.right.openFor > 0);
    this.roomPalmFor = palmInRoom ? this.roomPalmFor + delta : 0;
    if (this.roomPalmFor > 0.6) { runtime.requests.enterOcean = true; this.roomPalmFor = 0; runtime.log('gesture', 'open palm in room → enter ocean'); }

    this.noHandsFor = active && !anyTracked ? this.noHandsFor + delta : 0;
    if (this.noHandsFor > 2) runtime.nami.notify('tracking', runtime.clock);
    if (describe) {
      runtime.stats.gesture = label.trim() || (active ? 'no hands tracked' : 'desktop');
      runtime.stats.handFeatures = this.features;
    }
    runtime.stats.handSpeed = fastest;
    runtime.nami.update(runtime.clock);
  }
}
