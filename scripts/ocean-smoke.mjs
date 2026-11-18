// Phase 1 live emulator test: persistent ocean, depth panel, lock, reversal,
// bounded travel, pause, reset, re-entry. Uses real IWER hand pinches through the
// official CLI; debug depth commands go through OceanStatus.command only where the
// spec's test input asks for an arbitrary value (0.30).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const evidence = [];
const testStartedAt = Date.now(); // console checks only count errors logged during this run
function cli(domain, action, input) {
  const args = ['node_modules/@iwsdk/cli/bin/iwsdk.js', domain, action];
  if (input) args.push('--input-json', JSON.stringify(input));
  const result = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 60000 }));
  evidence.push({ domain, action, input, result });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.data.result ?? result.data;
}
function check(condition, label, detail = '') { if (!condition) throw new Error(`${label} ${detail}`); console.log(`PASS ${label}${detail ? ` (${detail})` : ''}`); }
function advance(frames) { while (frames > 0) { const count = Math.min(frames, 90); cli('ecs', 'step', { count, delta: 1 / 60 }); frames -= count; } }
const values = (index, id) => cli('ecs', 'query', { entityIndex: index }).components.find(c => c.componentId === id).values;
const target = name => cli('xr', 'list-targets').targets.find(t => t.name === name)?.position;
function pinch(device, name) {
  const position = target(name);
  if (!position) throw new Error(`target not found: ${name}`);
  cli('xr', 'look-at', { device, target: position });
  cli('xr', 'set-select-value', { device, value: 1 }); advance(3);
  cli('xr', 'set-select-value', { device, value: 0 }); advance(3);
}

