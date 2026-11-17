import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const cliPath = 'node_modules/@iwsdk/cli/bin/iwsdk.js';
const evidence = [];
function cli(domain, action, input) {
  const args = [cliPath, domain, action];
  if (input) args.push('--input-json', JSON.stringify(input));
  const result = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 60000 }));
  evidence.push({ domain, action, input, result });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.data.result ?? result.data;
}
function check(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}
try {
  let status = cli('xr', 'status');
  check(status.runtimeKind === 'emulated', 'Testing emulator only');
  if (!status.sessionActive) cli('xr', 'enter');
  cli('xr', 'set-input-mode', { mode: 'hand' });
  const entityIndex = cli('ecs', 'find', { withComponents: ['AbyssSphere'] }).entities[0].entityIndex;
  const read = () => cli('ecs', 'query', { entityIndex }).components.find(c => c.componentId === 'AbyssSphere').values;
  const initialCount = read().interactions;
  const target = cli('xr', 'list-targets').targets.find(t => t.name === 'ABYSS sphere').position;
  for (const [index, device] of ['hand-right', 'hand-left'].entries()) {
    cli('xr', 'look-at', { device, target });
    cli('xr', 'select', { device, duration: 0.2 });
    check(read().interactions === initialCount + index + 1, `${device}: exactly one event`);
  }
  cli('ecs', 'pause');
  cli('xr', 'set-select-value', { device: 'hand-right', value: 1 });
  cli('ecs', 'step', { count: 4 });
  const pulse = read();
  check(pulse.interactions === initialCount + 3 && pulse.pulse > 0, 'Pinch starts feedback');
  cli('ecs', 'step', { count: 90 });
  const held = read();
  check(held.interactions === pulse.interactions && held.pulse === 0, 'Holding does not repeat; pulse settles');
  cli('xr', 'set-select-value', { device: 'hand-right', value: 0 });
  cli('ecs', 'resume');
  for (const device of ['hand-left', 'hand-right']) cli('xr', 'set-connected', { device, connected: false });
  check(cli('xr', 'status').sessionActive, 'XR survives loss of both hand sources');
  const snapshot = cli('browser', 'snapshot');
  check(snapshot.elements.some(e => e.role === 'status' && e.text.includes('Hands unavailable')), 'Missing hands reported honestly');
  for (const device of ['hand-left', 'hand-right']) cli('xr', 'set-connected', { device, connected: true });
  cli('xr', 'look-at', { device: 'hand-right', target });
  cli('xr', 'select', { device: 'hand-right', duration: 0.2 });
  check(read().interactions === initialCount + 4, 'Hand input recovers after reconnection');
  cli('xr', 'look-at', { device: 'headset', target: { x: 0.3, y: target.y, z: target.z } });
  const after = cli('xr', 'list-targets').targets.find(t => t.name === 'ABYSS sphere').position;
  check(Math.abs(after.x - target.x) + Math.abs(after.y - target.y) + Math.abs(after.z - target.z) < 0.001, 'Head rotation leaves sphere world-fixed');
  cli('xr', 'look-at', { device: 'headset', target: { x: 0, y: 1.6, z: -1 } });
  cli('xr', 'exit');
  check(!cli('xr', 'status').sessionActive, 'XR exits cleanly');
  cli('xr', 'enter');
  check(cli('xr', 'status').sessionActive, 'XR re-enters cleanly');
  cli('xr', 'exit');
  const logs = cli('browser', 'logs', { count: 100 });
  // Requests cancelled by a page reload/navigation are not application errors.
  const navigationAbort = entry => entry.kind === 'requestfailed' && entry.failure === 'net::ERR_ABORTED';
  check(!logs.some(entry => entry.level === 'error' && !navigationAbort(entry)), 'No browser console errors');
  console.log('Emulated smoke test passed. Physical Quest remains unverified.');
} finally {
  try {
    if (cli('xr', 'status').sessionActive) {
      cli('xr', 'set-select-value', { device: 'hand-right', value: 0 });
      cli('xr', 'set-select-value', { device: 'hand-left', value: 0 });
    }
    cli('ecs', 'resume');
  } catch { /* retain original failure; evidence contains cleanup result */ }
  writeFileSync('artifacts/qa-results.json', JSON.stringify(evidence, null, 2));
}
