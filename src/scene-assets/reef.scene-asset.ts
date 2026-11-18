import {
  BufferGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry,
  InstancedBufferAttribute, InstancedMesh, Object3D, PlaneGeometry, Quaternion, ShaderMaterial, Shape,
  ShapeGeometry, SphereGeometry, Vector3,
} from '@iwsdk/core';
import { noiseGlsl } from '../visuals/glsl.js';

// Deterministic, side-effect-free reef ecosystem for the ocean asset (evaluated by runtime and editor).
// Units: metres in ocean-local space (origin = seated eye point, seabed ≈ 3.4 m below).
// Every coral type is one InstancedMesh (one draw call) with per-instance colour and seed.

type Rgb = [number, number, number];

/** Seabed height (ocean-local y) at x,z: dunes, a reef mound ahead and two flanking mounds. */
export function seabedHeight(x: number, z: number) {
  const r2 = x * x + z * z;
  let h = -3.4;
  h += Math.sin(x * 0.28 + Math.sin(z * 0.19)) * 0.35 + Math.sin(z * 0.48 + x * 0.09) * 0.16;
  h += Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.09 - 0.4) * 0.55;
  h += 1.5 * Math.exp(-(((x - 0.5) ** 2) / 9 + ((z + 6) ** 2) / 6));
  h += 1.0 * Math.exp(-(((x + 5.5) ** 2) / 5 + ((z + 3.5) ** 2) / 7));
  h += 1.1 * Math.exp(-(((x - 6) ** 2) / 6 + ((z + 2.5) ** 2) / 5));
  h -= 0.4 * Math.exp(-r2 / 8); // a calm hollow beneath the seated viewer
  return Math.min(h, -1.5);
}

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Concatenate geometries into one non-indexed geometry (position + normal). */
function merge(parts: BufferGeometry[]) {
  const positions: number[] = [], normals: number[] = [];
  for (const part of parts) {
    const g = part.index ? part.toNonIndexed() : part;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) { positions.push(p.getX(i), p.getY(i), p.getZ(i)); normals.push(n.getX(i), n.getY(i), n.getZ(i)); }
    if (g !== part) g.dispose();
    part.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  return out;
}

// ---------- coral geometry (base at y = 0, up = +Y) ----------
function branchingCoral() {
  const parts: BufferGeometry[] = [];
  const rng = lcg(7);
  const up = new Vector3(0, 1, 0);
  const branch = (start: Vector3, dir: Vector3, len: number, radius: number, depth: number) => {
    const g = new CylinderGeometry(radius * 0.65, radius, len, 6, 1, true);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(up, dir));
    g.translate(start.x, start.y, start.z);
    parts.push(g);
    const end = start.clone().addScaledVector(dir, len);
    const cap = new SphereGeometry(radius * 0.7, 5, 3);
    cap.translate(end.x, end.y, end.z);
    parts.push(cap);
    if (depth > 0) {
      for (let k = 0; k < 2; k++) {
        const a = rng() * Math.PI * 2;
        const next = dir.clone().add(new Vector3(Math.cos(a) * 0.75, 0.35, Math.sin(a) * 0.75)).normalize();
        branch(start.clone().addScaledVector(dir, len * 0.85), next, len * 0.78, radius * 0.72, depth - 1);
      }
    }
  };
  branch(new Vector3(0, 0, 0), new Vector3(0.15, 1, 0.05).normalize(), 0.2, 0.035, 2);
  branch(new Vector3(0.05, 0, -0.04), new Vector3(-0.35, 1, -0.2).normalize(), 0.17, 0.03, 2);
  return merge(parts);
}

function brainCoral() {
  const g = new SphereGeometry(0.32, 22, 9, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, 0.72, 1);
  return merge([g]);
}

function tableCoral() {
  const top = new CylinderGeometry(0.55, 0.5, 0.05, 22, 1);
  top.translate(0, 0.34, 0);
  const stalk = new CylinderGeometry(0.06, 0.11, 0.33, 8, 1, true);
  stalk.translate(0, 0.165, 0);
  return merge([top, stalk]);
}

