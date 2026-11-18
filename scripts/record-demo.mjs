// Records the ABYSS demo in the IWER emulator in real time (ECS running), following
// submission/VIDEO_SHOTLIST.md. Captures the managed browser window with ffmpeg and
// writes beat timings to artifacts/video/beats.json for captioning.
import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const OUT = 'artifacts/video';
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function cli(domain, action, input, extra = []) {
  const args = ['node_modules/@iwsdk/cli/bin/iwsdk.js', domain, action];
  if (input) args.push('--input-json', JSON.stringify(input));
  args.push(...extra);
  const r = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 90000 }));
  if (!r.ok) throw new Error(`${domain} ${action}: ${JSON.stringify(r.error).slice(0, 300)}`);
  return r.data.result ?? r.data;
}
const ps = cmd => execFileSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' }).trim();
const ocean = cli('ecs', 'find', { withComponents: ['OceanStatus'] }).entities[0].entityIndex;
const status = () => cli('ecs', 'query', { entityIndex: ocean }).components.find(c => c.componentId === 'OceanStatus').values;
const command = v => cli('ecs', 'set-component', { entityIndex: ocean, componentId: 'OceanStatus', field: 'command', value: v });
const target = n => cli('xr', 'list-targets').targets.find(t => t.name === n)?.position;
const pinch = (device = 'hand-right') => { cli('xr', 'set-select-value', { device, value: 1 }); sleep(180); cli('xr', 'set-select-value', { device, value: 0 }); };
const pinchAt = (name, device = 'hand-right') => { const p = target(name); if (!p) return false; cli('xr', 'look-at', { device, target: p }); sleep(250); pinch(device); return true; };

// ---------- setup (not recorded)
cli('browser', 'reload');
cli('runtime', 'wait', {}, ['--timeout', '60000']);
sleep(2000);
cli('ecs', 'resume');
if (cli('xr', 'status').sessionActive) cli('xr', 'exit');
command('clear-discoveries'); command('reset-layout');
if (!status().panelVisible && status().menuPage) { /* menu pref restored when shown */ }
cli('xr', 'enter');
cli('xr', 'set-input-mode', { mode: 'hand' });
for (const d of ['hand-left', 'hand-right']) cli('xr', 'set-hand-pose', { device: d, poseId: 'default' });
const head = cli('xr', 'get-transform', { device: 'headset' }).position;
// Calibrate the euler convention once, then compute smooth look angles.
cli('xr', 'look-at', { device: 'headset', target: { x: head.x - 1, y: head.y, z: head.z - 1 } });
const yawSign = Math.sign(cli('xr', 'get-transform', { device: 'headset' }).euler.yaw) || 1;
const angles = p => {
  const dx = p.x - head.x, dy = p.y - head.y, dz = p.z - head.z;
  return { yaw: yawSign * Math.atan2(-dx, -dz) * 180 / Math.PI, pitch: Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI, roll: 0 };
};
const look = (p, duration = 1.2) => cli('xr', 'animate-to', { device: 'headset', orientation: angles(p), duration, easing: 'minimum-jerk' });
const lookNow = p => cli('xr', 'animate-to', { device: 'headset', orientation: angles(p), duration: 0.05 });
const pearl = target('ABYSS sphere');
lookNow({ x: pearl.x, y: pearl.y - 0.05, z: pearl.z });
cli('xr', 'animate-to', { device: 'hand-right', position: { x: 0.22, y: 1.12, z: -0.32 }, duration: 0.1 });
cli('xr', 'animate-to', { device: 'hand-left', position: { x: -0.25, y: 1.05, z: -0.3 }, duration: 0.1 });
sleep(3500);

