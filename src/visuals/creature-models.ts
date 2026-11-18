// Runtime-only procedural creature models and shaders (not manifest assets).
// Every creature reads shared environment uniforms so it darkens and fogs with depth.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, DoubleSide,
  Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, LatheGeometry, LineSegments, Mesh, MeshBasicMaterial,
  Points, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, TorusGeometry, Vector2, Vector3,
} from '@iwsdk/core';
import { noiseGlsl } from './glsl.js';

export type Uniform<T> = { value: T };
/** Shared, written once per frame by OceanSystem. */
export const env = {
  uLight: { value: 1 } as Uniform<number>,
  uFog: { value: 0.095 } as Uniform<number>,
  uFogColor: { value: new Color(0.012, 0.15, 0.2) } as Uniform<Color>,
  /** 0 in the passthrough room (no fog), 1 when the ocean is fully revealed. */
  uFogAmount: { value: 0 } as Uniform<number>,
  uTime: { value: 0 } as Uniform<number>,
  uGlow: { value: 0 } as Uniform<number>,
};
const envGlsl = 'uniform float uLight; uniform float uFog; uniform vec3 uFogColor; uniform float uFogAmount; uniform float uTime; uniform float uGlow;';
const sharedEnv = () => ({ uLight: env.uLight, uFog: env.uFog, uFogColor: env.uFogColor, uFogAmount: env.uFogAmount, uTime: env.uTime, uGlow: env.uGlow });

type Rgb = [number, number, number];

// ---------- geometry helpers ----------
type Part = { geometry: BufferGeometry; tag?: number };
/** Concatenate parts into one non-indexed geometry with position, normal and aTag. */
export function mergeParts(parts: Part[]) {
  const positions: number[] = [], normals: number[] = [], tags: number[] = [];
  for (const { geometry, tag = 0 } of parts) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      tags.push(tag);
    }
    if (g !== geometry) g.dispose();
    geometry.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  out.setAttribute('aTag', new Float32BufferAttribute(tags, 1));
  out.computeBoundingSphere();
  return out;
}

/** Body of revolution along +Z (head at +Z), centred on the origin. */
function body(profile: Array<[number, number]>, length: number, widthScale: number, segments = 14) {
  // profile: [t along body 0=tail..1=head, radius]
  const points = profile.map(([t, r]) => new Vector2(Math.max(r, 0.0001), t * length));
  const g = new LatheGeometry(points, segments);
  g.rotateX(Math.PI / 2); // lathe +Y → +Z
  g.translate(0, 0, -length / 2);
  g.scale(widthScale, 1, 1);
  return g;
}

