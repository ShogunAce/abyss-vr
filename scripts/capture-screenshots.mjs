// Captures submission screenshots of the ABYSS arc in the IWER emulator (hands mode).
import { execFileSync } from 'node:child_process';
const out = process.argv[2] ?? 'submission/screenshots';
function cli(domain, action, input, extra = []) {
  const args = ['node_modules/@iwsdk/cli/bin/iwsdk.js', domain, action];
  if (input) args.push('--input-json', JSON.stringify(input));
  args.push(...extra);
  const r = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 90000 }));
  if (!r.ok) throw new Error(`${domain} ${action}: ${JSON.stringify(r.error).slice(0, 300)}`);
  return r.data.result ?? r.data;
}
function advance(s) { let f = Math.round(s * 60); while (f > 0) { const c = Math.min(f, 120); cli('ecs', 'step', { count: c, delta: 1 / 60 }); f -= c; } }
const wait = ms => execFileSync(process.execPath, ['-e', `setTimeout(()=>{},${ms})`]);
const shot = name => { cli('browser', 'screenshot', {}, ['--output-file', `${out}/${name}.png`]); console.log('shot', name); };
const ocean = () => cli('ecs', 'find', { withComponents: ['OceanStatus'] }).entities[0].entityIndex;
const status = () => cli('ecs', 'query', { entityIndex: ocean() }).components.find(c => c.componentId === 'OceanStatus').values;
const command = v => cli('ecs', 'set-component', { entityIndex: ocean(), componentId: 'OceanStatus', field: 'command', value: v });
const target = n => cli('xr', 'list-targets').targets.find(t => t.name === n)?.position;
function until(p, max, step = 0.5) { for (let t = 0; t < max; t += step) { const s = status(); if (p(s)) return s; advance(step); } return status(); }
function pinchAt(device, name) { const p = target(name); if (!p) return; cli('xr', 'look-at', { device, target: p }); advance(0.1); cli('xr', 'set-select-value', { device, value: 1 }); advance(0.1); cli('xr', 'set-select-value', { device, value: 0 }); advance(0.1); }

cli('ecs', 'resume');
if (cli('xr', 'status').sessionActive) cli('xr', 'exit');
command('clear-discoveries');
cli('xr', 'enter');
cli('xr', 'set-input-mode', { mode: 'hand' });
cli('ecs', 'pause');
for (const d of ['hand-left', 'hand-right']) cli('xr', 'set-hand-pose', { device: d, poseId: 'default' });
cli('xr', 'animate-to', { device: 'hand-right', position: { x: 0.18, y: 1.15, z: -0.35 }, duration: 0.3 }); wait(400);
cli('xr', 'look-at', { device: 'hand-right', target: target('ABYSS sphere') });
advance(3);
shot('01-room-sphere');
// Halfway reveal
cli('xr', 'set-select-value', { device: 'hand-right', value: 1 }); advance(0.1);
cli('xr', 'set-select-value', { device: 'hand-right', value: 0 });
advance(4);
shot('02-room-to-ocean');
advance(6);
// Hand near school
cli('xr', 'animate-to', { device: 'hand-right', position: { x: 0.3, y: 1.2, z: -0.5 }, duration: 0.6 }); wait(800);
until(v => v.schoolState === 'attracted', 8);
advance(2);
shot('03-sunlit-reef-school');
cli('xr', 'look-at', { device: 'headset', target: { x: 0, y: -1.2, z: -5 } });
advance(1);
shot('04-living-reef');
cli('xr', 'look-at', { device: 'headset', target: { x: 0, y: 1.4, z: -3 } });
until(v => v.encounter === 'turtle_pass', 20);
advance(8);
const turtle = target('Green sea turtle');
if (turtle) cli('xr', 'look-at', { device: 'headset', target: turtle });
advance(0.5);
shot('05-turtle-encounter');
pinchAt('hand-right', 'Green sea turtle');
advance(0.6);
shot('06-discovery-card');
pinchAt('hand-right', 'Discovery card');
command('depth:0.45');
let s = until(v => v.sharkState === 'investigate' || v.sharkState === 'notice', 90, 1);
const shark = target('Grey reef shark');
if (shark) cli('xr', 'look-at', { device: 'headset', target: shark });
advance(0.3);
shot('07-open-blue-shark');
until(v => v.encounter === 'none', 90, 2);
command('depth:0.7');
until(v => v.depth > 0.68, 20, 1);
cli('xr', 'look-at', { device: 'headset', target: { x: 0, y: 1.3, z: -3 } });
advance(1);
shot('08-twilight');
command('depth:0.95');
until(v => v.depth > 0.93, 30, 1);
cli('xr', 'look-at', { device: 'headset', target: { x: 0.3, y: 1.6, z: -3 } });
cli('xr', 'animate-to', { device: 'hand-right', position: { x: 0.2, y: 1.35, z: -0.4 }, duration: 0.3 }); wait(400);
cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'open' }); wait(500);
advance(1.5);
shot('09-midnight-palm-light');
cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'pinch' });
cli('xr', 'set-select-value', { device: 'hand-right', value: 1 }); advance(0.2);
cli('xr', 'set-select-value', { device: 'hand-right', value: 0 }); advance(0.6);
cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'default' });
shot('10-bioluminescent-pulse');
until(v => v.revealState === 'revealed', 15);
const squid = target('Giant squid');
if (squid) cli('xr', 'look-at', { device: 'headset', target: squid });
advance(0.5);
shot('11-giant-squid-reveal');
cli('ecs', 'resume');
console.log('done');
