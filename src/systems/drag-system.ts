import { createSystem, type Object3D, Vector3 } from '@iwsdk/core';
import { runtime } from '../runtime.js';

type Hand = 'left' | 'right';
export type DragKey = 'menu' | 'guide';

/** Objects that can be moved by pinching their handle; registered by the owning systems. */
export const draggables: Partial<Record<DragKey, Object3D>> = {};
const homes: Partial<Record<DragKey, number[]>> = {};

/** Register a movable panel: remembers its authored (home) pose, then applies any saved pose. */
export function registerDraggable(key: DragKey, object: Object3D) {
  draggables[key] = object;
  homes[key] = [object.position.x, object.position.y, object.position.z, object.rotation.x, object.rotation.y, object.rotation.z];
  restorePose(key, object);
}

function applyPose(object: Object3D, pose: number[]) {
  object.position.set(pose[0], pose[1], pose[2]);
  object.rotation.set(pose[3], pose[4], pose[5]);
}

/** Apply a saved pose (anchor-local position + Euler) if one exists. */
function restorePose(key: DragKey, object: Object3D) {
  const pose = key === 'menu' ? runtime.prefs.menuPose : runtime.prefs.guidePose;
  if (!pose || pose.length < 6 || pose.some(v => !Number.isFinite(v))) return;
  object.position.set(pose[0], pose[1], pose[2]);
  object.rotation.set(pose[3], pose[4], pose[5]);
}

/**
 * Pinch-and-move for spatial panels: a pinch on a panel's grab handle starts a drag;
 * the panel then rides that hand's ray at the grab distance, always turned to face
 * the viewer, and its pose is saved when the pinch releases.
 */
export class DragSystem extends createSystem({}) {
  private key: DragKey | null = null;
  private hand: Hand = 'right';
  private distance = 0.5;
  private origin = new Vector3();
  private dir = new Vector3();
  private target = new Vector3();
  private head = new Vector3();
  private grabOffset = new Vector3();

  init() {
    Object.assign(runtime.commandHandlers, {
      'drag:menu': () => this.begin('menu'),
      'drag:guide': () => this.begin('guide'),
      'reset-layout': () => {
        runtime.prefs.menuPose = null; runtime.prefs.guidePose = null; runtime.savePrefs();
        for (const key of ['menu', 'guide'] as const) { const o = draggables[key], h = homes[key]; if (o && h) applyPose(o, h); }
        runtime.log('comfort', 'panel layout reset');
      },
    });
  }

  private begin(key: DragKey) {
    const object = draggables[key];
    if (!object) return;
    const sel = (h: Hand) => this.input.xr.getSelectState(h);
    // The hand whose pinch just started owns the drag.
    this.hand = sel('right').start || (sel('right').active && !sel('left').start) ? 'right' : 'left';
    this.player.raySpaces[this.hand].getWorldPosition(this.origin);
    object.getWorldPosition(this.target);
    this.distance = Math.max(0.2, this.origin.distanceTo(this.target));
    this.player.raySpaces[this.hand].getWorldDirection(this.dir).negate();
    // Keep the point that was grabbed under the ray (no jump on pickup).
    this.grabOffset.copy(this.target).sub(this.origin.addScaledVector(this.dir, this.distance));
    this.key = key;
    runtime.dragging = key;
    runtime.log('comfort', `move ${key}`);
  }

  update() {
    if (!this.key) return;
    const object = draggables[this.key];
    if (!object || !this.input.xr.getSelectState(this.hand).active) { this.end(); return; }
    this.player.raySpaces[this.hand].getWorldPosition(this.origin);
    this.player.raySpaces[this.hand].getWorldDirection(this.dir).negate();
    this.target.copy(this.origin).addScaledVector(this.dir, this.distance).add(this.grabOffset);
    this.player.head.getWorldPosition(this.head);
    // Never inside the head, never absurdly far.
    const fromHead = this.target.distanceTo(this.head);
    if (fromHead < 0.25) this.target.sub(this.head).setLength(0.25).add(this.head);
    if (fromHead > 1.6) this.target.sub(this.head).setLength(1.6).add(this.head);
    const parent = object.parent;
    if (parent) parent.worldToLocal(this.target);
    object.position.copy(this.target);
    // Face the viewer (plane fronts point along +Z).
    object.lookAt(this.head);
  }

  private end() {
    const key = this.key!, object = draggables[key];
    this.key = null;
    runtime.dragging = null;
    if (!object) return;
    const pose = [object.position.x, object.position.y, object.position.z, object.rotation.x, object.rotation.y, object.rotation.z];
    if (key === 'menu') runtime.prefs.menuPose = pose; else runtime.prefs.guidePose = pose;
    runtime.savePrefs();
    runtime.log('comfort', `placed ${key}`);
  }
}