try {
  check(cli('xr', 'status').runtimeKind === 'emulated', 'Emulator selected');
  if (cli('xr', 'status').sessionActive) cli('xr', 'exit');
  cli('xr', 'enter');
  cli('xr', 'set-input-mode', { mode: 'hand' });
  const ocean = cli('ecs', 'find', { withComponents: ['OceanStatus'] }).entities[0].entityIndex;
  const sphere = cli('ecs', 'find', { withComponents: ['AbyssSphere'] }).entities[0].entityIndex;
  const status = () => values(ocean, 'OceanStatus');
  const command = value => cli('ecs', 'set-component', { entityIndex: ocean, componentId: 'OceanStatus', field: 'command', value });
  cli('ecs', 'pause');

  let s = status();
  check(s.band === 'sunlit' && Math.abs(s.depth - 0.15) < 1e-3 && !s.panelVisible, 'Session starts sunlit at 0.15, panel hidden');
  check(s.oceanInstances === 1, 'Exactly one ocean instance');

  pinch('hand-right', 'ABYSS sphere');
  advance(60 * 9);
  check(values(sphere, 'AbyssSphere').immersion === 1, 'Room-to-ocean entry still works');
  s = status();
  check(s.panelVisible, 'Depth compass offered in the ocean');
  const travelBefore = [s.travelX, s.travelZ];

  pinch('hand-right', 'Depth control Midnight');
  s = status();
  check(s.depthLocked && Math.abs(s.targetDepth - 0.95) < 1e-3, 'Right-hand pinch on Midnight sets locked target', `target ${s.targetDepth}`);
  check(s.travelX === travelBefore[0] && s.travelZ === travelBefore[1], 'Panel pinch did not trigger travel');

  advance(60 * 2);
  const early = status().depth;
  check(early > 0.15 && early < 0.4, 'Midnight transition is gradual', `depth ${early.toFixed(3)} after 2 s`);
  let previous = early, maxStep = 0;
  while (status().depth < 0.55) { advance(30); const d = status().depth; maxStep = Math.max(maxStep, d - previous); previous = d; }
  s = status();
  check(maxStep <= 0.07 * 0.5 + 1e-3, 'No depth jumps on the way down', `max ${maxStep.toFixed(4)} per 0.5 s`);
  command('depth:0.3');
  advance(30);
  const afterReverse = status().depth;
  check(afterReverse < s.depth + 0.002 && afterReverse > s.depth - 0.04, 'Reversal mid-transition is continuous', `${s.depth.toFixed(3)} → ${afterReverse.toFixed(3)}`);
  advance(60 * 25);
  s = status();
  check(Math.abs(s.depth - 0.3) < 0.002 && Math.abs(s.targetDepth - 0.3) < 1e-4, 'Settles at reversed target 0.30', `depth ${s.depth.toFixed(4)}`);
  advance(60 * 90);
  check(Math.abs(status().targetDepth - 0.3) < 1e-4 && status().depthLocked, 'User lock holds against automatic change for 90 s');

  pinch('hand-left', 'Depth control Sunlit');
  check(Math.abs(status().targetDepth - 0.15) < 1e-3, 'Left-hand panel pinch works');

  // Bounded hand-directed travel: pinch while pointing at open water.
  const headBefore = cli('xr', 'get-transform', { device: 'headset' });
  cli('xr', 'look-at', { device: 'hand-right', target: { x: 3, y: 1.2, z: 1.5 } });
  cli('xr', 'set-select-value', { device: 'hand-right', value: 1 });
  advance(60);
  s = status();
  const moved = Math.hypot(s.travelX - travelBefore[0], s.travelZ - travelBefore[1]);
  check(s.interactionMode === 'travel' && moved > 0.2 && moved < 0.45, 'Pinch on open water travels gently', `${moved.toFixed(3)} m in 1 s`);
  cli('xr', 'set-select-value', { device: 'hand-right', value: 0 });
  advance(2);
  const stopped = status();
  advance(60);
  const later = status();
  check(later.travelX === stopped.travelX && later.travelZ === stopped.travelZ && later.interactionMode === 'world', 'Travel stops on release');
  const headAfter = cli('xr', 'get-transform', { device: 'headset' });
  check(JSON.stringify(headAfter.position) === JSON.stringify(headBefore.position), 'Camera/headset pose never moved');

  command('pause');
  advance(1);
  const paused = status();
  command('depth:1');
  advance(120);
  s = status();
  check(s.paused && s.depth === paused.depth, 'Pause freezes depth progression');
  command('resume');
  advance(60);
  check(status().depth > paused.depth, 'Resume continues the transition');

  command('reset');
  advance(2);
  s = status();
  check(Math.abs(s.depth - 0.15) < 1e-3 && !s.depthLocked && s.travelX === 0 && s.travelZ === 0 && s.oceanInstances === 1, 'Reset restores default ocean, no duplicates');

  command('depth:1');
  advance(120);
  check(status().depth > 0.2, 'Ocean left in a non-default state before exit');
  cli('ecs', 'resume');
  cli('xr', 'exit');
  cli('xr', 'enter');
  cli('ecs', 'pause');
  advance(2);
  s = status();
  cli('ecs', 'resume');
  check(s.band === 'sunlit' && s.oceanInstances === 1 && s.travelX === 0, 'Re-entry starts a fresh sunlit ocean');
  cli('xr', 'exit');
  const logs = cli('browser', 'logs', { count: 150 });
  const navigationAbort = e => e.kind === 'requestfailed' && e.failure === 'net::ERR_ABORTED';
  check(!logs.some(e => e.level === 'error' && e.timestamp >= testStartedAt && !navigationAbort(e)), 'No browser console errors');
  console.log('Ocean smoke passed. Physical Quest review still required.');
} finally {
  try { cli('xr', 'set-select-value', { device: 'hand-right', value: 0 }); cli('xr', 'set-select-value', { device: 'hand-left', value: 0 }); } catch {}
  try { cli('ecs', 'resume'); } catch {}
  writeFileSync('artifacts/ocean-results.json', JSON.stringify(evidence, null, 2));
}