// ---------- keep the window on top while recording
const hwndScript = `Add-Type @"
using System; using System.Runtime.InteropServices;
public class W { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r); public struct R { public int L,T,Rr,B; } }
"@
$p = Get-Process chrome | Where-Object { $_.MainWindowTitle -like 'ABYSS*' } | Select-Object -First 1
$h = $p.MainWindowHandle`;
const rect = ps(`${hwndScript}
[W]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 3) | Out-Null; [W]::SetForegroundWindow($h) | Out-Null
$r = New-Object W+R; [W]::GetWindowRect($h, [ref]$r) | Out-Null; "$($r.L),$($r.T),$($r.Rr),$($r.B)"`).split(',').map(Number);
const unpin = () => { try { ps(`${hwndScript}\n[W]::SetWindowPos($h, [IntPtr](-2), 0, 0, 0, 0, 3) | Out-Null`); } catch { /* ignore */ } };
// Inner client area (skip the window frame/title bar).
const x = rect[0] + 8, y = rect[1] + 8, w = Math.floor((rect[2] - rect[0] - 16) / 2) * 2, h = Math.floor((rect[3] - rect[1] - 16) / 2) * 2;
sleep(800);

const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'gdigrab', '-framerate', '30', '-offset_x', String(x), '-offset_y', String(y),
  '-video_size', `${w}x${h}`, '-i', 'desktop', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', `${OUT}/raw.mp4`], { stdio: ['pipe', 'inherit', 'inherit'] });
const t0 = Date.now();
const beats = [];
const beat = (id, caption) => { beats.push({ id, t: (Date.now() - t0) / 1000, caption }); console.log(((Date.now() - t0) / 1000).toFixed(1), id); };
sleep(600);

