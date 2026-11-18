// End-to-end emulator run of the ABYSS arc with real IWER hand input:
// open-palm entry → fish attract/scatter → turtle discovery → shark encounter →
// midnight palm light + pulse → squid reveal + discovery → pause/restart/tracking loss/exit.
// Depth jumps use OceanStatus.command (the same path as the Depth Compass buttons).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const evidence = [];
const testStartedAt = Date.now(); // console checks only count errors logged during this run
function cli(domain, action, input) {
  const args = ['node_modules/@iwsdk/cli/bin/iwsdk.js', domain, action];
  if (input) args.push('--input-json', JSON.stringify(input));
  const result = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 90000 }));
  evidence.push({ domain, action, input, ok: result.ok });
  if (!result.ok) throw new Error(`${domain} ${action}: ${JSON.stringify(result.error).slice(0, 400)}`);
  return result.data.result ?? result.data;
}
const results = [];
function check(condition, label, detail = '') {
  results.push({ label, pass: !!condition, detail });
  if (!condition) throw new Error(`${label} ${detail}`);
  console.log(`PASS ${label}${detail ? ` (${detail})` : ''}`);
}
function advance(seconds) { let frames = Math.round(seconds * 60); while (frames > 0) { const count = Math.min(frames, 120); cli('ecs', 'step', { count, delta: 1 / 60 }); frames -= count; } }
const wait = ms => execFileSync(process.execPath, ['-e', `setTimeout(()=>{},${ms})`]);
let ocean, sphere;
const status = () => cli('ecs', 'query', { entityIndex: ocean }).components.find(c => c.componentId === 'OceanStatus').values;
const sphereState = () => cli('ecs', 'query', { entityIndex: sphere }).components.find(c => c.componentId === 'AbyssSphere').values;
const command = value => cli('ecs', 'set-component', { entityIndex: ocean, componentId: 'OceanStatus', field: 'command', value });
const targetPos = name => cli('xr', 'list-targets').targets.find(t => t.name === name)?.position;
function until(predicate, maxSeconds, step = 0.5) { for (let t = 0; t < maxSeconds; t += step) { const s = status(); if (predicate(s)) return s; advance(step); } return status(); }
function pinchAt(device, name) {
  const p = targetPos(name);
  if (!p) throw new Error(`no target ${name}`);
  cli('xr', 'look-at', { device, target: p });
  advance(0.1);
  cli('xr', 'set-select-value', { device, value: 1 }); advance(0.1);
  cli('xr', 'set-select-value', { device, value: 0 }); advance(0.1);
}

