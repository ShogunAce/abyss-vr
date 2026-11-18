// Fast visual check: reload, enter the ocean, screenshot a few views and depths, report console errors.
import { execFileSync } from 'node:child_process';
const out = process.argv[2] ?? 'artifacts/upgrade';
const t0 = Date.now();
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
const target = n => cli('xr', 'list-targets').targets.find(t => t.name === n)?.position;
cli('browser', 'reload');
execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},6000)']);
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
cli('xr', 'animate-to', { device: 'hand-right', position: { x: 0.3, y: 1.2, z: -0.5 }, duration: 0.3 });
execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},500)']);
advance(4);
shot('a-sunlit-forward');
cli('xr', 'look-at', { device: 'headset', target: { x: 0.5, y: -0.6, z: -6 } }); advance(0.5); shot('b-reef-mound');
cli('xr', 'look-at', { device: 'headset', target: { x: -6, y: 1.4, z: -3 } }); advance(0.5); shot('c-left-kelp');
cli('xr', 'look-at', { device: 'headset', target: { x: 0, y: 5, z: -2 } }); advance(0.5); shot('d-up-surface');
cli('xr', 'look-at', { device: 'headset', target: { x: 0, y: 1.4, z: -3 } });
command('depth:0.45'); advance(14); shot('e-open-blue');
command('depth:0.7'); advance(10); shot('f-twilight');
command('depth:0.95'); advance(10); shot('g-midnight');
cli('ecs', 'resume');
const logs = cli('browser', 'logs', { count: 200 });
const errors = logs.filter(e => e.level === 'error' && e.timestamp >= t0 && !(e.kind === 'requestfailed'));
console.log('errors', errors.length, errors.map(e => e.message).join(' | ').slice(0, 1500));
const warns = logs.filter(e => e.level === 'warning' && e.timestamp >= t0);
console.log('warnings', warns.length, warns.map(e => e.message).join(' | ').slice(0, 800));
