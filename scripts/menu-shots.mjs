// Screenshots of the exploration features: Dive menu pages, a dive marker card, and living light at midnight.
import { execFileSync } from 'node:child_process';
const out = process.argv[2] ?? 'artifacts/upgrade';
function cli(domain, action, input, extra = []) {
  const args = ['node_modules/@iwsdk/cli/bin/iwsdk.js', domain, action];
  if (input) args.push('--input-json', JSON.stringify(input));
  args.push(...extra);
  const r = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 90000 }));
  if (!r.ok) throw new Error(`${domain} ${action}: ${JSON.stringify(r.error).slice(0, 300)}`);
  return r.data.result ?? r.data;
}
function advance(s) { let f = Math.round(s * 60); while (f > 0) { const c = Math.min(f, 120); cli('ecs', 'step', { count: c, delta: 1 / 60 }); f -= c; } }
const shot = name => { cli('browser', 'screenshot', {}, ['--output-file', `${out}/${name}.png`]); console.log('shot', name); };
const ocean = () => cli('ecs', 'find', { withComponents: ['OceanStatus'] }).entities[0].entityIndex;
const command = v => cli('ecs', 'set-component', { entityIndex: ocean(), componentId: 'OceanStatus', field: 'command', value: v });
const status = () => cli('ecs', 'query', { entityIndex: ocean() }).components.find(c => c.componentId === 'OceanStatus').values;
const target = n => cli('xr', 'list-targets').targets.find(t => t.name === n)?.position;

cli('browser', 'reload');
cli('runtime', 'wait', {}, ['--timeout', '60000']);
cli('ecs', 'resume');
if (cli('xr', 'status').sessionActive) cli('xr', 'exit');
cli('xr', 'enter');
cli('xr', 'set-input-mode', { mode: 'hand' });
cli('ecs', 'pause');
advance(1);
cli('xr', 'look-at', { device: 'hand-right', target: target('ABYSS sphere') });
cli('xr', 'set-select-value', { device: 'hand-right', value: 1 }); advance(0.1);
cli('xr', 'set-select-value', { device: 'hand-right', value: 0 });
advance(10);
cli('xr', 'animate-to', { device: 'hand-right', position: { x: 0.3, y: 1.1, z: -0.3 }, duration: 0.2 });
const menu = target('Depth control Hand signs');
for (const page of ['signs', 'journal', 'controls']) {
  command(`page:${page}`); advance(0.4);
  cli('xr', 'look-at', { device: 'headset', target: menu });
  advance(0.3); shot(`menu-${page}`);
}
// Swim to the first sunlit marker and capture its card.
const head = cli('xr', 'get-transform', { device: 'headset' }).position;
cli('xr', 'look-at', { device: 'headset', target: { x: head.x - 2.6, y: head.y - 0.4, z: head.z - 2.2 } });
advance(0.3); shot('marker-beacon');
cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'point' });
for (let t = 0; t < 20; t++) {
  const v = status();
  if (v.markers > 0 && t > 2) break;
  cli('xr', 'look-at', { device: 'hand-right', target: { x: head.x - 2.6 - v.travelX, y: head.y - 0.6, z: head.z - 2.2 - v.travelZ } });
  advance(1);
}
cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'default' });
advance(0.5);
const card = target('Discovery card');
if (card) { cli('xr', 'look-at', { device: 'headset', target: card }); advance(0.3); shot('marker-card'); }
// Midnight living light: move a hand through the water.
command('reset'); command('depth:0.95'); advance(25);
cli('xr', 'look-at', { device: 'headset', target: { x: 0.2, y: head.y - 0.2, z: -1 } });
cli('ecs', 'resume');
cli('xr', 'animate-to', { device: 'hand-right', position: { x: -0.2, y: 1.35, z: -0.55 }, duration: 0.6 });
cli('xr', 'animate-to', { device: 'hand-left', position: { x: 0.25, y: 1.3, z: -0.5 }, duration: 0.6 });
shot('midnight-living-light');
cli('ecs', 'pause');
cli('ecs', 'resume');
console.log('done');
