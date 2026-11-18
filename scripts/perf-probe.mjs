// Measures renderer cost (draw calls, triangles, points, programs, frame time) in
// emulated XR at each key state. Desktop emulator numbers are relative only:
// they are NOT Quest frame rates.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
function cli(domain, action, input) {
  const args = ['node_modules/@iwsdk/cli/bin/iwsdk.js', domain, action];
  if (input) args.push('--input-json', JSON.stringify(input));
  const result = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 90000 }));
  if (!result.ok) throw new Error(`${domain} ${action}: ${JSON.stringify(result.error).slice(0, 300)}`);
  return result.data.result ?? result.data;
}
const wait = ms => execFileSync(process.execPath, ['-e', `setTimeout(()=>{},${ms})`]);
const ocean = cli('ecs', 'find', { withComponents: ['OceanStatus'] }).entities[0].entityIndex;
const sphere = cli('ecs', 'find', { withComponents: ['AbyssSphere'] }).entities[0].entityIndex;
const command = value => cli('ecs', 'set-component', { entityIndex: ocean, componentId: 'OceanStatus', field: 'command', value });
const pick = r => {
  const info = r.renderer?.info ?? r.renderer ?? r.render ?? r;
  const render = info.render ?? info;
  const frames = r.frameTime ?? r.frameTimes ?? r.timing ?? {};
  return { calls: render.calls, triangles: render.triangles, points: render.points, lines: render.lines, programs: info.programs ?? r.programs, textures: info.memory?.textures ?? r.textures, frame: frames };
};
const rows = {};
function measure(label) { wait(2500); const r = cli('scene', 'render-stats'); rows[label] = pick(r); rows[label].raw = r; console.log(label, JSON.stringify(pick(r))); }

cli('ecs', 'resume');
if (cli('xr', 'status').sessionActive) cli('xr', 'exit');
cli('xr', 'enter');
cli('xr', 'set-input-mode', { mode: 'hand' });
cli('xr', 'look-at', { device: 'headset', target: { x: 0, y: 1.4, z: -1 } });
measure('room');
command('depth:0.15');
const s = cli('xr', 'list-targets').targets.find(t => t.name === 'ABYSS sphere').position;
cli('xr', 'look-at', { device: 'hand-right', target: s });
cli('xr', 'set-select-value', { device: 'hand-right', value: 1 }); wait(300); cli('xr', 'set-select-value', { device: 'hand-right', value: 0 });
wait(9500);
cli('xr', 'look-at', { device: 'hand-right', target: { x: 0.8, y: 2.2, z: -1 } });
measure('sunlit');
command('depth:0.45'); wait(12000); measure('openBlue');
command('depth:0.95'); wait(16000); measure('midnight');
cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'open' }); wait(1200);
cli('xr', 'set-select-value', { device: 'hand-right', value: 1 }); wait(250); cli('xr', 'set-select-value', { device: 'hand-right', value: 0 });
cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'default' });
wait(5000); measure('reveal');
cli('xr', 'exit');
writeFileSync('artifacts/perf-results.json', JSON.stringify(rows, null, 2));