/** Flat double-sided fin from a list of [z, y] or [x, z] points (triangle fan). */
function fin(points: Array<[number, number, number]>) {
  const positions: number[] = [];
  for (let i = 1; i < points.length - 1; i++) positions.push(...points[0], ...points[i], ...points[i + 1]);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

// ---------- creature shader ----------
export type CreatureOptions = {
  top: Rgb; belly: Rgb; length: number; height: number; swim: number;
  emissive?: Rgb; pattern?: number; instanced?: boolean;
  /** Eye: local z (toward head), y, radius in metres. Omit for no eye. */
  eye?: [number, number, number];
  /** Fin tint (aTag 1); aTag 2 marks dark fin tips. */
  fin?: Rgb;
  /** Iridescent sheen colour (shifts with view angle). */
  sheen?: Rgb;
};
// Skin patterns: 0 plain, 1 polygonal reptile scales, 2 fish scales + lateral line, 3 turtle scutes,
// 4 shark (fine denticles + gill slits), 5 mixed reef-fish palette (anthias / tang / basslet by variant).

export function creatureMaterial(o: CreatureOptions) {
  return new ShaderMaterial({
    uniforms: {
      ...sharedEnv(),
      uTop: { value: new Color(...o.top) }, uBelly: { value: new Color(...o.belly) },
      uFin: { value: new Color(...(o.fin ?? o.belly)) }, uSheen: { value: new Color(...(o.sheen ?? [0, 0, 0])) },
      uEye: { value: new Vector3(...(o.eye ?? [0, 0, 0])) },
      uLength: { value: o.length }, uHeight: { value: o.height }, uSwim: { value: o.swim }, uPhase: { value: 0 },
      uEmissive: { value: new Color(...(o.emissive ?? [0, 0, 0])) }, uEmissiveLevel: { value: 0 },
      uHighlight: { value: 0 }, uOpacity: { value: 1 }, uPattern: { value: o.pattern ?? 0 },
    },
    vertexShader: `
      uniform float uLength; uniform float uSwim; uniform float uPhase;
      attribute float aTag;
      #ifdef USE_INSTANCING
        attribute float aPhase;
        attribute float aVariant;
      #endif
      varying vec3 vLocal; varying vec3 vNormalW; varying vec3 vWorld; varying float vTag; varying float vVariant;
      void main() {
        vec3 p = position;
        float ph = uPhase;
        vVariant = 0.5;
        #ifdef USE_INSTANCING
          ph = aPhase; vVariant = aVariant;
        #endif
        // Travelling body wave: stiff head, flexible tail; paired fins flutter a little.
        float t = clamp((uLength * 0.5 - p.z) / uLength, 0.0, 1.0);
        p.x += sin(ph - t * 3.4) * uSwim * (0.12 + t * t) * uLength;
        if (aTag > 0.5 && abs(position.x) > uLength * 0.05) p.y += sin(ph * 1.3 + position.z * 40.0) * uLength * 0.02;
        vLocal = position; vTag = aTag;
        vec4 wp = vec4(p, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp; n = mat3(instanceMatrix) * n;
        #endif
        wp = modelMatrix * wp;
        vWorld = wp.xyz; vNormalW = normalize(mat3(modelMatrix) * n);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      ${envGlsl}
      uniform vec3 uTop; uniform vec3 uBelly; uniform vec3 uEmissive; uniform vec3 uFin; uniform vec3 uSheen; uniform vec3 uEye;
      uniform float uHeight; uniform float uLength; uniform float uEmissiveLevel; uniform float uHighlight; uniform float uOpacity; uniform float uPattern;
      varying vec3 vLocal; varying vec3 vNormalW; varying vec3 vWorld; varying float vTag; varying float vVariant;
      ${noiseGlsl}
      // Voronoi cells: x = distance to nearest centre, y = border width (second minus first), z = cell id hash.
      vec3 cells(vec2 g) {
        vec2 ip = floor(g), fp = fract(g); float d1 = 8.0, d2 = 8.0; vec2 cell = ip;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 o = vec2(float(i), float(j));
          vec2 r = o + vec2(hash21(ip + o), hash21(ip + o + 7.3)) * 0.8 + 0.1 - fp;
          float d = dot(r, r);
          if (d < d1) { d2 = d1; d1 = d; cell = ip + o; } else if (d < d2) { d2 = d; }
        }
        return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), hash21(cell));
      }
      void main() {
        vec3 n = normalize(vNormalW);
        if (!gl_FrontFacing) n = -n;
        // Countershading with a small per-fish hue/brightness variation.
        vec3 top = uTop * (0.85 + 0.3 * vVariant) + vec3(0.0, 0.06, -0.04) * (vVariant - 0.5);
        vec3 belly = uBelly;
        if (uPattern > 4.5) {
          // Mixed reef fish: orange anthias, yellow tang, purple-and-gold basslet.
          if (vVariant < 0.45) { top = vec3(1.0, 0.42, 0.12); belly = vec3(1.0, 0.68, 0.55); }
          else if (vVariant < 0.75) { top = vec3(1.0, 0.82, 0.05); belly = vec3(1.0, 0.92, 0.35); }
          else { float front = smoothstep(-0.01, 0.01, vLocal.z); top = mix(vec3(1.0, 0.78, 0.08), vec3(0.58, 0.18, 0.92), front); belly = top * 1.1; }
        }
        vec3 base = mix(belly, top, smoothstep(-uHeight * 0.35, uHeight * 0.3, vLocal.y));
        if (uPattern > 0.5 && uPattern < 1.5) {          // reptile skin: pale-edged polygonal scales
          vec3 c = cells(vLocal.xz * 40.0 + vLocal.y * 25.0);
          base *= 0.8 + 0.3 * c.z;
          base = mix(base * 1.45 + 0.05, base, smoothstep(0.0, 0.12, c.y));
        } else if (uPattern > 1.5 && uPattern < 2.5 || uPattern > 4.5) { // fish scales + lateral line
          vec2 sc = vec2(vLocal.z, vLocal.y) / (uLength * 0.05);
          sc.x += 0.5 * mod(floor(sc.y), 2.0);
          float edge = smoothstep(0.28, 0.5, length(fract(sc) - 0.5));
          base *= 0.92 + 0.14 * (1.0 - edge);
          float lateral = smoothstep(0.004, 0.0, abs(vLocal.y - uHeight * 0.18 + sin(vLocal.z / uLength * 3.0) * uHeight * 0.05));
          base *= 1.0 - 0.25 * lateral * step(0.5, 1.0 - vTag);
        } else if (uPattern > 2.5 && uPattern < 3.5) {   // turtle scutes: amber plates with dark radiating streaks
          if (vLocal.y > 0.0) {
            vec3 c = cells(vLocal.xz / 0.11);
            float streak = 0.5 + 0.5 * sin(c.x * 40.0 + c.z * 20.0 + vLocal.x * 30.0);
            base = mix(vec3(0.16, 0.1, 0.04), vec3(0.62, 0.42, 0.16) * (0.8 + 0.4 * c.z), smoothstep(0.5, 0.05, c.x) * 0.7 + 0.3 * streak);
            base *= smoothstep(0.0, 0.06, c.y) * 0.6 + 0.4;
          } else { base = vec3(0.86, 0.8, 0.52); }
        } else if (uPattern > 3.5 && uPattern < 4.5) {   // shark: denticle grain and five gill slits
          base *= 0.94 + 0.08 * vnoise(vLocal.zy * 300.0);
          float gz = (uEye.x - 0.1 - vLocal.z) / 0.045;
          if (gz > 0.0 && gz < 5.0 && abs(vLocal.x) > 0.04 && abs(vLocal.y - 0.0) < 0.075 - gz * 0.004)
            base *= 1.0 - 0.6 * smoothstep(0.12, 0.0, abs(fract(gz) - 0.5) - 0.32);
        }
        float finAlpha = 1.0;
        if (vTag > 0.5) {
          if (vTag > 2.5) base = vec3(0.9, 0.88, 0.8);                    // teeth
          else if (vTag > 1.5) base = vec3(0.03);                          // dark fin tips
          else {
            base = mix(uFin * (0.8 + 0.25 * vVariant), top, uPattern > 4.5 ? 0.6 : 0.0);
            base *= 0.75 + 0.35 * smoothstep(-0.2, 0.8, sin(dot(vLocal.yz, vec2(1.0, 0.55)) / (uLength * 0.012))); // fin rays
            finAlpha = 0.78;
          }
        }
        // Eye: dark pupil, pale iris ring and a bright catchlight.
        if (uEye.z > 0.0) {
          vec2 eo = vec2(vLocal.z - uEye.x, vLocal.y - uEye.y);
          float e = length(eo);
          if (e < uEye.z * 1.45) base = mix(vec3(0.85, 0.8, 0.55), base, smoothstep(uEye.z * 1.2, uEye.z * 1.45, e));
          if (e < uEye.z) base = vec3(0.01, 0.01, 0.015);
          if (length(eo - uEye.z * vec2(0.3, 0.35)) < uEye.z * 0.28) base = vec3(1.6);
        }
        vec3 L = normalize(vec3(-0.25, 1.0, 0.25));
        vec3 V = normalize(cameraPosition - vWorld);
        float key = max((dot(n, L) + 0.25) / 1.25, 0.0);
        float hemi = 0.5 + 0.5 * n.y;
        float ndv = max(dot(n, V), 0.0);
        float rim = pow(1.0 - ndv, 2.6);
        float light = 0.1 + 0.9 * uLight;
        vec3 col = base * (0.2 + 0.62 * key + 0.28 * hemi) * light;
        // Wet specular highlight, view-dependent iridescence and sunlight caustics on the back.
        float spec = pow(max(dot(n, normalize(L + V)), 0.0), 48.0);
        col += vec3(0.9, 1.0, 1.0) * spec * 0.25 * uLight * (vTag > 0.5 ? 0.3 : 1.0);
        col += uSheen * pow(1.0 - ndv, 2.2) * 0.35 * light * (0.6 + 0.8 * vVariant);
        col += base * caustics(vWorld.xz * 1.1, uTime) * 0.55 * uLight * max(n.y, 0.0) * uFogAmount;
        col += base * finAlpha * pow(max(dot(-V, L), 0.0), 4.0) * (1.0 - finAlpha) * 2.5 * uLight; // light through fins
        col += rim * light * 0.1 * mix(top, vec3(0.6, 0.9, 0.95), 0.5);
        col += uEmissive * uEmissiveLevel;
        col += vec3(0.47, 0.85, 0.86) * (rim * 1.2 + 0.08) * uHighlight;
        float fogF = (1.0 - exp(-length(vWorld - cameraPosition) * uFog)) * uFogAmount;
        col = mix(col, uFogColor, fogF);
        gl_FragColor = vec4(col, uOpacity * finAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: DoubleSide,
    transparent: true,
  });
}

// ---------- fish school ----------
export function createFishSchool(count: number, reefMix = false) {
  const L = 0.15, H = 0.06;
  const zt = (t: number) => -L / 2 + t * L;
  const geometry = mergeParts([
    // Deep-bodied damselfish profile: blunt head, full mid-body, slim caudal peduncle.
    { geometry: body([[0, 0.004], [0.06, 0.006], [0.14, 0.011], [0.28, 0.021], [0.45, 0.029], [0.62, 0.031], [0.78, 0.027], [0.9, 0.019], [0.97, 0.01], [1, 0.001]], L, 0.42, 12) },
    // Deeply forked tail.
    { geometry: fin([[0, 0.002, zt(0.04)], [0, 0.036, zt(-0.2)], [0, 0.014, zt(-0.1)]]), tag: 1 },
    { geometry: fin([[0, -0.002, zt(0.04)], [0, -0.014, zt(-0.1)], [0, -0.036, zt(-0.2)]]), tag: 1 },
    { geometry: fin([[0, 0.01, zt(0.02)], [0, 0.014, zt(-0.1)], [0, -0.014, zt(-0.1)], [0, -0.01, zt(0.02)]]), tag: 1 },
    // Long dorsal and anal fins.
    { geometry: fin([[0, 0.026, zt(0.72)], [0, 0.046, zt(0.52)], [0, 0.044, zt(0.25)], [0, 0.016, zt(0.12)], [0, 0.025, zt(0.3)]]), tag: 1 },
    { geometry: fin([[0, -0.022, zt(0.48)], [0, -0.038, zt(0.3)], [0, -0.014, zt(0.14)]]), tag: 1 },
    // Pectoral fins, angled out from the flanks.
    { geometry: fin([[0.011, -0.004, zt(0.7)], [0.03, -0.012, zt(0.56)], [0.012, -0.012, zt(0.6)]]), tag: 1 },
    { geometry: fin([[-0.011, -0.004, zt(0.7)], [-0.03, -0.012, zt(0.56)], [-0.012, -0.012, zt(0.6)]]), tag: 1 },
  ]);
  const material = creatureMaterial({
    top: [0.0, 0.38, 0.58], belly: [0.32, 0.78, 0.72], fin: [0.2, 0.62, 0.78], sheen: [0.1, 0.75, 0.6],
    length: L, height: H, swim: 0.3, emissive: [0.2, 0.75, 0.8], instanced: true, eye: [L / 2 - 0.022, 0.007, 0.0055],
    pattern: reefMix ? 5 : 2,
  });
  if (reefMix) material.uniforms.uSheen.value.setRGB(0.45, 0.25, 0.4);
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = reefMix ? 'Reef fish' : 'Blue-green chromis school';
  const phase = new InstancedBufferAttribute(new Float32Array(count), 1);
  geometry.setAttribute('aPhase', phase);
  const variant = new Float32Array(count);
  for (let i = 0; i < count; i++) variant[i] = (i * 0.6180339) % 1;
  geometry.setAttribute('aVariant', new InstancedBufferAttribute(variant, 1));
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return { mesh, material, phase };
}

// ---------- reef shark ----------
export function createShark() {
  const L = 1.8, H = 0.34;
  const z = (t: number) => -L / 2 + t * L;
  const geometry = mergeParts([
    { geometry: body([[0, 0.03], [0.1, 0.045], [0.3, 0.11], [0.52, 0.17], [0.7, 0.168], [0.84, 0.13], [0.93, 0.085], [0.98, 0.04], [1, 0.004]], L, 0.85, 18) },
    { geometry: fin([[0, 0.14, z(0.62)], [0, 0.42, z(0.5)], [0, 0.15, z(0.43)]]), tag: 1 }, // dorsal
    { geometry: fin([[0, 0.05, z(0.25)], [0, 0.09, z(0.2)], [0, 0.04, z(0.17)]]), tag: 1 }, // second dorsal
    { geometry: fin([[0, 0.02, z(0.04)], [0, 0.3, z(-0.12)], [0, 0.04, z(-0.02)], [0, -0.13, z(-0.08)], [0, -0.03, z(0.02)]]), tag: 1 }, // tail
    { geometry: fin([[0, 0.3, z(-0.12)], [0, 0.42, z(-0.17)], [0, 0.34, z(-0.13)]]), tag: 2 }, // dark upper tail tip
    { geometry: fin([[0, -0.13, z(-0.08)], [0, -0.2, z(-0.11)], [0, -0.15, z(-0.07)]]), tag: 2 }, // dark lower tail tip
    { geometry: fin([[0.1, -0.06, z(0.68)], [0.42, -0.2, z(0.5)], [0.12, -0.08, z(0.55)]]), tag: 1 }, // pectoral R
    { geometry: fin([[-0.1, -0.06, z(0.68)], [-0.42, -0.2, z(0.5)], [-0.12, -0.08, z(0.55)]]), tag: 1 }, // pectoral L
    { geometry: fin([[0, -0.1, z(0.3)], [0, -0.17, z(0.25)], [0, -0.08, z(0.22)]]), tag: 1 }, // anal
    { geometry: fin([[0.05, -0.1, z(0.4)], [0.16, -0.17, z(0.33)], [0.06, -0.11, z(0.34)]]), tag: 1 }, // pelvic R
    { geometry: fin([[-0.05, -0.1, z(0.4)], [-0.16, -0.17, z(0.33)], [-0.06, -0.11, z(0.34)]]), tag: 1 }, // pelvic L
  ]);
  const material = creatureMaterial({ top: [0.24, 0.29, 0.33], belly: [0.84, 0.85, 0.84], fin: [0.27, 0.31, 0.35], sheen: [0.12, 0.18, 0.22], length: L, height: H, swim: 0.11, eye: [L / 2 - 0.16, 0.045, 0.016], pattern: 4 });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'Grey reef shark';
  mesh.renderOrder = 11;
  return { mesh, material };
}

// ---------- green sea turtle ----------
export function createTurtle() {
  const group = new Group(); group.name = 'Green sea turtle';
  const material = creatureMaterial({ top: [0.42, 0.3, 0.12], belly: [0.86, 0.8, 0.52], length: 0.9, height: 0.25, swim: 0, pattern: 3 });
  const skin = creatureMaterial({ top: [0.34, 0.33, 0.2], belly: [0.78, 0.74, 0.55], length: 0.9, height: 0.2, swim: 0, pattern: 1, eye: [0.03, 0.03, 0.011] });
  const shellGeometry = new SphereGeometry(1, 32, 18);
  const sp = shellGeometry.getAttribute('position');
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i), zz = sp.getZ(i);
    // Domed carapace tapering to the rear; the plastron underneath is nearly flat.
    sp.setY(i, y > 0 ? y * (1 - 0.15 * Math.max(0, -zz)) : y * 0.35);
  }
  shellGeometry.computeVertexNormals();
  shellGeometry.scale(0.36, 0.14, 0.46);
  const shell = new Mesh(shellGeometry, material); shell.name = 'Turtle shell';
  const headGeometry = new SphereGeometry(0.075, 18, 12);
  const hp = headGeometry.getAttribute('position');
  for (let i = 0; i < hp.count; i++) { const zz = hp.getZ(i); if (zz > 0) { hp.setY(i, hp.getY(i) * (1 - zz * 4)); hp.setX(i, hp.getX(i) * (1 - zz * 3)); } }
  headGeometry.computeVertexNormals();
  const head = new Mesh(headGeometry, skin); head.scale.set(1, 0.85, 1.35); head.position.set(0, 0.02, 0.52);
  const neck = new Mesh(new CylinderGeometry(0.05, 0.06, 0.14, 12, 1, true), skin); neck.rotation.x = Math.PI / 2; neck.position.set(0, 0.01, 0.44);
  group.add(shell, neck, head);
  const flippers: Mesh[] = [];
  const flipperGeometry = new SphereGeometry(1, 14, 8); flipperGeometry.scale(0.3, 0.025, 0.1); flipperGeometry.translate(0.28, 0, 0);
  const rearGeometry = new SphereGeometry(1, 12, 8); rearGeometry.scale(0.12, 0.02, 0.07); rearGeometry.translate(0.1, 0, 0);
  for (const [x, z, front, side] of [[0.24, 0.22, true, 1], [-0.24, 0.22, true, -1], [0.18, -0.36, false, 1], [-0.18, -0.36, false, -1]] as const) {
    const pivot = new Group(); pivot.position.set(x, -0.02, z); pivot.rotation.y = side > 0 ? -0.35 : Math.PI + 0.35;
    const flipper = new Mesh(front ? flipperGeometry : rearGeometry, skin);
    pivot.add(flipper); group.add(pivot);
    pivot.userData = { front, side };
    flippers.push(flipper);
  }
  return { group, materials: [material, skin], pivots: group.children.filter(c => c.userData.front !== undefined) };
}

// ---------- moon jelly ----------
export function jellyMaterial(tint: Rgb, baseAlpha: number, seed: number, tentacle = false) {
  return new ShaderMaterial({
    uniforms: { ...sharedEnv(), uTint: { value: new Color(...tint) }, uAlpha: { value: baseAlpha }, uSeed: { value: seed }, uStim: { value: 0 }, uHighlight: { value: 0 }, uPresence: { value: 1 } },
    vertexShader: `
      uniform float uTime; uniform float uSeed;
      varying vec3 vNormalW; varying vec3 vWorld; varying float vY; varying vec2 vXZ;
      void main() {
        vec3 p = position; vXZ = position.xz;
        float c = pow(0.5 + 0.5 * sin(uTime * 1.5 + uSeed), 3.0);
        ${tentacle
          ? 'p.x += sin(uTime * 1.2 + p.y * 7.0 + uSeed) * 0.04 * -p.y; p.z += cos(uTime * 0.9 + p.y * 5.0 + uSeed) * 0.03 * -p.y; p.y *= 1.0 + 0.08 * c;'
          : 'float rim = clamp(1.0 - p.y / 0.11, 0.0, 1.0); p.xz *= 1.0 - 0.16 * c * rim; p.y *= 1.0 + 0.07 * c;'}
        vY = position.y;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz; vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      ${envGlsl}
      uniform vec3 uTint; uniform float uAlpha; uniform float uStim; uniform float uHighlight; uniform float uPresence;
      varying vec3 vNormalW; varying vec3 vWorld; varying float vY; varying vec2 vXZ;
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        float rim = ${tentacle ? '0.6' : 'pow(1.0 - abs(dot(normalize(vNormalW), V)), 1.8)'};
        float light = 0.15 + 0.85 * uLight;
        vec3 glowCol = mix(vec3(0.47, 0.85, 0.86), vec3(0.62, 0.51, 0.83), 0.5 + 0.5 * sin(vY * 20.0));
        float glow = clamp(uGlow * 0.35 + uStim, 0.0, 1.5);
        float ang = atan(vXZ.y, vXZ.x), r = length(vXZ);
        float canals = ${tentacle ? '0.0' : 'smoothstep(0.9, 1.0, abs(cos(ang * 8.0))) * smoothstep(0.03, 0.12, r) + smoothstep(0.004, 0.0, abs(r - 0.15 - 0.006 * sin(ang * 64.0))) * 0.8'};
        vec3 col = uTint * light * (0.5 + rim + canals * 0.6) + glowCol * glow * (rim + canals) + vec3(0.47, 0.85, 0.86) * uHighlight * rim;
        float fogF = (1.0 - exp(-length(vWorld - cameraPosition) * uFog)) * uFogAmount;
        col = mix(col, uFogColor, fogF * 0.8);
        gl_FragColor = vec4(col, (uAlpha * (0.35 + rim) + glow * 0.25 * rim) * uPresence);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: DoubleSide,
  });
}

export function createJelly(seed: number) {
  const group = new Group(); group.name = 'Moon jelly';
  const bellPoints: Vector2[] = [];
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI * 0.5; bellPoints.push(new Vector2(Math.sin(a) * 0.17 + 0.001, Math.cos(a) * 0.11)); }
  bellPoints.push(new Vector2(0.15, -0.01));
  const bellMaterial = jellyMaterial([0.72, 0.8, 0.95], 0.16, seed);
  const bell = new Mesh(new LatheGeometry(bellPoints, 28), bellMaterial); bell.name = 'Moon jelly bell';
  const gonadMaterial = jellyMaterial([0.95, 0.62, 0.9], 0.55, seed);
  const rings = mergeParts([0, 1, 2, 3].map(i => {
    const t = new TorusGeometry(0.035, 0.008, 6, 18);
    t.rotateX(Math.PI / 2); t.translate(Math.cos(i * Math.PI / 2) * 0.05, 0.06, Math.sin(i * Math.PI / 2) * 0.05);
    return { geometry: t };
  }));
  const gonads = new Mesh(rings, gonadMaterial);
  const lines: number[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2, r = 0.155;
    for (let s = 0; s < 6; s++) lines.push(Math.cos(a) * r, -s * 0.07, Math.sin(a) * r, Math.cos(a) * r, -(s + 1) * 0.07, Math.sin(a) * r);
  }
  for (let i = 0; i < 4; i++) { // oral arms
    const a = i * Math.PI / 2 + 0.4;
    for (let s = 0; s < 5; s++) lines.push(Math.cos(a) * 0.02, -s * 0.06, Math.sin(a) * 0.02, Math.cos(a) * 0.03, -(s + 1) * 0.06, Math.sin(a) * 0.03);
  }
  const tentacleGeometry = new BufferGeometry();
  tentacleGeometry.setAttribute('position', new Float32BufferAttribute(lines, 3));
  tentacleGeometry.setAttribute('normal', new Float32BufferAttribute(new Float32Array(lines.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const tentacleMaterial = jellyMaterial([0.8, 0.85, 0.95], 0.25, seed, true);
  const tentacles = new LineSegments(tentacleGeometry, tentacleMaterial);
  // Line raycasts use a 1 m default threshold, which would make every jelly a ~2 m target
  // that intercepts rays aimed past it. Only the bell and rings are pickable.
  tentacles.raycast = () => {};
  group.add(bell, gonads, tentacles);
  return { group, bell, materials: [bellMaterial, gonadMaterial, tentacleMaterial] };
}

// ---------- glow sprite ----------
let glowTexture: CanvasTexture | null = null;
export function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.65)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  glowTexture = new CanvasTexture(canvas);
  return glowTexture;
}
export function createGlow(color: Rgb, size: number) {
  const material = new SpriteMaterial({ map: getGlowTexture(), color: new Color(...color), transparent: true, depthWrite: false, blending: AdditiveBlending });
  const sprite = new Sprite(material); sprite.scale.setScalar(size); sprite.renderOrder = 30;
  // Decorative only. Sprite.raycast throws without Raycaster.camera, and a glow
  // inside a ray-interactable creature would otherwise break the pointer every frame.
  sprite.raycast = () => {};
  return sprite;
}

// ---------- anglerfish ----------
export function createAnglerfish() {
  const group = new Group(); group.name = 'Deep-sea anglerfish';
  const L = 0.32;
  const geometry = mergeParts([
    { geometry: body([[0, 0.01], [0.2, 0.05], [0.5, 0.1], [0.75, 0.11], [0.92, 0.09], [1, 0.05]], L, 0.85, 14) },
    { geometry: fin([[0, 0.02, -L / 2 + 0.02], [0, 0.07, -L / 2 - 0.07], [0, -0.06, -L / 2 - 0.07]]), tag: 1 },
    // Underslung lower jaw, open, lined with needle teeth.
    { geometry: fin([[0.07, -0.03, L / 2 - 0.02], [0, -0.075, L / 2 + 0.06], [-0.07, -0.03, L / 2 - 0.02]]) },
    ...Array.from({ length: 12 }, (_, i) => {
      const a = (i / 11 - 0.5) * 2.2, t = new ConeGeometry(0.004, 0.035, 4);
      const lower = i % 2 === 0;
      t.rotateX(lower ? 0 : Math.PI);
      t.translate(Math.sin(a) * 0.06, lower ? -0.045 : 0.025, L / 2 + 0.02 + Math.cos(a) * 0.035);
      return { geometry: t, tag: 3 };
    }),
  ]);
  const material = creatureMaterial({ top: [0.09, 0.06, 0.07], belly: [0.16, 0.11, 0.1], fin: [0.12, 0.08, 0.09], length: L, height: 0.2, swim: 0.15, pattern: 1, eye: [L / 2 - 0.05, 0.05, 0.008] });
  const fish = new Mesh(geometry, material);
  const rodMaterial = creatureMaterial({ top: [0.12, 0.1, 0.1], belly: [0.12, 0.1, 0.1], length: 1, height: 1, swim: 0 });
  const rod = new Mesh(new CylinderGeometry(0.003, 0.004, 0.2, 5), rodMaterial);
  rod.position.set(0, 0.15, 0.17); rod.rotation.x = 0.7;
  const lure = new Mesh(new SphereGeometry(0.014, 12, 8), new ShaderMaterial({
    uniforms: { uLevel: { value: 1 } },
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uLevel; void main(){ gl_FragColor = vec4(vec3(0.55,0.95,1.0) * (0.4 + uLevel), 1.0); }',
  }));
  lure.position.set(0, 0.23, 0.25);
  const glow = createGlow([0.4, 0.85, 1.0], 0.22); glow.position.copy(lure.position);
  group.add(fish, rod, lure, glow);
  return { group, fish, materials: [material, rodMaterial], lure, glow };
}

// ---------- giant squid (hero silhouette) ----------
export function createGiantSquid() {
  const group = new Group(); group.name = 'Giant squid';
  const parts: Part[] = [];
  // Mantle along +X (tip) ; head at x≈0 ; arms trail toward −X.
  const mantle = new LatheGeometry([[0, 0.001], [0.15, 0.12], [0.6, 0.3], [1.4, 0.36], [2.1, 0.3], [2.4, 0.18], [2.55, 0.001]].map(([y, r]) => new Vector2(r, y)), 20);
  mantle.rotateZ(-Math.PI / 2); // +Y → +X
  parts.push({ geometry: mantle, tag: 0 });
  const finGeometry = new SphereGeometry(1, 16, 8); finGeometry.scale(0.42, 0.04, 0.55); finGeometry.translate(2.25, 0, 0);
  parts.push({ geometry: finGeometry, tag: 0 });
  const headGeometry = new SphereGeometry(0.3, 16, 12); headGeometry.scale(0.9, 1, 1); headGeometry.translate(-0.12, 0, 0);
  parts.push({ geometry: headGeometry, tag: 0 });
  const arm = (length: number, radius: number, angle: number, spread: number, tag: number) => {
    const g = new ConeGeometry(radius, length, 7, 18, true);
    g.rotateZ(Math.PI / 2); // tip toward −X
    g.translate(-0.3 - length / 2, Math.sin(angle) * spread, Math.cos(angle) * spread);
    parts.push({ geometry: g, tag });
  };
  for (let i = 0; i < 8; i++) arm(1.7, 0.07, (i / 8) * Math.PI * 2, 0.16, 1 + i);
  arm(4.2, 0.035, 0.6, 0.12, 9); arm(4.2, 0.035, 2.5, 0.12, 10);
  const geometry = mergeParts(parts);
  const material = new ShaderMaterial({
    uniforms: { ...sharedEnv(), uReveal: { value: 0 }, uHighlight: { value: 0 } },
    vertexShader: `
      uniform float uTime; attribute float aTag;
      varying vec3 vNormalW; varying vec3 vWorld; varying vec3 vLocal; varying float vTag;
      void main() {
        vec3 p = position;
        if (aTag > 0.5) {
          float along = clamp((-0.3 - p.x) / 4.2, 0.0, 1.0);
          float k = along * along * (aTag > 8.5 ? 1.6 : 2.6);
          p.y += sin(uTime * 0.7 + along * 6.0 + aTag * 1.7) * 0.32 * k;
          p.z += cos(uTime * 0.55 + along * 5.0 + aTag * 2.3) * 0.32 * k;
        }
        p.x *= 1.0 + 0.015 * sin(uTime * 0.6);
        vLocal = position; vTag = aTag;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz; vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      ${envGlsl}
      uniform float uReveal; uniform float uHighlight;
      varying vec3 vNormalW; varying vec3 vWorld; varying vec3 vLocal; varying float vTag;
      float hash(vec3 p) { return fract(sin(dot(floor(p), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 n = normalize(vNormalW); if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vWorld);
        float rim = pow(1.0 - abs(dot(n, V)), 2.2);
        vec3 body = vec3(0.09, 0.035, 0.04) * (0.4 + 0.6 * max(n.y, 0.0));
        vec3 rimCol = mix(vec3(0.47, 0.85, 0.86), vec3(0.62, 0.51, 0.83), 0.5 + 0.5 * sin(vLocal.x * 1.3 + uTime * 0.4));
        float spots = step(0.93, hash(vLocal * 9.0)) * (0.6 + 0.4 * sin(uTime * 2.0 + hash(vLocal * 9.0) * 30.0));
        vec3 col = body + rimCol * rim * 1.4 * uReveal + rimCol * spots * 0.9 * uReveal + rimCol * rim * uHighlight;
        float fogF = (1.0 - exp(-length(vWorld - cameraPosition) * uFog * 0.6)) * uFogAmount;
        col = mix(col, uFogColor, fogF * (1.0 - 0.6 * uReveal));
        gl_FragColor = vec4(col, uReveal * (0.55 + 0.45 * rim));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, side: DoubleSide, depthWrite: true,
  });
  const mesh = new Mesh(geometry, material); mesh.name = 'Giant squid body';
  const eye = new Mesh(new SphereGeometry(0.11, 16, 12), new ShaderMaterial({
    uniforms: { uReveal: { value: 0 } },
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform float uReveal; varying vec3 vN; void main(){ float f = 0.35 + 0.65 * pow(max(vN.z,0.0), 3.0); gl_FragColor = vec4(vec3(0.75,0.92,1.0) * f * uReveal, uReveal); }',
    transparent: true,
  }));
  eye.position.set(-0.1, 0.08, 0.26);
  // Generous pick volume around head and mantle: a ~9 m distant target must be easy to pinch.
  // Rendered with colour/depth writes masked (the SDK pointer skips invisible materials).
  const hitGeometry = new SphereGeometry(1, 12, 8); hitGeometry.scale(2.1, 0.75, 0.75); hitGeometry.translate(0.9, 0, 0);
  const hit = new Mesh(hitGeometry, new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  hit.name = 'Giant squid pick volume';
  group.add(mesh, eye, hit);
  return { group, mesh, material, eye };
}

// ---------- bioluminescent organisms ----------
export function createOrganisms(positions: Float32Array) {
  const count = positions.length / 3;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const glow = new Float32BufferAttribute(new Float32Array(count), 1);
  const hue = new Float32Array(count);
  for (let i = 0; i < count; i++) hue[i] = (i * 0.618) % 1;
  geometry.setAttribute('aGlow', glow);
  geometry.setAttribute('aHue', new Float32BufferAttribute(hue, 1));
  const material = new ShaderMaterial({
    uniforms: { ...sharedEnv(), uEnabled: { value: 0 } },
    vertexShader: `
      uniform float uTime; attribute float aGlow; attribute float aHue; varying float vGlow; varying float vHue;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.3 + aHue * 20.0), sin(uTime * 0.4 + aHue * 13.0), cos(uTime * 0.25 + aHue * 9.0)) * 0.06;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vGlow = aGlow; vHue = aHue;
        gl_PointSize = clamp((14.0 + 46.0 * aGlow) / max(0.5, -mv.z), 1.5, 48.0);
      }`,
    fragmentShader: `
      uniform float uEnabled; varying float vGlow; varying float vHue;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float core = 1.0 - smoothstep(0.0, 0.5, d);
        vec3 col = mix(vec3(0.47, 0.85, 0.86), vec3(0.62, 0.51, 0.83), step(0.55, vHue));
        float a = core * core * (0.06 + vGlow) * uEnabled;
        gl_FragColor = vec4(col * (0.6 + vGlow), a);
      }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.name = 'Bioluminescent organisms'; points.frustumCulled = false; points.renderOrder = 25;
  return { points, material, glow };
}

