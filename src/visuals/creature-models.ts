// Runtime-only procedural creature models and shaders (not manifest assets).
// Every creature reads shared environment uniforms so it darkens and fogs with depth.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, DoubleSide,
  Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, LatheGeometry, LineSegments, Mesh,
  Points, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, TorusGeometry, Vector2,
} from '@iwsdk/core';

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
};

export function creatureMaterial(o: CreatureOptions) {
  return new ShaderMaterial({
    uniforms: {
      ...sharedEnv(),
      uTop: { value: new Color(...o.top) }, uBelly: { value: new Color(...o.belly) },
      uLength: { value: o.length }, uHeight: { value: o.height }, uSwim: { value: o.swim }, uPhase: { value: 0 },
      uEmissive: { value: new Color(...(o.emissive ?? [0, 0, 0])) }, uEmissiveLevel: { value: 0 },
      uHighlight: { value: 0 }, uOpacity: { value: 1 }, uPattern: { value: o.pattern ?? 0 },
    },
    vertexShader: `
      uniform float uLength; uniform float uSwim; uniform float uPhase;
      #ifdef USE_INSTANCING
        attribute float aPhase;
      #endif
      varying vec3 vLocal; varying vec3 vNormalW; varying vec3 vWorld;
      void main() {
        vec3 p = position;
        float ph = uPhase;
        #ifdef USE_INSTANCING
          ph = aPhase;
        #endif
        // Travelling body wave: stiff head, flexible tail.
        float t = clamp((uLength * 0.5 - p.z) / uLength, 0.0, 1.0);
        p.x += sin(ph - t * 3.4) * uSwim * (0.12 + t * t) * uLength;
        vLocal = position;
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
      uniform vec3 uTop; uniform vec3 uBelly; uniform vec3 uEmissive;
      uniform float uHeight; uniform float uEmissiveLevel; uniform float uHighlight; uniform float uOpacity; uniform float uPattern;
      varying vec3 vLocal; varying vec3 vNormalW; varying vec3 vWorld;
      void main() {
        vec3 n = normalize(vNormalW);
        if (!gl_FrontFacing) n = -n;
        // Countershading: dark back, pale belly.
        vec3 base = mix(uBelly, uTop, smoothstep(-uHeight * 0.35, uHeight * 0.3, vLocal.y));
        if (uPattern > 0.5) {
          float s = sin(vLocal.x * 34.0 + sin(vLocal.z * 21.0)) * sin(vLocal.z * 27.0);
          base *= 0.78 + 0.3 * smoothstep(0.1, 0.9, s);
        }
        float key = max(dot(n, normalize(vec3(-0.25, 1.0, 0.25))), 0.0);
        float hemi = 0.5 + 0.5 * n.y;
        vec3 V = normalize(cameraPosition - vWorld);
        float rim = pow(1.0 - max(dot(n, V), 0.0), 2.6);
        float light = 0.1 + 0.9 * uLight;
        vec3 col = base * (0.25 + 0.6 * key + 0.3 * hemi) * light;
        // Caustic shimmer on the back in bright water.
        col += uTop * 0.25 * uLight * key * pow(0.5 + 0.5 * sin(vWorld.x * 7.0 + uTime * 1.3 + sin(vWorld.z * 5.0)), 6.0);
        col += rim * light * 0.15 * mix(uTop, vec3(0.6, 0.9, 0.95), 0.5);
        col += uEmissive * uEmissiveLevel;
        col += vec3(0.47, 0.85, 0.86) * (rim * 1.2 + 0.08) * uHighlight;
        float fogF = (1.0 - exp(-length(vWorld - cameraPosition) * uFog)) * uFogAmount;
        col = mix(col, uFogColor, fogF);
        gl_FragColor = vec4(col, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: DoubleSide,
    transparent: true,
  });
}

// ---------- fish school ----------
export function createFishSchool(count: number) {
  const L = 0.16, H = 0.058;
  const geometry = mergeParts([
    { geometry: body([[0, 0.006], [0.08, 0.009], [0.2, 0.018], [0.45, 0.027], [0.7, 0.029], [0.88, 0.022], [0.97, 0.012], [1, 0.001]], L, 0.45, 10) },
    { geometry: fin([[0, 0, -L / 2 + 0.01], [0, 0.034, -L / 2 - 0.035], [0, 0.006, -L / 2 - 0.02], [0, -0.006, -L / 2 - 0.02], [0, -0.034, -L / 2 - 0.035]]) },
    { geometry: fin([[0, 0.025, 0.02], [0, 0.045, -0.02], [0, 0.026, -0.05]]) },
  ]);
  const material = creatureMaterial({ top: [0.03, 0.36, 0.52], belly: [0.42, 0.8, 0.78], length: L, height: H, swim: 0.32, emissive: [0.2, 0.75, 0.8], instanced: true });
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = 'Blue-green chromis school';
  const phase = new InstancedBufferAttribute(new Float32Array(count), 1);
  geometry.setAttribute('aPhase', phase);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return { mesh, material, phase };
}

// ---------- reef shark ----------
export function createShark() {
  const L = 1.8, H = 0.34;
  const z = (t: number) => -L / 2 + t * L;
  const geometry = mergeParts([
    { geometry: body([[0, 0.03], [0.1, 0.045], [0.3, 0.11], [0.55, 0.17], [0.75, 0.16], [0.9, 0.11], [0.97, 0.06], [1, 0.01]], L, 0.85, 16) },
    { geometry: fin([[0, 0.14, z(0.62)], [0, 0.42, z(0.5)], [0, 0.15, z(0.43)]]) }, // dorsal
    { geometry: fin([[0, 0.05, z(0.25)], [0, 0.09, z(0.2)], [0, 0.04, z(0.17)]]) }, // second dorsal
    { geometry: fin([[0, 0.02, z(0.04)], [0, 0.42, z(-0.17)], [0, 0.3, z(-0.13)], [0, 0.04, z(-0.02)], [0, -0.2, z(-0.11)], [0, -0.03, z(0.02)]]) }, // heterocercal tail
    { geometry: fin([[0.1, -0.06, z(0.68)], [0.42, -0.2, z(0.5)], [0.12, -0.08, z(0.55)]]) }, // pectoral R
    { geometry: fin([[-0.1, -0.06, z(0.68)], [-0.42, -0.2, z(0.5)], [-0.12, -0.08, z(0.55)]]) }, // pectoral L
    { geometry: fin([[0, -0.1, z(0.3)], [0, -0.17, z(0.25)], [0, -0.08, z(0.22)]]) }, // anal
  ]);
  const material = creatureMaterial({ top: [0.26, 0.31, 0.35], belly: [0.82, 0.84, 0.83], length: L, height: H, swim: 0.11 });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'Grey reef shark';
  mesh.renderOrder = 11;
  return { mesh, material };
}

// ---------- green sea turtle ----------
export function createTurtle() {
  const group = new Group(); group.name = 'Green sea turtle';
  const material = creatureMaterial({ top: [0.27, 0.24, 0.13], belly: [0.72, 0.66, 0.45], length: 0.9, height: 0.25, swim: 0, pattern: 1 });
  const skin = creatureMaterial({ top: [0.3, 0.32, 0.22], belly: [0.62, 0.62, 0.48], length: 0.9, height: 0.2, swim: 0, pattern: 1 });
  const shellGeometry = new SphereGeometry(1, 28, 16);
  shellGeometry.scale(0.36, 0.13, 0.46);
  const shell = new Mesh(shellGeometry, material); shell.name = 'Turtle shell';
  const head = new Mesh(new SphereGeometry(0.075, 16, 12), skin); head.scale.set(1, 0.85, 1.35); head.position.set(0, 0.02, 0.5);
  group.add(shell, head);
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
      varying vec3 vNormalW; varying vec3 vWorld; varying float vY;
      void main() {
        vec3 p = position;
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
      varying vec3 vNormalW; varying vec3 vWorld; varying float vY;
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        float rim = ${tentacle ? '0.6' : 'pow(1.0 - abs(dot(normalize(vNormalW), V)), 1.8)'};
        float light = 0.15 + 0.85 * uLight;
        vec3 glowCol = mix(vec3(0.47, 0.85, 0.86), vec3(0.62, 0.51, 0.83), 0.5 + 0.5 * sin(vY * 20.0));
        float glow = clamp(uGlow * 0.35 + uStim, 0.0, 1.5);
        vec3 col = uTint * light * (0.5 + rim) + glowCol * glow * rim + vec3(0.47, 0.85, 0.86) * uHighlight * rim;
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
    { geometry: fin([[0, 0.02, -L / 2 + 0.02], [0, 0.07, -L / 2 - 0.07], [0, -0.06, -L / 2 - 0.07]]) },
  ]);
  const material = creatureMaterial({ top: [0.07, 0.05, 0.06], belly: [0.12, 0.09, 0.09], length: L, height: 0.2, swim: 0.15 });
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
  group.add(mesh, eye);
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
