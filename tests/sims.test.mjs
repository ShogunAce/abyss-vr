import assert from 'node:assert/strict';
import test from 'node:test';
import { HandGesture, arbitratePinch } from '../src/sim/gesture.ts';
import { Flock } from '../src/sim/flock.ts';
import { SharkBrain, SHARK } from '../src/sim/shark.ts';
import { EncounterScheduler } from '../src/sim/encounters.ts';
import { BiolumField, REVEAL } from '../src/sim/biolum.ts';
import { NamiGuide } from '../src/sim/nami.ts';

const sample = (x, y, z, extra = {}) => ({ tracked: true, x, y, z, extended: 1, pinchDistance: 0.02, select: false, ...extra });

test('gesture: 0.1 m/s is slow, 1 m/s is one fast sweep, no toggling from noise', () => {
  const g = new HandGesture();
  let x = 0;
  for (let i = 0; i < 72; i++) { x += 0.1 / 72; g.update(sample(x, 1.2, -0.4), 1 / 72); }
  assert.equal(g.motion, 'slow');
  let sweeps = 0;
  for (let i = 0; i < 36; i++) { x += 1 / 72; g.update(sample(x, 1.2, -0.4), 1 / 72); if (g.sweep) sweeps++; }
  assert.equal(g.motion, 'fast');
  assert.equal(sweeps, 1);
  // Noisy jitter (±3 mm) at rest never produces a sweep or 'fast'.
  for (let i = 0; i < 300; i++) { g.update(sample(x + (i % 2 ? 0.003 : -0.003), 1.2, -0.4), 1 / 72); assert.equal(g.sweep, false); }
  assert.notEqual(g.motion, 'fast');
});

test('gesture: tracking loss and reacquire far away never fires a sweep', () => {
  const g = new HandGesture();
  for (let i = 0; i < 60; i++) g.update(sample(0, 1, 0), 1 / 72);
  g.update({ ...sample(0, 1, 0), tracked: false }, 1 / 72);
  let sweeps = 0;
  g.update(sample(0.8, 1.3, -0.5), 1 / 72);
  for (let i = 0; i < 60; i++) { g.update(sample(0.8, 1.3, -0.5), 1 / 72); if (g.sweep) sweeps++; }
  assert.equal(sweeps, 0);
});

test('gesture: 30 Hz pose updates at 60 fps still detect a real sweep', () => {
  const g = new HandGesture();
  let x = 0;
  for (let i = 0; i < 60; i++) g.update(sample(x, 1.2, -0.4), 1 / 60);
  let sweeps = 0;
  for (let i = 0; i < 24; i++) { if (i % 2 === 0) x += 2.3 / 30; g.update(sample(x, 1.2, -0.4), 1 / 60); if (g.sweep) sweeps++; }
  assert.equal(sweeps, 1);
});

test('gesture: an implausible jump (tracking glitch) is not a sweep', () => {
  const g = new HandGesture();
  for (let i = 0; i < 60; i++) g.update(sample(0, 1, 0), 1 / 60);
  let sweeps = 0;
  g.update(sample(0.6, 1, 0), 1 / 60); if (g.sweep) sweeps++;
  for (let i = 0; i < 60; i++) { g.update(sample(0.6, 1, 0), 1 / 60); if (g.sweep) sweeps++; }
  assert.equal(sweeps, 0);
  assert.equal(g.speed < 0.05, true);
});

test('gesture: open palm needs a stable hold and releases with hysteresis', () => {
  const g = new HandGesture();
  for (let i = 0; i < 30; i++) g.update(sample(0, 1, 0), 1 / 72); // settle
  for (let i = 0; i < 10; i++) g.update(sample(0, 1, 0, { extended: 4, pinchDistance: 0.127, spread: 0.132 }), 1 / 72);
  assert.equal(g.openPalm, false, 'brief flash of an open hand is ignored');
  for (let i = 0; i < 30; i++) g.update(sample(0, 1, 0, { extended: 4, pinchDistance: 0.127, spread: 0.132 }), 1 / 72);
  assert.equal(g.openPalm, true);
  g.update(sample(0, 1, 0), 1 / 72);
  assert.equal(g.openPalm, true, 'one closed frame does not cancel');
  for (let i = 0; i < 20; i++) g.update(sample(0, 1, 0), 1 / 72);
  assert.equal(g.openPalm, false);
  // IWER's relaxed default hand (measured: 4 extended, 0.094 m thumb gap, 0.103 m spread) is not an open palm.
  for (let i = 0; i < 60; i++) g.update(sample(0, 1, 0, { extended: 4, pinchDistance: 0.094, spread: 0.103 }), 1 / 72);
  assert.equal(g.openPalm, false);
});