function fanCoral() {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.absarc(0, 0.05, 0.5, Math.PI * 0.08, Math.PI * 0.92, false);
  shape.lineTo(0, 0);
  const g = new ShapeGeometry(shape, 18);
  return merge([g]);
}

function tubeSponge() {
  const parts: BufferGeometry[] = [];
  const rng = lcg(31);
  for (let i = 0; i < 4; i++) {
    const h = 0.28 + rng() * 0.32, r = 0.045 + rng() * 0.03;
    const g = new CylinderGeometry(r, r * 0.8, h, 10, 1, true);
    g.translate((rng() - 0.5) * 0.14, h / 2, (rng() - 0.5) * 0.14);
    parts.push(g);
  }
  return merge(parts);
}

function anemone() {
  const parts: BufferGeometry[] = [];
  const base = new CylinderGeometry(0.07, 0.09, 0.06, 12, 1);
  base.translate(0, 0.03, 0);
  parts.push(base);
  const rng = lcg(53);
  const up = new Vector3(0, 1, 0);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2, ring = 0.03 + (i % 3) * 0.02;
    const dir = new Vector3(Math.cos(a) * 0.55, 1, Math.sin(a) * 0.55).normalize();
    const len = 0.11 + rng() * 0.05;
    const t = new CylinderGeometry(0.004, 0.009, len, 4, 1, true);
    t.translate(0, len / 2, 0);
    t.applyQuaternion(new Quaternion().setFromUnitVectors(up, dir));
    t.translate(Math.cos(a) * ring, 0.06, Math.sin(a) * ring);
    parts.push(t);
  }
  return merge(parts);
}

function seagrassBlade() {
  const g = new PlaneGeometry(0.03, 0.42, 1, 4);
  g.translate(0, 0.21, 0);
  return merge([g]);
}

function starfish() {
  const shape = new Shape();
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2, r = i % 2 === 0 ? 0.1 : 0.035;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new ShapeGeometry(shape, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.012, 0);
  return merge([g]);
}

/** Giant kelp: three tall twisting ribbons on a slender stipe. */
function kelp() {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const h = 2.4 + k * 0.45;
    const g = new PlaneGeometry(0.14, h, 1, 18);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + h / 2, x = pos.getX(i);
      const twist = y * 1.3 + k * 2.1;
      const width = 0.35 + 0.65 * Math.sin(Math.min(1, y / h) * Math.PI * 0.9 + 0.15);
      pos.setXYZ(i, Math.cos(twist) * x * width + Math.sin(y * 1.7 + k) * 0.06, y, Math.sin(twist) * x * width);
    }
    g.computeVertexNormals();
    g.translate((k - 1) * 0.07, 0, (k % 2) * 0.06);
    parts.push(g);
  }
  const stipe = new CylinderGeometry(0.008, 0.014, 2.2, 4, 1, true);
  stipe.translate(0, 1.1, 0);
  parts.push(stipe);
  return merge(parts);
}

/** Sea whips: a few slender, flexible rods from one holdfast. */
function seaWhip() {
  const parts: BufferGeometry[] = [];
  const rng = lcg(97);
  const up = new Vector3(0, 1, 0);
  for (let i = 0; i < 5; i++) {
    const len = 0.45 + rng() * 0.4;
    const g = new CylinderGeometry(0.004, 0.009, len, 5, 4, true);
    g.translate(0, len / 2, 0);
    const a = rng() * Math.PI * 2;
    g.applyQuaternion(new Quaternion().setFromUnitVectors(up, new Vector3(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3).normalize()));
    parts.push(g);
  }
  return merge(parts);
}

/** Sea urchin: a dark test bristling with spines. */
function urchin() {
  const parts: BufferGeometry[] = [];
  const body = new SphereGeometry(0.045, 10, 6); body.scale(1, 0.7, 1); body.translate(0, 0.03, 0);
  parts.push(body);
  const up = new Vector3(0, 1, 0);
  for (let i = 0; i < 34; i++) {
    const y = 1 - (i / 33) * 1.3, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996;
    const dir = new Vector3(Math.cos(a) * r, y, Math.sin(a) * r).normalize();
    const g = new CylinderGeometry(0.0008, 0.003, 0.09, 3, 1, true);
    g.translate(0, 0.075, 0);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(up, dir));
    g.translate(0, 0.03, 0);
    parts.push(g);
  }
  return merge(parts);
}