try {
  check(cli('xr', 'status').runtimeKind === 'emulated', 'Emulator selected');
  cli('ecs', 'resume');
  if (cli('xr', 'status').sessionActive) cli('xr', 'exit');
  ocean = cli('ecs', 'find', { withComponents: ['OceanStatus'] }).entities[0].entityIndex;
  sphere = cli('ecs', 'find', { withComponents: ['AbyssSphere'] }).entities[0].entityIndex;
  command('clear-discoveries');
  cli('xr', 'enter');
  cli('ecs', 'pause');
  cli('xr', 'set-input-mode', { mode: 'hand' });
  for (const d of ['hand-left', 'hand-right']) cli('xr', 'set-hand-pose', { device: d, poseId: 'default' });
  advance(2.5);
  let s = status();
  check(sphereState().destination === 'room', 'Relaxed hands do not start the ocean');
  check(s.namiLine === 'welcome', 'NAMI welcomes in the room', s.namiLine);

  // ---- one sign, one job: an open palm in the room is light, not a door
  cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'open' });
  wait(500);
  advance(1.5);
  check(sphereState().destination === 'room', 'Open palm in the room does not enter the ocean');
  cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'default' });
  advance(0.3);
  pinchAt('hand-right', 'ABYSS sphere');
  check(sphereState().destination === 'ocean', 'Pinching the pearl lets the ocean in');
  advance(9);
  check(sphereState().immersion === 1, 'Room transforms to ocean');
  s = status();
  check(s.band === 'sunlit' && s.schoolState !== '', 'Sunlit ocean with school', s.schoolState);

  // ---- ✊ fist toggles the menu (once per hold); the Menu tab brings it back
  if (!s.panelVisible) { command('menu'); advance(0.2); s = status(); } // a previous run may have left it hidden (saved preference)
  check(s.panelVisible, 'Dive menu shown in the ocean');
  cli('xr', 'animate-to', { device: 'hand-right', position: { x: 0.25, y: 1.45, z: -0.4 }, duration: 0.2 });
  wait(300);
  cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'fist' });
  wait(400); advance(1.2);
  s = status();
  check(!s.panelVisible, 'Raised fist hides the menu', s.gesture);
  advance(1.5);
  check(!status().panelVisible, 'Holding the fist does not toggle again');
  cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'default' });
  wait(300); advance(0.4);
  pinchAt('hand-right', 'Menu tab');
  check(status().panelVisible, 'Pinching the Menu tab shows the menu again');

  // ---- menu pages: Hand signs and Map & journal
  pinchAt('hand-right', 'Depth control Hand signs');
  check(status().menuPage === 'signs', 'Hand signs page opens', status().menuPage);
  pinchAt('hand-right', 'Depth control Map & journal');
  check(status().menuPage === 'journal', 'Map & journal page opens', status().menuPage);
  pinchAt('hand-right', 'Depth control Dive');
  check(status().menuPage === 'controls', 'Back to the dive controls', status().menuPage);

  // ---- 🤏 a pinch in open water does nothing but select
  cli('xr', 'look-at', { device: 'hand-right', target: { x: 2, y: 3, z: -1 } });
  cli('xr', 'set-select-value', { device: 'hand-right', value: 1 }); advance(1);
  cli('xr', 'set-select-value', { device: 'hand-right', value: 0 }); advance(0.2);
  s = status();
  check(s.travelX === 0 && s.travelZ === 0 && s.pulses === 0, 'Pinch in open water neither swims nor fires light');

  // ---- 👉 point to swim to a dive marker (sunlit-oxygen at -2.6, -0.35, -2.2 in the travel frame)
  const head = cli('xr', 'get-transform', { device: 'headset' }).position;
  cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'point' });
  cli('xr', 'animate-to', { device: 'hand-right', position: { x: 0.2, y: 1.3, z: -0.35 }, duration: 0.1 });
  wait(200);
  let swam = false;
  for (let t = 0; t < 24 && status().markers < 1; t++) {
    const v = status();
    cli('xr', 'look-at', { device: 'hand-right', target: { x: head.x - 2.6 - v.travelX, y: head.y - 0.6, z: head.z - 2.2 - v.travelZ } });
    advance(1);
    if (/point/.test(status().gesture) && (status().travelX !== 0 || status().travelZ !== 0)) swam = true;
  }
  s = status();
  check(swam, 'Pointing swims', s.gesture);
  check(s.markers >= 1, 'Swimming to a dive marker logs it', `travel ${s.travelX.toFixed(2)}, ${s.travelZ.toFixed(2)}; markers ${s.markers}`);
  cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'default' });
  wait(300); advance(1);
  const parked = status();
  advance(1);
  check(status().travelX === parked.travelX && status().travelZ === parked.travelZ, 'Swimming stops when you stop pointing');
  pinchAt('hand-right', 'Discovery card');
  command('reset'); advance(0.5);
  s = status();

  // ---- slow/steady hand attracts the school
  cli('xr', 'animate-to', { device: 'hand-right', position: { x: 0.3, y: 1.2, z: -0.5 }, duration: 0.6 });
  wait(800);
  s = until(v => v.schoolState === 'attracted', 8);
  check(s.schoolState === 'attracted', 'Steady hand near the school attracts fish');

  // ---- fast sweep scatters (real-time animation, ECS running)
  const sweepsBefore = s.sweeps, scattersBefore = s.scatters;
  cli('ecs', 'resume');
  // Sweep below and in front of the sphere (not through it), with the ECS running long enough to see it.
  cli('xr', 'animate-to', { device: 'hand-right', position: { x: -0.5, y: 1.05, z: -0.45 }, duration: 0.35, easing: 'linear' });
  wait(450);
  cli('ecs', 'pause');
  s = status();
  check(s.sweeps >= sweepsBefore + 1 && s.sweeps <= sweepsBefore + 2, 'Fast sweep detected (cooldown-limited)', `${sweepsBefore} → ${s.sweeps}`);
  check(s.scatters === scattersBefore + s.sweeps - sweepsBefore, 'Each fast sweep scatters the school', `scatters ${scattersBefore} → ${s.scatters}, state ${s.schoolState}`);
  advance(4);
  check(['schooling', 'attracted'].includes(status().schoolState), 'School regroups', status().schoolState);
  cli('xr', 'animate-to', { device: 'hand-right', position: { x: 0.25, y: 1.0, z: -0.3 }, duration: 0.5 });
  wait(700);

  // ---- showcase turtle pass and discovery
  s = until(v => v.encounter === 'turtle_pass', 20);
  check(s.encounter === 'turtle_pass', 'Showcase turtle encounter begins in sunlit water');
  advance(9);
  pinchAt('hand-right', 'Green sea turtle');
  s = status();
  if (s.discoveries < 1) { console.log('NOTE turtle pinch retry (hovered ' + s.hovered + '; log ' + s.eventLog + ')'); advance(1); pinchAt('hand-right', 'Green sea turtle'); s = status(); }
  check(s.discoveries >= 1 && s.namiLine === 'discovery', 'Pinching the turtle records a discovery and shows a card', `discoveries ${s.discoveries}; hovered ${s.hovered}; log ${s.eventLog}`);
  check(s.travelX === 0 && s.travelZ === 0, 'Inspection did not trigger travel');
  pinchAt('hand-right', 'Discovery card');
  advance(0.5);

  if (process.env.STOP_AT === 'turtle') { console.log('stopped after turtle'); process.exit(0); }
  // ---- open blue: showcase shark pass, fish react, comfort radius respected
  if (!process.env.SKIP_SHARK) {
  command('depth:0.45');
  s = until(v => v.encounter === 'shark_pass', 60, 1);
  check(s.encounter === 'shark_pass', 'Showcase shark encounter in open blue', `depth ${s.depth.toFixed(2)}`);
  const seen = new Set(); let evaded = false; let inspected = false;
  for (let t = 0; t < 110 && !(seen.has('done')); t += 1) {
    advance(1);
    s = status(); seen.add(s.sharkState); if (s.schoolState === 'evading') evaded = true;
    if (!inspected && s.sharkState === 'investigate') { const before = s.discoveries; pinchAt('hand-left', 'Grey reef shark'); inspected = status().discoveries > before; }
  }
  check(['cruise', 'notice', 'investigate', 'turnAway'].every(x => seen.has(x)) && seen.has('done'), 'Shark: cruise → notice → investigate → turn away → done', [...seen].join(','));
  check(evaded, 'School evades the shark without user input');
  check(s.sharkMinDistance >= 3.19, 'Shark stays outside the 3.2 m comfort radius', `${s.sharkMinDistance.toFixed(2)} m`);
  check(inspected, 'Shark can be inspected (left hand)');
  check(status().encounter === 'none', 'Encounter resolves');
  }

  // ---- midnight: palm light, one pulse, wavefront, giant reveal, discovery
  command('depth:0.95');
  s = until(v => v.depth > 0.93, 30, 1);
  check(s.band === 'midnight', 'Descended to midnight', s.depth.toFixed(2));
  cli('xr', 'look-at', { device: 'hand-right', target: { x: 0.9, y: 2.4, z: -1.2 } });
  cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'open' });
  wait(500);
  advance(1);
  s = status();
  check(/open palm/.test(s.gesture), 'Open palm detected at midnight', s.gesture);
  check(s.namiLine === 'armed' || s.namiLine === 'midnight', 'NAMI prompts the pulse', s.namiLine);
  advance(1.5);
  check(status().pulses === 1, 'Holding the open palm releases exactly one light pulse', `pulses ${status().pulses}`);
  advance(2);
  check(status().pulses === 1 && status().travelX === 0, 'A held palm does not stream pulses or swim');
  cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'default' });
  s = status();
  s = until(v => v.revealState === 'revealed', 15);
  check(s.revealState === 'revealed', 'Wavefront reaches the giant squid and the reveal completes');
  check(status().pulses === 1, 'Still exactly one pulse');
  const before = status().discoveries;
  cli('xr', 'animate-to', { device: 'hand-right', position: { x: 0.25, y: 1.0, z: -0.3 }, duration: 0.1 });
  wait(300);
  pinchAt('hand-right', 'Giant squid');
  s = status();
  if (s.discoveries === before) { console.log('NOTE squid pinch needed a retry (hovered ' + s.hovered + ')'); pinchAt('hand-right', 'Giant squid'); s = status(); }
  check(s.discoveries === before + 1, 'Revealed squid can be inspected', `${before} → ${s.discoveries}; hovered ${s.hovered}; log ${s.eventLog}; targets ${cli('xr', 'list-targets').targets.map(t => t.name).filter(n => !/Depth/.test(n)).join(',')}`);
  pinchAt('hand-right', 'Discovery card');
  check(status().discoveries >= 3, 'At least three species discovered', `${status().discoveries}`);

  // ---- comfort and lifecycle
  command('pause'); advance(0.1);
  const frozen = status();
  advance(3);
  check(status().depth === frozen.depth && status().paused, 'Pause freezes the ocean');
  command('resume'); command('recenter'); advance(0.5);
  command('reset'); advance(0.5);
  s = status();
  check(s.band === 'sunlit' && s.revealState === 'hidden' && s.encounter === 'none' && s.pulses === 0, 'Restart resets ocean, encounters and reveal');
  cli('xr', 'set-connected', { device: 'hand-right', connected: false });
  cli('xr', 'set-connected', { device: 'hand-left', connected: false });
  advance(3);
  check(/no hands/.test(status().gesture), 'Hand loss is reported, app keeps running', status().gesture);
  cli('xr', 'set-connected', { device: 'hand-right', connected: true });
  cli('xr', 'set-connected', { device: 'hand-left', connected: true });
  advance(1);
  check(status().sweeps === s.sweeps, 'No gesture storm after tracking returns');
  cli('ecs', 'resume');
  cli('xr', 'exit');
  check(!cli('xr', 'status').sessionActive, 'Exit XR works');
  const logs = cli('browser', 'logs', { count: 200 });
  const navigationAbort = e => e.kind === 'requestfailed' && e.failure === 'net::ERR_ABORTED';
  const errors = logs.filter(e => e.level === 'error' && e.timestamp >= testStartedAt && !navigationAbort(e));
  check(errors.length === 0, 'No browser console errors', errors.map(e => e.message).join(' | ').slice(0, 300));
  console.log('Experience smoke passed. Physical Quest review still required.');
} finally {
  try { for (const d of ['hand-left', 'hand-right']) { cli('xr', 'set-connected', { device: d, connected: true }); cli('xr', 'set-select-value', { device: d, value: 0 }); cli('xr', 'set-hand-pose', { device: d, poseId: 'default' }); } } catch {}
  try { cli('ecs', 'resume'); } catch {}
  writeFileSync('artifacts/experience-results.json', JSON.stringify({ results, calls: evidence.length }, null, 2));
}