test('arbiter priority: targets > pulse > travel', () => {
  const base = { rayOnTarget: false, immersed: true, paused: false, pulseArmed: false, otherHandTravelling: false };
  assert.equal(arbitratePinch({ ...base, rayOnTarget: true, pulseArmed: true }), 'target');
  assert.equal(arbitratePinch({ ...base, pulseArmed: true }), 'pulse');
  assert.equal(arbitratePinch(base), 'travel');
  assert.equal(arbitratePinch({ ...base, paused: true }), 'none');
  assert.equal(arbitratePinch({ ...base, immersed: false }), 'none');
  assert.equal(arbitratePinch({ ...base, otherHandTravelling: true }), 'none');
});

test('flock: slow hand attracts, fast sweep scatters, school regroups', () => {
  const f = new Flock(56);
  for (let i = 0; i < 600; i++) f.update(1 / 60);
  const hand = { x: f.home.x + 0.8, y: f.home.y, z: f.home.z + 0.4 };
  const before = f.meanDistance(hand.x, hand.y, hand.z);
  f.hands[0] = { active: true, ...hand };
  for (let i = 0; i < 240; i++) f.update(1 / 60);
  const attracted = f.meanDistance(hand.x, hand.y, hand.z);
  assert.ok(attracted < before - 0.1, `attraction ${before.toFixed(2)} → ${attracted.toFixed(2)}`);
  assert.equal(f.state, 'attracted');
  f.hands[0].active = false;
  const calmSpeed = f.meanSpeed();
  f.scatter(hand.x, hand.y, hand.z);
  for (let i = 0; i < 20; i++) f.update(1 / 60);
  assert.equal(f.state, 'scattering');
  assert.ok(f.meanSpeed() > calmSpeed * 1.3, 'scatter is visibly faster');
  assert.ok(f.meanDistance(hand.x, hand.y, hand.z) > attracted + 0.1, 'fish move away');
  for (let i = 0; i < 600; i++) f.update(1 / 60);
  assert.equal(f.state, 'schooling');
  assert.ok(f.meanSpeed() <= 0.8, 'calm again');
  for (let i = 0; i < f.activeCount * 3; i++) assert.ok(Number.isFinite(f.pos[i]));
});

test('flock: viewer keep-out and bounded steps', () => {
  const f = new Flock(56);
  f.home = { x: 0, y: 1.5, z: -0.6, radius: 0.8 };
  for (let i = 0; i < 1200; i++) f.update(1 / 60);
  assert.ok(f.minDistance(0, 1.5, 0) > 0.3, `closest ${f.minDistance(0, 1.5, 0).toFixed(2)}`);
  f.update(10); // a huge frame gap is bounded
  for (let i = 0; i < f.capacity * 3; i++) assert.ok(Number.isFinite(f.pos[i]));
});

test('shark: seed 42 showcase at depth 0.45 → states, threat response, comfort radius, completion', () => {
  const s = new EncounterScheduler(42, true);
  const flock = new Flock(56);
  flock.home = { x: 0, y: 1.4, z: -2.4, radius: 1.4 };
  const shark = new SharkBrain();
  shark.viewer = { x: 0, y: 1.5, z: 0 };
  let started = null, time = 0, maxThreat = 0, completed = false;
  for (let i = 0; i < 60 * 200 && !completed; i++) {
    const dt = 1 / 60; time += dt;
    const id = s.update(time, dt, 0.45, new Set());
    if (id === 'shark_pass') { started = time; shark.focus = { x: flock.home.x, y: flock.home.y, z: flock.home.z }; shark.start(-Math.PI / 2 + (s.next() - 0.5) * 1.6); }
    shark.update(dt);
    flock.threat.active = shark.active; flock.threat.x = shark.x; flock.threat.y = shark.y; flock.threat.z = shark.z;
    flock.update(dt);
    maxThreat = Math.max(maxThreat, flock.threatLevel);
    if (shark.state === 'done' && s.active) { s.finish(time); completed = true; }
  }
  assert.ok(started !== null && started < 10, `showcase shark starts quickly (${started})`);
  for (const st of ['cruise', 'notice', 'investigate', 'turnAway', 'done']) assert.ok(shark.statesVisited.includes(st), `visited ${st}`);
  assert.ok(shark.minViewerDistance >= SHARK.comfortRadius - 1e-6, `comfort ${shark.minViewerDistance.toFixed(2)}`);
  assert.ok(maxThreat > 0.2, `fish felt the threat (${maxThreat.toFixed(2)})`);
  assert.ok(completed && s.history.some(e => e.type === 'complete' && e.id === 'shark_pass'));
  assert.equal(s.history.filter(e => e.type === 'start' && e.id === 'shark_pass').length, 1, 'no duplicate spawns');
});