/** Average normals of coincident vertices (non-indexed geometry → smooth shading). */
function smoothNormals(g: BufferGeometry) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const sums = new Map<string, [number, number, number]>();
  const key = (i: number) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i), s = sums.get(k) ?? [0, 0, 0];
    s[0] += n.getX(i); s[1] += n.getY(i); s[2] += n.getZ(i); sums.set(k, s);
  }
  for (let i = 0; i < p.count; i++) {
    const s = sums.get(key(i))!, l = Math.hypot(s[0], s[1], s[2]) || 1;
    n.setXYZ(i, s[0] / l, s[1] / l, s[2] / l);
  }
  n.needsUpdate = true;
}

/** Craggy outcrop: an icosphere displaced by deterministic layered noise. */
export function rockGeometry() {
  const g = new IcosahedronGeometry(1, 2);
  const p = g.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = Math.sin(v.x * 3.1 + Math.sin(v.y * 2.3)) * Math.sin(v.z * 2.7 + 0.5) * 0.18
      + Math.sin(v.x * 7.3 + v.z * 5.1) * Math.sin(v.y * 6.7) * 0.07
      + Math.sin(v.y * 13.0 + v.x * 11.0) * 0.025;
    const flat = v.y < -0.2 ? 0.75 : 1; // flatter underside to sit on the sand
    v.multiplyScalar((1 + n) * flat);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  smoothNormals(g);
  return g;
}

// ---------- shared coral material ----------
type Helpers = { uniforms: () => Record<string, { value: unknown }>; glsl: string };

