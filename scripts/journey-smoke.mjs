import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const evidence = [];
function cli(domain, action, input, extra = []) {
  const args = ['node_modules/@iwsdk/cli/bin/iwsdk.js', domain, action];
  if (input) args.push('--input-json', JSON.stringify(input));
  args.push(...extra);
  const result = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 60000 }));
  evidence.push({ domain, action, input, result });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.data.result ?? result.data;
}
function check(condition, label) { if (!condition) throw new Error(label); console.log(`PASS ${label}`); }
function advance(frames) { while (frames > 0) { const count = Math.min(frames, 90); cli('ecs', 'step', { count, delta: 1 / 60 }); frames -= count; } }
try {
  const status = cli('xr', 'status');
  check(status.runtimeKind === 'emulated', 'Emulator selected');
  if (status.sessionActive) cli('xr', 'exit');
  cli('xr', 'enter');
  cli('xr', 'set-input-mode', { mode: 'hand' });
  const entityIndex = cli('ecs', 'find', { withComponents: ['AbyssSphere'] }).entities[0].entityIndex;
  const read = () => cli('ecs', 'query', { entityIndex }).components.find(c => c.componentId === 'AbyssSphere').values;
  const start = read();
  check(start.phase === 'room' && start.immersion === 0, 'New XR session starts in the room');
  const target = cli('xr', 'list-targets').targets.find(t => t.name === 'ABYSS sphere').position;
  cli('xr', 'look-at', { device: 'hand-right', target });
  cli('ecs', 'pause');
  cli('xr', 'set-select-value', { device: 'hand-right', value: 1 });
  advance(4);
  const entering = read();
  check(entering.phase === 'entering' && entering.immersion > 0 && entering.immersion < 0.02, 'Real hand pinch begins gradual entry');
  check(entering.interactions === start.interactions + 1, 'Pinch records exactly one event');
  advance(236);
  const half = read();
  check(half.immersion > 0.48 && half.immersion < 0.52, 'Halfway reveal is gradual');
  cli('browser', 'screenshot', {}, ['--output-file', 'artifacts/journey-halfway.png']);
  check(half.interactions === entering.interactions, 'Holding does not toggle repeatedly');
  cli('xr', 'set-select-value', { device: 'hand-right', value: 0 });
  advance(4);
  cli('xr', 'set-select-value', { device: 'hand-right', value: 1 });
  advance(4);
  const reverse = read();
  check(reverse.phase === 'returning' && reverse.immersion < half.immersion + 0.01, 'Second pinch reverses without a jump');
  cli('xr', 'set-select-value', { device: 'hand-right', value: 0 });
  advance(150);
  check(read().immersion === 0, 'Reverse reaches transparent room');
  cli('xr', 'look-at', { device: 'hand-left', target });
  cli('xr', 'set-select-value', { device: 'hand-left', value: 1 });
  advance(4);
  cli('xr', 'set-select-value', { device: 'hand-left', value: 0 });
  advance(480);
  check(read().phase === 'ocean' && read().immersion === 1, 'Left-hand pinch reaches full ocean');
  cli('browser', 'screenshot', {}, ['--output-file', 'artifacts/journey-ocean.png']);
  const unchanged = cli('xr', 'list-targets').targets.find(t => t.name === 'ABYSS sphere').position;
  check(Math.abs(unchanged.x - target.x) + Math.abs(unchanged.y - target.y) + Math.abs(unchanged.z - target.z) < 0.001, 'Interaction anchor stays fixed throughout journey');
  cli('ecs', 'resume');
  cli('xr', 'exit');
  check(read().phase === 'room' && read().immersion === 0, 'XR exit clears ocean');
  cli('xr', 'enter');
  check(read().immersion === 0, 'Re-entry does not unexpectedly immerse the viewer');
  console.log('Journey smoke passed. New transition still needs physical Quest review.');
} finally {
  try {
    if (cli('xr', 'status').sessionActive) {
      cli('xr', 'set-select-value', { device: 'hand-right', value: 0 });
      cli('xr', 'set-select-value', { device: 'hand-left', value: 0 });
    }
    cli('ecs', 'resume');
  } finally { writeFileSync('artifacts/journey-results.json', JSON.stringify(evidence, null, 2)); }
}