test('scheduler: same seed reproduces, ineligible depth never spawns, cooldown and timeout', () => {
  const run = () => { const s = new EncounterScheduler(42, false); const ids = []; let t = 0;
    for (let i = 0; i < 60 * 600; i++) { t += 1 / 60; const id = s.update(t, 1 / 60, 0.2, new Set()); if (id) ids.push([id, t.toFixed(2)]); if (s.active && t - s.active.startedAt > 20) s.finish(t); }
    return ids; };
  assert.deepEqual(run(), run());
  const deep = new EncounterScheduler(1, false); let t = 0;
  for (let i = 0; i < 60 * 300; i++) { t += 1 / 60; assert.equal(deep.update(t, 1 / 60, 0.95, new Set()), null); }
  const timeout = new EncounterScheduler(3, true); t = 0;
  for (let i = 0; i < 60 * 200; i++) { t += 1 / 60; timeout.update(t, 1 / 60, 0.1, new Set()); }
  assert.ok(timeout.history.some(e => e.type === 'timeout'), 'stuck encounter times out');
  assert.equal(timeout.active === null || t - timeout.active.startedAt <= 70 + 1, true);
});

test('biolum: depth 0.95, palm then one pulse → wavefront order, reveal completes, cooldown', () => {
  const b = new BiolumField(64);
  b.enabled = 1;
  b.palm = { active: true, x: 0, y: 1.2, z: -0.4 };
  b.pos[0] = 0.3; b.pos[1] = 1.2; b.pos[2] = -0.4; // one organism near the palm
  for (let i = 0; i < 30; i++) b.update(1 / 60, 0.95);
  assert.ok(b.glow[0] > 0.2, 'palm light wakes nearby organism');
  b.palm.active = false;
  assert.equal(b.emitPulse(0, 1.2, -0.4), true);
  assert.equal(b.emitPulse(0, 1.2, -0.4), false, 'one pulse per release / cooldown');
  for (let i = 0; i < 60 * 6; i++) b.update(1 / 60, 0.95);
  assert.equal(b.pulseCount, 1);
  const d = i => Math.hypot(b.pos[i * 3], b.pos[i * 3 + 1] - 1.2, b.pos[i * 3 + 2] + 0.4);
  for (let k = 1; k < b.responseOrder.length; k++) assert.ok(d(b.responseOrder[k]) >= d(b.responseOrder[k - 1]) - 0.06, 'wavefront order');
  assert.ok(b.responseOrder.length > 20);
  assert.ok(['emerging', 'revealed'].includes(b.hero.state));
  for (let i = 0; i < 60 * (REVEAL.emerge + 1); i++) b.update(1 / 60, 0.95);
  assert.equal(b.hero.state, 'revealed');
  assert.equal(b.hero.level, 1);
});

test('biolum: no reveal in shallow water', () => {
  const b = new BiolumField(32);
  b.emitPulse(0, 1.2, 0);
  for (let i = 0; i < 60 * 8; i++) b.update(1 / 60, 0.3);
  assert.equal(b.hero.state, 'hidden');
});

test('NAMI: rate-limited, once-only lines, high priority interrupts, dismiss and mute', () => {
  const n = new NamiGuide();
  assert.ok(n.notify('welcome', 0));
  assert.equal(n.notify('welcome', 30), false, 'once');
  assert.equal(n.notify('sweep', 2), false, 'too soon for a low-priority line');
  assert.ok(n.notify('shark', 3), 'high priority interrupts');
  n.dismiss(); assert.equal(n.current, null);
  n.setMuted(true); assert.equal(n.notify('midnight', 100), false);
});