function coralMaterial(h: Helpers, kind: number, sway: number) {
  const material = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uReveal: { value: 0 }, uKind: { value: kind }, uSway: { value: sway }, ...h.uniforms() },
    vertexShader: `
      uniform float uTime; uniform float uSway;
      attribute vec3 aColor; attribute float aSeed;
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor; varying float vSeed; varying float vH;
      void main() {
        vec3 p = position;
        float h = max(p.y, 0.0);
        vec4 anchor = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        // One shared tidal surge rolls across the reef (a travelling wave), plus a little local flutter.
        float wave = uTime * 0.55 - anchor.z * 0.18 + anchor.x * 0.05;
        vec2 surge = vec2(sin(wave) + 0.35 * sin(wave * 2.3 + 1.0), 0.55 * cos(wave * 0.8));
        float flutter = 0.3 * sin(uTime * 1.9 + aSeed * 6.28 + h * 4.0);
        float s = uSway * h * h;
        p.x += s * (surge.x + flutter); p.z += s * (surge.y + flutter * 0.5);
        p.y -= s * s * 0.5 * abs(surge.x); // bending shortens the stalk instead of stretching it
        vLocal = position; vColor = aColor; vSeed = aSeed; vH = h;
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vWorld = wp.xyz; vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uReveal; uniform float uKind;
      ${h.glsl}
      ${noiseGlsl}
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor; varying float vSeed; varying float vH;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        vec3 base = vColor;
        float thin = 0.0;                          // thin tissue lets light through (backlit glow)
        if (uKind < 0.5) {                         // branching: polyp-studded, paler growing tips
          float pol = smoothstep(0.55, 0.75, vnoise(vLocal.xy * 140.0 + vLocal.z * 90.0));
          base = mix(base * 0.7, mix(base, vec3(1.0, 0.96, 0.88), 0.4), smoothstep(0.12, 0.45, vH));
          base *= 0.85 + 0.3 * pol;
        } else if (uKind < 1.5) {                  // brain: meandering ridges and valleys
          float g = sin(vLocal.x * 58.0 + sin(vLocal.z * 37.0) * 2.6 + sin(vLocal.y * 29.0) * 1.4 + vnoise(vLocal.xz * 12.0) * 3.0);
          base *= 0.5 + 0.6 * smoothstep(-0.3, 0.7, g);
          base = mix(base, base.gbr * 0.9 + 0.1, 0.18 * smoothstep(0.6, 1.0, g));
        } else if (uKind < 2.5) {                  // table: radial growth lines, polyp dots, pale rim
          float a = atan(vLocal.z, vLocal.x), r = length(vLocal.xz);
          base *= 0.8 + 0.2 * sin(a * 46.0 + r * 30.0);
          base *= 0.88 + 0.24 * step(0.6, vnoise(vLocal.xz * 90.0));
          base = mix(base, vec3(0.95, 0.92, 0.85), smoothstep(0.42, 0.55, r) * 0.45);
        } else if (uKind < 3.5) {                  // sea fan: open lattice
          vec2 q = vLocal.xy * 34.0;
          float lx = abs(fract(q.x + sin(q.y * 0.35) * 0.6) - 0.5);
          float ly = abs(fract(q.y * 0.85 + q.x * 0.25) - 0.5);
          if (min(lx, ly) > 0.13 && length(vLocal.xy) > 0.06) discard;
          thin = 0.8;
        } else if (uKind < 4.5) {                  // tube sponge: pitted walls, dark interiors, bright lips
          base *= gl_FrontFacing ? 0.85 + 0.3 * vnoise(vLocal.xy * 60.0 + vLocal.z * 40.0) : 0.25;
          base = mix(base, base * 1.3 + 0.06, smoothstep(0.24, 0.3, vH) * 0.35);
        } else if (uKind < 5.5) {                  // anemone: striped tentacles with glowing tips
          base *= 0.8 + 0.25 * sin(vH * 120.0);
          base = mix(base, vec3(0.98, 0.94, 0.78), smoothstep(0.13, 0.2, vH));
          thin = 0.5;
        } else if (uKind < 6.5) {                  // seagrass: darker roots, sunlit translucent tips
          base *= 0.45 + 1.1 * clamp(vH / 0.42, 0.0, 1.0);
          base = mix(base, base * vec3(1.1, 1.0, 0.6), 0.3 * step(0.6, vSeed));
          thin = 1.0;
        } else if (uKind < 7.5) {                  // starfish: bumpy, with pale tubercles
          float b = vnoise(vLocal.xz * 180.0);
          base *= 0.75 + 0.35 * b;
          base = mix(base, vec3(0.98, 0.92, 0.8), step(0.82, b) * 0.6);
        } else if (uKind < 8.5) {                  // kelp: golden-olive, translucent
          base *= 0.75 + 0.35 * vnoise(vec2(vLocal.y * 9.0, vSeed * 10.0));
          base *= 0.7 + 0.4 * clamp(vH / 2.4, 0.0, 1.0);
          thin = 1.2;
        } else if (uKind < 9.5) {                  // sea whip: banded, glowing tips
          base *= 0.8 + 0.2 * sin(vH * 70.0);
          base = mix(base, vec3(1.0, 0.95, 0.7), smoothstep(0.6, 0.85, vH) * 0.5);
        } else {                                   // urchin: near-black with violet sheen
          base *= 0.6 + 0.3 * vnoise(vLocal.xz * 200.0);
        }
        // A little extra saturation: reef colours stay vivid even after the water's blue cast.
        base = max(mix(vec3(dot(base, vec3(0.3, 0.55, 0.15))), base, 1.25), 0.0);
        vec3 L = normalize(vec3(-0.3, 1.0, -0.2));
        float wrapK = max((dot(n, L) + 0.4) / 1.4, 0.0);
        float hemi = 0.5 + 0.5 * n.y;
        float light = 0.07 + 0.93 * uLight;
        float ao = 0.5 + 0.5 * smoothstep(0.0, 0.14, vH);
        vec3 col = base * (0.24 + 0.62 * wrapK + 0.24 * hemi) * light * ao;
        // Sun through thin tissue when looking toward the light, and a soft wet rim.
        vec3 V = normalize(cameraPosition - vWorld);
        col += base * thin * pow(max(dot(-V, L), 0.0), 3.0) * 0.55 * uLight;
        col += base * pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.18 * light;
        float caustic = caustics(vWorld.xz * 0.9, uTime);
        col += base * caustic * 0.7 * uLight * max(n.y, 0.0) * ao;
        // Biofluorescence in the deep: about half the corals glow faintly cyan or violet.
        col += mix(vec3(0.3, 0.95, 0.85), vec3(0.75, 0.45, 1.0), vSeed) * uGlow * 0.3 * smoothstep(0.05, 0.35, vH) * step(0.5, vSeed);
        float d = length(vWorld - cameraPosition);
        col = mix(col, water(normalize(vWorld - cameraPosition)), 1.0 - exp(-d * uFog * 0.85));
        gl_FragColor = vec4(col, uReveal);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: DoubleSide,
  });
  material.userData.solid = true;
  return material;
}

type Placement = { x: number; z: number; scale: number; rotY: number; tilt: number; color: Rgb; seed: number; lift?: number };

function instanced(name: string, geometry: BufferGeometry, material: ShaderMaterial, items: Placement[]) {
  const mesh = new InstancedMesh(geometry, material, items.length);
  mesh.name = name;
  const colors = new Float32Array(items.length * 3), seeds = new Float32Array(items.length);
  const dummy = new Object3D();
  items.forEach((it, i) => {
    dummy.position.set(it.x, seabedHeight(it.x, it.z) - 0.03 + (it.lift ?? 0), it.z);
    dummy.rotation.set(it.tilt, it.rotY, it.tilt * 0.5);
    dummy.scale.setScalar(it.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    colors.set(it.color, i * 3); seeds[i] = it.seed;
  });
  geometry.setAttribute('aColor', new InstancedBufferAttribute(colors, 3));
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
  mesh.frustumCulled = false;
  mesh.renderOrder = -85;
  return mesh;
}

// Garden zones: [centre x, centre z, radius, weight]. Densest on the mounds ahead and to the sides.
const ZONES: Array<[number, number, number, number]> = [
  [0.5, -6, 3.2, 4.5], [-5.5, -3.5, 2.6, 2], [6, -2.5, 2.6, 2], [-2.5, -9, 3, 1.5], [4, -10, 3, 1.5],
  [-9, 3, 3, 1], [9, 4, 3, 1], [0, 9, 4, 1], [-7, -11, 3.5, 1], [10, -8, 3.5, 1],
];

function scatterPlacements(count: number, seed: number, palette: Rgb[], scale: [number, number], opts: { tilt?: number; minR?: number; lift?: number } = {}): Placement[] {
  const rng = lcg(seed);
  const total = ZONES.reduce((sum, z) => sum + z[3], 0);
  const out: Placement[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 50) {
    let pick = rng() * total, zone = ZONES[0];
    for (const z of ZONES) { pick -= z[3]; if (pick <= 0) { zone = z; break; } }
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * zone[2];
    const x = zone[0] + Math.cos(a) * r, z = zone[1] + Math.sin(a) * r;
    if (Math.hypot(x, z) < (opts.minR ?? 2.4)) continue;
    const c = palette[Math.floor(rng() * palette.length)];
    const shade = 0.85 + rng() * 0.3;
    out.push({
      x, z, scale: scale[0] + rng() * (scale[1] - scale[0]), rotY: rng() * Math.PI * 2,
      tilt: (rng() - 0.5) * (opts.tilt ?? 0.25), color: [c[0] * shade, c[1] * shade, c[2] * shade], seed: rng(), lift: opts.lift,
    });
  }
  return out;
}

export function createReef(h: Helpers) {
  const group = new Group();
  group.name = 'Coral reef ecosystem';
  const add = (name: string, geometry: BufferGeometry, kind: number, sway: number, items: Placement[]) =>
    group.add(instanced(name, geometry, coralMaterial(h, kind, sway), items));

  add('Branching corals', branchingCoral(), 0, 0.0, scatterPlacements(70, 11,
    [[1.0, 0.28, 0.5], [0.66, 0.28, 0.95], [1.0, 0.5, 0.15], [1.0, 0.85, 0.2], [0.25, 0.62, 1.0], [0.2, 0.9, 0.7]], [1.2, 2.4]));
  add('Brain corals', brainCoral(), 1, 0, scatterPlacements(40, 23,
    [[0.85, 0.72, 0.3], [0.5, 0.85, 0.35], [0.95, 0.5, 0.38], [0.6, 0.45, 0.88], [0.35, 0.75, 0.8]], [0.6, 1.4], { tilt: 0.1 }));
  add('Table corals', tableCoral(), 2, 0, scatterPlacements(12, 37,
    [[0.62, 0.52, 0.78], [0.45, 0.72, 0.6], [0.85, 0.7, 0.45]], [0.8, 1.5], { tilt: 0.12 }));
  add('Sea fans', fanCoral(), 3, 0.06, scatterPlacements(28, 41,
    [[0.95, 0.18, 0.4], [1.0, 0.58, 0.12], [0.65, 0.25, 0.95], [0.98, 0.85, 0.2]], [1.2, 2.2], { tilt: 0.15 }));
  add('Tube sponges', tubeSponge(), 4, 0.02, scatterPlacements(32, 59,
    [[0.98, 0.55, 0.15], [0.72, 0.22, 0.62], [0.3, 0.5, 0.88], [0.9, 0.85, 0.3]], [1.1, 2.0]));
  add('Sea anemones', anemone(), 5, 1.2, scatterPlacements(18, 67,
    [[0.7, 0.98, 0.45], [1.0, 0.45, 0.72], [1.0, 0.68, 0.28], [0.45, 0.85, 1.0]], [1.0, 1.8], { tilt: 0.1 }));
  add('Seagrass', seagrassBlade(), 6, 0.9, scatterPlacements(1300, 71,
    [[0.25, 0.58, 0.26], [0.36, 0.62, 0.2], [0.3, 0.5, 0.3]], [0.6, 1.4], { tilt: 0.35, minR: 2.0 }));
  add('Starfish', starfish(), 7, 0, scatterPlacements(36, 83,
    [[0.98, 0.42, 0.15], [0.88, 0.2, 0.3], [0.3, 0.42, 0.88], [0.95, 0.75, 0.2]], [0.8, 1.6], { tilt: 0.05, minR: 2.0 }));
  add('Sea whips', seaWhip(), 9, 0.9, scatterPlacements(46, 89,
    [[0.95, 0.2, 0.2], [1.0, 0.75, 0.15], [0.95, 0.4, 0.7]], [1.0, 1.7], { tilt: 0.1 }));
  add('Sea urchins', urchin(), 10, 0, scatterPlacements(40, 101,
    [[0.18, 0.08, 0.25], [0.1, 0.08, 0.12], [0.35, 0.1, 0.3]], [0.8, 1.4], { tilt: 0.1, minR: 2.2 }));
  add('Kelp forest', kelp(), 8, 0.035, kelpPlacements(72, 113));
  return group;
}

/** Kelp stands in clusters around the far edge of the garden, leaving the reef mound ahead open. */
function kelpPlacements(count: number, seed: number): Placement[] {
  const rng = lcg(seed);
  const clusters: Array<[number, number]> = [[-11, -9], [-13, 1], [12, -6], [13, 4], [-6, -15], [7, -15], [-4, 12], [5, 13], [0, -18]];
  const out: Placement[] = [];
  for (let i = 0; i < count; i++) {
    const c = clusters[i % clusters.length];
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 2.6;
    const shade = 0.85 + rng() * 0.3, g = rng();
    out.push({
      x: c[0] + Math.cos(a) * r, z: c[1] + Math.sin(a) * r, scale: 0.9 + rng() * 0.9, rotY: rng() * Math.PI * 2, tilt: (rng() - 0.5) * 0.12,
      color: [(0.55 + g * 0.2) * shade, (0.45 + g * 0.12) * shade, 0.12 * shade], seed: rng(),
    });
  }
  return out;
}
