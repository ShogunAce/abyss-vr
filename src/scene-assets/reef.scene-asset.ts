import {
  BufferGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry,
  InstancedBufferAttribute, InstancedMesh, Object3D, PlaneGeometry, Quaternion, ShaderMaterial, Shape,
  ShapeGeometry, SphereGeometry, Vector3,
} from '@iwsdk/core';

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
        float s = uSway * h * h * (sin(uTime * 0.9 + aSeed * 6.28 + anchor.x * 0.6) + 0.4 * sin(uTime * 1.7 + aSeed * 3.0 + anchor.z));
        p.x += s; p.z += s * 0.6;
        vLocal = position; vColor = aColor; vSeed = aSeed; vH = h;
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vWorld = wp.xyz; vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uReveal; uniform float uKind;
      ${h.glsl}
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor; varying float vSeed; varying float vH;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        vec3 base = vColor;
        if (uKind < 0.5) {                       // branching: paler growing tips
          base = mix(base * 0.7, mix(base, vec3(1.0, 0.95, 0.85), 0.35), smoothstep(0.12, 0.45, vH));
        } else if (uKind < 1.5) {                // brain: meandering grooves
          float g = sin(vLocal.x * 58.0 + sin(vLocal.z * 37.0) * 2.6 + sin(vLocal.y * 29.0) * 1.4);
          base *= 0.62 + 0.45 * smoothstep(-0.25, 0.65, g);
        } else if (uKind < 2.5) {                // table: radial growth lines
          float a = atan(vLocal.z, vLocal.x);
          base *= 0.82 + 0.18 * sin(a * 46.0 + length(vLocal.xz) * 30.0);
        } else if (uKind < 3.5) {                // sea fan: open lattice
          vec2 q = vLocal.xy * 34.0;
          float lx = abs(fract(q.x + sin(q.y * 0.35) * 0.6) - 0.5);
          float ly = abs(fract(q.y * 0.85 + q.x * 0.25) - 0.5);
          if (min(lx, ly) > 0.13 && length(vLocal.xy) > 0.06) discard;
        } else if (uKind < 4.5) {                // tube sponge: dark interiors
          base *= gl_FrontFacing ? 1.0 : 0.3;
        } else if (uKind < 5.5) {                // anemone: glowing tentacle tips
          base = mix(base, vec3(0.98, 0.92, 0.75), smoothstep(0.13, 0.2, vH));
        } else if (uKind < 6.5) {                // seagrass: darker roots, sunlit tips
          base *= 0.5 + 1.1 * clamp(vH / 0.42, 0.0, 1.0);
        } else {                                 // starfish: bumpy texture
          base *= 0.78 + 0.32 * hash(floor(vLocal * 140.0));
        }
        vec3 L = normalize(vec3(-0.3, 1.0, -0.2));
        float key = max(dot(n, L), 0.0);
        float hemi = 0.5 + 0.5 * n.y;
        float light = 0.08 + 0.92 * uLight;
        vec3 col = base * (0.28 + 0.62 * key + 0.25 * hemi) * light;
        float caustic = pow(0.5 + 0.5 * sin(vWorld.x * 1.7 + sin(vWorld.z * 2.1 + uTime * 0.2) * 1.8), 10.0) * pow(0.5 + 0.5 * sin(vWorld.z * 1.3 - uTime * 0.15), 2.0);
        col += base * caustic * 0.45 * uLight * key;
        // Faint biofluorescence on some corals in the deep.
        col += mix(vec3(0.47, 0.85, 0.86), vec3(0.62, 0.51, 0.83), vSeed) * uGlow * 0.22 * smoothstep(0.05, 0.35, vH) * step(0.5, vSeed);
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
    [[0.95, 0.32, 0.52], [0.62, 0.3, 0.88], [1.0, 0.52, 0.2], [0.95, 0.82, 0.25], [0.3, 0.6, 0.98]], [1.2, 2.4]));
  add('Brain corals', brainCoral(), 1, 0, scatterPlacements(40, 23,
    [[0.78, 0.68, 0.35], [0.55, 0.78, 0.4], [0.88, 0.52, 0.42], [0.62, 0.5, 0.78]], [0.6, 1.4], { tilt: 0.1 }));
  add('Table corals', tableCoral(), 2, 0, scatterPlacements(12, 37,
    [[0.62, 0.52, 0.78], [0.45, 0.72, 0.6], [0.85, 0.7, 0.45]], [0.8, 1.5], { tilt: 0.12 }));
  add('Sea fans', fanCoral(), 3, 0.06, scatterPlacements(28, 41,
    [[0.88, 0.25, 0.45], [0.98, 0.6, 0.2], [0.62, 0.3, 0.85]], [1.2, 2.2], { tilt: 0.15 }));
  add('Tube sponges', tubeSponge(), 4, 0.02, scatterPlacements(32, 59,
    [[0.98, 0.55, 0.15], [0.72, 0.22, 0.62], [0.3, 0.5, 0.88], [0.9, 0.85, 0.3]], [1.1, 2.0]));
  add('Sea anemones', anemone(), 5, 1.2, scatterPlacements(18, 67,
    [[0.75, 0.92, 0.5], [0.98, 0.5, 0.72], [0.98, 0.7, 0.35]], [1.0, 1.8], { tilt: 0.1 }));
  add('Seagrass', seagrassBlade(), 6, 0.9, scatterPlacements(1300, 71,
    [[0.25, 0.58, 0.26], [0.36, 0.62, 0.2], [0.3, 0.5, 0.3]], [0.6, 1.4], { tilt: 0.35, minR: 2.0 }));
  add('Starfish', starfish(), 7, 0, scatterPlacements(36, 83,
    [[0.98, 0.42, 0.15], [0.88, 0.2, 0.3], [0.3, 0.42, 0.88], [0.95, 0.75, 0.2]], [0.8, 1.6], { tilt: 0.05, minR: 2.0 }));
  return group;
}
