import assert from 'node:assert/strict';
import test from 'node:test';
import { OceanDirector, bandFor, MAX_DEPTH_RATE, MAX_DT, TRAVEL_RADIUS, DEFAULT_DEPTH } from '../src/ocean/ocean-director.ts';

const run = (director, seconds, dt = 1 / 72, each) => {
  for (let t = 0; t < seconds; t += dt) { director.update(dt); each?.(director.state); }
};

test('starts in an attractive sunlit state', () => {
  const d = new OceanDirector(42);
  assert.equal(d.state.depth, DEFAULT_DEPTH);
  assert.equal(d.state.band, 'sunlit');
  assert.ok(d.state.ambientLight > 0.95);
  assert.equal(d.state.depthLocked, false);
});

test('spec input: 0.15 → 0.95, reversed to 0.30 halfway; smooth, bounded, settles', () => {
  const d = new OceanDirector(42);
  d.selectDepth(0.95);
  let previous = d.state.depth;
  let maxStep = 0;
  let reversed = false;
  const bands = new Set();
  for (let i = 0; i < 72 * 60; i++) {
    d.update(1 / 72);
    const s = d.state;
    maxStep = Math.max(maxStep, Math.abs(s.depth - previous));
    assert.ok(s.depth >= 0 && s.depth <= 1, 'depth bounded');
    assert.ok(s.ambientLight >= 0 && s.ambientLight <= 1 && Number.isFinite(s.fogDensity), 'environment bounded');
    bands.add(s.band);
    if (!reversed && s.depth >= 0.55) { d.selectDepth(0.3); reversed = true; }
    previous = s.depth;
  }
  assert.ok(reversed, 'reached halfway');
  assert.ok(maxStep <= MAX_DEPTH_RATE / 72 + 1e-9, `no jumps (max step ${maxStep})`);
  assert.ok(Math.abs(d.state.depth - 0.3) < 1e-3, `settled at 0.30 (got ${d.state.depth})`);
  assert.ok(bands.has('openBlue'));
});

test('midnight is reached gradually and is dark', () => {
  const d = new OceanDirector(42);
  d.selectDepth(1);
  run(d, 2);
  assert.ok(d.state.depth < 0.4, 'not instantaneous');
  run(d, 40);
  assert.ok(d.state.depth > 0.99);
  assert.equal(d.state.band, 'midnight');
  assert.ok(d.state.ambientLight < 0.06 && d.state.bioluminescence > 0.9);
});

test('user depth lock prevents automatic depth changes', () => {
  const d = new OceanDirector(7);
  d.selectDepth(0.65);
  run(d, 600, 1 / 30);
  assert.equal(d.state.targetDepth, 0.65);
  assert.ok(!d.events.some(e => e.type === 'auto'));
});

test('without a lock, automatic changes happen but stay out of darkness', () => {
  const d = new OceanDirector(7);
  let maxTarget = 0;
  run(d, 900, 1 / 30, s => { maxTarget = Math.max(maxTarget, s.targetDepth); });
  assert.ok(d.events.some(e => e.type === 'auto') || d.state.targetDepth !== DEFAULT_DEPTH);
  assert.ok(maxTarget <= 0.45);
});

test('same seed reproduces the same automatic history', () => {
  const a = new OceanDirector(99), b = new OceanDirector(99);
  run(a, 300, 1 / 30); run(b, 300, 1 / 30);
  assert.deepEqual(a.state, b.state);
});

test('pause freezes simulation time and depth; resume continues', () => {
  const d = new OceanDirector(42);
  d.selectDepth(0.95);
  run(d, 3);
  d.setPaused(true);
  const frozen = structuredClone(d.state);
  run(d, 10);
  d.travel(1, 0, 0.05);
  assert.deepEqual(d.state, frozen);
  d.setPaused(false);
  run(d, 1);
  assert.ok(d.state.depth > frozen.depth);
});

test('travel is bounded, horizontal, and capped per frame', () => {
  const d = new OceanDirector(42);
  d.travel(1, 0, 10);
  assert.ok(Math.abs(d.state.travel[0] - 0.35 * MAX_DT) < 1e-9, 'large delta clamped');
  for (let i = 0; i < 10000; i++) d.travel(0.6, 0.8, 1 / 72);
  assert.ok(Math.hypot(...d.state.travel) <= TRAVEL_RADIUS + 1e-9);
  d.setReducedMotion(true);
  const before = d.state.travel.slice();
  d.travel(-1, 0, 0.05);
  assert.ok(Math.hypot(d.state.travel[0] - before[0], d.state.travel[1] - before[1]) <= 0.15 * 0.05 + 1e-9);
});

test('reset restores the default ocean but keeps the comfort preference', () => {
  const d = new OceanDirector(42);
  d.setReducedMotion(true);
  d.selectDepth(1); run(d, 20); d.travel(1, 0, 0.05); d.setPaused(true);
  d.reset();
  assert.equal(d.state.depth, DEFAULT_DEPTH);
  assert.equal(d.state.depthLocked, false);
  assert.equal(d.state.paused, false);
  assert.deepEqual(d.state.travel, [0, 0]);
  assert.equal(d.state.reducedMotion, true);
});

test('overlapping bands use hysteresis', () => {
  assert.equal(bandFor(0.28, 'sunlit'), 'sunlit');
  assert.equal(bandFor(0.28, 'openBlue'), 'openBlue');
  assert.equal(bandFor(0.31, 'sunlit'), 'openBlue');
  assert.equal(bandFor(0.83, 'twilight'), 'twilight');
  assert.equal(bandFor(0.86, 'twilight'), 'midnight');
});

test('invalid deltas never rewind or explode', () => {
  const d = new OceanDirector(42);
  d.selectDepth(0.9);
  d.update(-1); d.update(NaN); d.update(Infinity);
  assert.ok(d.state.depth >= DEFAULT_DEPTH && d.state.depth <= DEFAULT_DEPTH + MAX_DEPTH_RATE * MAX_DT + 1e-9);
});