try {
  // 1. Room → touch the pearl
  beat('room', 'Seated. Hands only. Touch the pearl to dive.');
  sleep(2500);
  cli('xr', 'animate-to', { device: 'hand-right', position: pearl, anchor: 'index-tip', duration: 1.4, easing: 'minimum-jerk' });
  sleep(1700);
  cli('xr', 'animate-to', { device: 'hand-right', position: { x: 0.22, y: 1.12, z: -0.32 }, duration: 0.9, easing: 'minimum-jerk' });
  beat('arrival', 'Your room becomes an ocean. Everything is generated in code: no imported models or textures.');
  sleep(4000);
  look({ x: head.x - 3, y: head.y - 1.2, z: head.z - 4 }, 4);
  sleep(4300);
  look({ x: head.x + 3, y: head.y - 1.0, z: head.z - 4 }, 5);
  sleep(5300);
  look({ x: head.x + 0.3, y: head.y - 0.9, z: head.z - 4 }, 2.5);
  sleep(2700);

  // 2. Fish: calm hand, then a quick sweep
  beat('fish', 'Calm hand: the fish come closer. A quick sweep startles them.');
  cli('xr', 'animate-to', { device: 'hand-right', position: { x: 0.3, y: 1.25, z: -0.55 }, duration: 1, easing: 'minimum-jerk' });
  sleep(3500);
  cli('xr', 'animate-to', { device: 'hand-right', position: { x: -0.45, y: 1.1, z: -0.5 }, duration: 0.3 });
  sleep(3000);

  // 3. Turtle: point and pinch to discover
  const turtle = target('Green sea turtle');
  if (turtle) {
    beat('turtle', 'Point and pinch to discover species.');
    look(turtle, 1.2); sleep(1400);
    pinchAt('Green sea turtle');
    sleep(500);
    if (status().discoveries < 1) { pinchAt('Green sea turtle'); }
    const card = target('Discovery card');
    if (card) { look(card, 1); sleep(4200); pinchAt('Discovery card'); }
    sleep(600);
  }

  // 4. Hand signs: the menu's Hand signs page
  beat('signs', 'One sign, one job. Pinch selects, point swims, palm makes light, fist opens the menu.');
  const menu = target('Depth control Hand signs');
  look(menu, 1.4); sleep(1500);
  pinchAt('Depth control Hand signs'); sleep(4500);
  pinchAt('Depth control Map & journal'); sleep(3500);

  // 5. Explore: point to swim to a dive marker
  beat('explore', 'Point to swim. Find the dive markers and learn the real ocean at each depth.');
  const marker = { x: head.x - 2.6, y: head.y - 0.5, z: head.z - 2.2 };
  look(marker, 1.6); sleep(1700);
  cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'point' });
  cli('xr', 'animate-to', { device: 'hand-right', position: { x: 0.12, y: 1.32, z: -0.4 }, duration: 0.4 });
  for (let i = 0; i < 26; i++) {
    const v = status();
    if (v.markers > 0) break;
    cli('xr', 'look-at', { device: 'hand-right', target: { x: head.x - 2.6 - v.travelX, y: head.y - 0.6, z: head.z - 2.2 - v.travelZ } });
    sleep(500);
  }
  cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'default' });
  sleep(500);
  const mcard = target('Discovery card');
  if (mcard) { look(mcard, 1); sleep(5500); pinchAt('Discovery card'); }
  sleep(500);
  command('page:controls');

  // 6. Descent to midnight
  beat('descent', 'The world moves, never you. Descend through twilight to midnight.');
  command('reset'); sleep(300);
  command('depth:0.95');
  look({ x: head.x, y: head.y + 3, z: head.z - 3 }, 4); sleep(6000);
  look({ x: head.x, y: head.y - 0.3, z: head.z - 4 }, 4); sleep(6000);
  beat('spark', 'In the dark, the water lights up wherever your hands move.');
  for (let i = 0; i < 3; i++) {
    cli('xr', 'animate-to', { device: 'hand-right', position: { x: -0.25, y: 1.4, z: -0.55 }, duration: 0.9, easing: 'minimum-jerk' });
    cli('xr', 'animate-to', { device: 'hand-left', position: { x: 0.2, y: 1.35, z: -0.5 }, duration: 0.9, easing: 'minimum-jerk' });
    sleep(1000);
    cli('xr', 'animate-to', { device: 'hand-right', position: { x: 0.3, y: 1.25, z: -0.45 }, duration: 0.9, easing: 'minimum-jerk' });
    cli('xr', 'animate-to', { device: 'hand-left', position: { x: -0.3, y: 1.2, z: -0.45 }, duration: 0.9, easing: 'minimum-jerk' });
    sleep(1000);
  }
  for (let i = 0; i < 20 && status().depth < 0.9; i++) sleep(500);

  // 7. Reveal: hold an open palm → one pulse → the giant squid
  beat('reveal', 'Hold an open palm: one pulse of light, and the dark comes alive.');
  cli('xr', 'animate-to', { device: 'hand-right', position: { x: 0.15, y: 1.45, z: -0.45 }, duration: 0.6, easing: 'minimum-jerk' });
  cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'open' });
  sleep(3500);
  cli('xr', 'set-hand-pose', { device: 'hand-right', poseId: 'default' });
  look({ x: head.x, y: head.y - 0.6, z: head.z - 9 }, 2);
  for (let i = 0; i < 30 && status().revealState !== 'revealed'; i++) sleep(500);
  sleep(2500);
  cli('xr', 'animate-to', { device: 'hand-right', position: { x: 0.22, y: 1.12, z: -0.32 }, duration: 0.3 });
  sleep(400);
  pinchAt('Giant squid'); sleep(500);
  if (status().discoveries < 2) pinchAt('Giant squid');
  const scard = target('Discovery card');
  if (scard) { look(scard, 1.2); sleep(5000); }
  beat('end', '');
  sleep(1500);
} finally {
  ff.stdin.write('q');
  await new Promise(r => ff.on('close', r));
  unpin();
  writeFileSync(`${OUT}/beats.json`, JSON.stringify({ duration: (Date.now() - t0) / 1000, beats }, null, 2));
  console.log('recorded', ((Date.now() - t0) / 1000).toFixed(1), 's');
}