// ---------- light pulse wavefront ----------
export function createPulseShell() {
  const material = new ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform float uOpacity; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(mix(vec3(0.47,0.85,0.86), vec3(0.62,0.51,0.83), f) * f, f * uOpacity); }',
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  });
  const mesh = new Mesh(new SphereGeometry(1, 40, 24), material);
  mesh.name = 'Light pulse'; mesh.visible = false; mesh.renderOrder = 26; mesh.frustumCulled = false;
  return { mesh, material };
}

// ---------- portal pearl (the opening sphere) ----------
/** A luminous pearl with a slowly swirling interior and a bright fresnel rim.
 *  Exposes color / emissive / emissiveIntensity like MeshStandardMaterial for the sphere system. */
export class PortalMaterial extends ShaderMaterial {
  constructor() {
    super({
      uniforms: { uColor: { value: new Color(0x1677ff) }, uEmissive: { value: new Color(0x096bff) }, uIntensity: { value: 1.4 }, uClock: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix*normal); vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `
        uniform vec3 uColor; uniform vec3 uEmissive; uniform float uIntensity; uniform float uClock;
        varying vec3 vN; varying vec3 vP;
        void main() {
          vec3 n = normalize(vN);
          float f = pow(1.0 - abs(n.z), 2.2);
          vec3 q = normalize(vP);
          float swirl = 0.5 + 0.5 * sin(atan(q.z, q.x) * 3.0 + q.y * 5.0 + uClock * 1.1 + sin(q.y * 7.0 - uClock * 0.7) * 1.5);
          float bands = 0.5 + 0.5 * sin(q.y * 14.0 + swirl * 3.0 - uClock * 0.8);
          vec3 core = mix(uColor * 0.25, mix(uColor, vec3(0.75, 1.0, 1.0), 0.35), swirl * (0.55 + 0.45 * bands));
          vec3 col = core * (0.5 + 0.5 * (1.0 - f)) + uEmissive * uIntensity * (0.18 + f * 0.9);
          col += vec3(1.0) * pow(max(dot(n, normalize(vec3(-0.4, 0.55, 1.0))), 0.0), 60.0) * 0.9;
          gl_FragColor = vec4(col, 0.6 + 0.4 * f);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
    });
  }
  get color() { return (this.uniforms.uColor.value as Color); }
  get emissive() { return (this.uniforms.uEmissive.value as Color); }
  get emissiveIntensity() { return this.uniforms.uIntensity.value as number; }
  set emissiveIntensity(v: number) { this.uniforms.uIntensity.value = v; }
  set clock(v: number) { this.uniforms.uClock.value = v; }
}

// ---------- NAMI ----------
export function createNami() {
  const group = new Group(); group.name = 'NAMI';
  const core = new Mesh(new SphereGeometry(0.018, 20, 14), new ShaderMaterial({
    uniforms: { uTime: env.uTime, uTalk: { value: 0 } },
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform float uTime; uniform float uTalk; varying vec3 vN; void main(){ float f = 0.55 + 0.45*pow(max(vN.z,0.0),2.0); vec3 c = mix(vec3(0.47,0.85,0.86), vec3(0.62,0.51,0.83), 0.5+0.5*sin(uTime*0.8)); gl_FragColor = vec4(c*(0.9+0.6*uTalk)*f + 0.25, 1.0); }',
  }));
  const halo = createGlow([0.5, 0.85, 0.9], 0.13);
  group.add(core, halo);
  return { group, core, halo };
}

// ---------- rising bubbles (room opening) ----------
export function createBubbles(count: number) {
  const positions = new Float32Array(count * 3), seeds = new Float32Array(count);
  let s = 77;
  const random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < count; i++) {
    const a = random() * Math.PI * 2, r = 0.1 + random() * 0.22;
    positions[i * 3] = Math.cos(a) * r; positions[i * 3 + 1] = random(); positions[i * 3 + 2] = Math.sin(a) * r * 0.5;
    seeds[i] = random();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));
  const material = new ShaderMaterial({
    uniforms: { uTime: env.uTime, uOpacity: { value: 0 } },
    vertexShader: `uniform float uTime; attribute float aSeed; varying float vA;
      void main(){ vec3 p = position; float t = fract(p.y + uTime * (0.05 + aSeed * 0.06)); p.y = -0.2 + t * 0.6; p.x += sin(uTime * 2.0 + aSeed * 30.0) * 0.012;
        vA = sin(t * 3.14159); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp((1.5 + aSeed * 3.0) / max(0.3, -mv.z), 1.0, 9.0); }`,
    fragmentShader: `uniform float uOpacity; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float ring = smoothstep(0.5, 0.38, d) * (0.35 + 0.65 * smoothstep(0.25, 0.45, d)); gl_FragColor = vec4(vec3(0.8, 0.97, 1.0), ring * vA * uOpacity * 0.8); }`,
    transparent: true, depthWrite: false,
  });
  const points = new Points(geometry, material); points.name = 'Opening bubbles'; points.frustumCulled = false;
  return { points, material };
}
