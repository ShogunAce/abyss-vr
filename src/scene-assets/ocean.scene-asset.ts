import { createReef, rockGeometry, seabedHeight } from './reef.scene-asset.js';
import { BackSide, Color, BufferGeometry, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, Mesh, Object3D, PlaneGeometry, Points, ShaderMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';

// A stationary 110 m underwater volume. Origin is the initial viewer eye position.
// No surfaces within the seated interaction envelope; seabed is 3.4 m below it.
const vertex = `
  varying vec3 vPosition;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec4 p = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      n = mat3(instanceMatrix) * n;
    #endif
    // Pre-instancing local position: shaders that read vPosition need per-instance local coordinates.
    vPosition = position;
    vWorld = (modelMatrix * p).xyz;
    vNormal = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }`;
const waterColor = `
  vec3 water(vec3 direction) {
    float elevation = direction.y * 0.5 + 0.5;
    return mix(mix(uDeep, uBlue, smoothstep(0.05, 0.62, elevation)), uShallow, pow(max(direction.y, 0.0), 2.5));
  }`;
// Depth-driven environment uniforms. Defaults are the sunlit band; OceanSystem
// writes runtime copies from the Ocean Director every frame.
export function environmentUniforms() {
  return {
    uShallow: { value: new Color(0.09, 0.46, 0.49) },
    uBlue: { value: new Color(0.012, 0.18, 0.23) },
    uDeep: { value: new Color(0.005, 0.038, 0.075) },
    uLight: { value: 1 }, uFog: { value: 0.095 }, uGlow: { value: 0 },
  };
}
const environmentGlsl = 'uniform vec3 uShallow; uniform vec3 uBlue; uniform vec3 uDeep; uniform float uLight; uniform float uFog; uniform float uGlow;';
function material(fragment: string, extras: Record<string, { value: unknown }> = {}) {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uReveal: { value: 0 }, ...environmentUniforms(), ...extras },
    vertexShader: vertex,
    fragmentShader: `uniform float uTime; uniform float uReveal; ${environmentGlsl} varying vec3 vPosition; varying vec3 vWorld; varying vec3 vNormal; ${waterColor} ${fragment}`,
    transparent: true, depthWrite: false,
  });
}

export function createOcean() {
  const root = new Group(); root.name = 'Ocean environment';
  // Scenery that shifts during bounded hand-directed travel. The enclosing water
  // volume stays centred on the viewer so its horizon never comes closer.
  const frame = new Group(); frame.name = 'Ocean travel frame'; root.add(frame);
  const skyMaterial = material(`
    void main() {
      vec3 d = normalize(vPosition);
      vec3 col = water(d);
      vec3 sun = normalize(vec3(-0.3, 1.0, -0.55));
      float glow = pow(max(dot(d, sun), 0.0), 32.0);
      col += vec3(0.20, 0.38, 0.32) * glow * 0.42 * uLight;
      gl_FragColor = vec4(col, uReveal);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`);
  skyMaterial.side = BackSide;
  const sky = new Mesh(new SphereGeometry(55, 48, 32), skyMaterial);
  sky.name = 'Water volume'; sky.renderOrder = -100;
  root.add(sky);

  // Terrain: dunes, reef mounds and a calm hollow beneath the viewer (see seabedHeight).
  const floorGeometry = new PlaneGeometry(90, 90, 120, 120);
  floorGeometry.rotateX(-Math.PI / 2);
  const positions = floorGeometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    positions.setY(i, seabedHeight(positions.getX(i), positions.getZ(i)));
  }
  floorGeometry.computeVertexNormals();
  const groundMaterial = material(`
    void main() {
      vec3 d = normalize(vWorld - cameraPosition);
      float distanceToEye = length(vWorld - cameraPosition);
      vec2 q = vPosition.xz;
      // Wave-formed sand ripples whose direction wanders across the seabed.
      float warp = sin(q.x * 0.23 + sin(q.y * 0.31) * 1.7) + sin(q.y * 0.17 - q.x * 0.11);
      float ang = warp * 0.6 + 0.4;
      vec2 dir = vec2(cos(ang), sin(ang));
      float phase = dot(q, dir) * 13.0 + warp * 3.0;
      float ripple = 0.5 + 0.5 * sin(phase + 0.6 * sin(phase));
      float grain = fract(sin(dot(floor(q * 95.0), vec2(12.9898, 78.233))) * 43758.5453);
      float patchy = 0.5 + 0.5 * sin(q.x * 0.4 + sin(q.y * 0.5) * 2.0) * sin(q.y * 0.33 + 1.2);
      vec3 sand = mix(vec3(0.3, 0.29, 0.23), vec3(0.55, 0.52, 0.41), 0.4 + 0.4 * patchy);
      sand *= (0.86 + 0.2 * ripple) * (0.93 + 0.09 * grain);
      // Steep mound flanks read as rock; scattered algae and rubble on the reef.
      float slope = 1.0 - clamp(normalize(vNormal).y, 0.0, 1.0);
      sand = mix(sand, vec3(0.33, 0.34, 0.31) * (0.85 + 0.2 * grain), smoothstep(0.22, 0.55, slope));
      float algae = smoothstep(0.7, 0.95, sin(q.x * 3.1 + sin(q.y * 2.7)) * sin(q.y * 2.3 + q.x * 0.7));
      sand = mix(sand, vec3(0.25, 0.42, 0.2), algae * 0.4 * smoothstep(-3.0, -2.2, vPosition.y));
      sand *= vec3(0.72, 0.88, 0.95); // water absorbs reds first
      float caustic = pow(0.5 + 0.5 * sin(q.x * 1.6 + sin(q.y * 1.9 + uTime * 0.18) * 1.8), 12.0);
      caustic *= pow(0.5 + 0.5 * sin(q.y * 1.4 - uTime * 0.12), 2.0);
      float key = 0.35 + 0.65 * max(dot(normalize(vNormal), normalize(vec3(-0.3, 1.0, -0.2))), 0.0);
      vec3 lit = sand * key * (0.08 + 0.92 * uLight) + vec3(0.4, 0.6, 0.5) * caustic * 0.32 * uLight * uLight;
      vec3 col = mix(lit, water(d), 1.0 - exp(-distanceToEye * uFog));
      gl_FragColor = vec4(col, uReveal);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`);
  const seabed = new Mesh(floorGeometry, groundMaterial);
  groundMaterial.userData.solid = true;
  seabed.name = 'Rippled sand'; seabed.renderOrder = -90;
  frame.add(seabed);

  const rockMaterial = material(`
    void main() {
      float lighting = 0.26 + max(dot(normalize(vNormal), normalize(vec3(-0.3, 1.0, -0.2))), 0.0) * 0.7;
      float strata = sin(vWorld.y * 7.0 + sin(vWorld.x * 3.0)) * 0.03;
      vec3 nn = normalize(vNormal);
      vec3 stone = vec3(0.3, 0.31, 0.28) + strata;
      // Coralline crust and algae on upward faces; darker crevices.
      float crust = smoothstep(0.35, 0.8, nn.y) * (0.5 + 0.5 * sin(vWorld.x * 4.3 + sin(vWorld.z * 3.7) * 2.0));
      stone = mix(stone, vec3(0.72, 0.38, 0.48), crust * 0.55);
      stone = mix(stone, vec3(0.22, 0.4, 0.2), smoothstep(0.6, 0.9, sin(vWorld.z * 5.1 + vWorld.x * 2.3)) * smoothstep(0.2, 0.7, nn.y) * 0.5);
      stone *= vec3(0.78, 0.9, 0.95) * lighting * (0.08 + 0.92 * uLight);
      float distanceToEye = length(vWorld - cameraPosition);
      vec3 col = mix(stone, water(normalize(vWorld - cameraPosition)), 1.0 - exp(-distanceToEye * uFog * 0.79));
      gl_FragColor = vec4(col, uReveal);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`);
  const reef = new InstancedMesh(rockGeometry(), rockMaterial, 42);
  rockMaterial.userData.solid = true;
  reef.name = 'Distant reef outcrops'; reef.renderOrder = -80;
  const dummy = new Object3D();
  let seed = 90210;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 42; i++) {
    const angle = i / 42 * Math.PI * 2;
    const radius = 7 + random() * 17;
    const height = 0.5 + random() * 3.3;
    const rx = Math.cos(angle) * radius, rz = Math.sin(angle) * radius;
    dummy.position.set(rx, seabedHeight(rx, rz) + height * 0.2, rz);
    dummy.scale.set(0.8 + random() * 1.8, height, 0.8 + random() * 2);
    dummy.rotation.set(random() * 0.3, random() * Math.PI, random() * 0.15);
    dummy.updateMatrix(); reef.setMatrixAt(i, dummy.matrix);
  }
  frame.add(reef);

  // Living reef: corals, sponges, anemones, seagrass and starfish (one instanced draw per type).
  frame.add(createReef({ uniforms: environmentUniforms, glsl: `${environmentGlsl} ${waterColor}` }));

  const surfaceMaterial = material(`
    void main() {
      vec2 p = vPosition.xy;
      float waves = sin(p.x * 0.75 + uTime * 0.12 + sin(p.y * 0.85)) * sin(p.y * 0.65 - uTime * 0.1);
      float lines = pow(abs(waves), 9.0);
      float centre = exp(-length(p) * 0.055);
      float edge = 1.0 - smoothstep(14.0, 34.0, length(p));
      vec3 col = water(normalize(vWorld - cameraPosition)) + vec3(0.10, 0.23, 0.19) * lines * centre * uLight;
      gl_FragColor = vec4(col, uReveal * edge * 0.55);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`);
  surfaceMaterial.side = DoubleSide;
  const surface = new Mesh(new PlaneGeometry(80, 80), surfaceMaterial);
  surface.name = 'Overhead water surface'; surface.rotation.x = Math.PI / 2; surface.position.y = 5.8;
  surface.renderOrder = -70; frame.add(surface);

  // Broad, soft light shafts: low contrast, slow movement, no strobing.
  const shaftMaterial = material(`
    void main() {
      float edge = pow(max(0.0, 1.0 - abs(vPosition.x)), 3.0);
      float end = smoothstep(-1.0, -0.7, vPosition.y) * (1.0 - smoothstep(0.5, 1.0, vPosition.y));
      float breathe = 0.9 + 0.1 * sin(uTime * 0.15 + vWorld.x);
      gl_FragColor = vec4(0.28, 0.73, 0.69, edge * end * breathe * uReveal * 0.045 * uLight);
    }`);
  shaftMaterial.side = DoubleSide;
  // Seven shafts in one instanced draw call.
  const shafts = new InstancedMesh(new PlaneGeometry(2, 2), shaftMaterial, 7);
  shafts.name = 'Sun shafts';
  for (let i = 0; i < 7; i++) {
    dummy.position.set(-8 + i * 2.6, 1.7, -7 - i * 1.2);
    dummy.scale.set(0.7 + i * 0.16, 5, 1);
    dummy.rotation.set(0, (i - 3) * 0.12, -0.22);
    dummy.updateMatrix(); shafts.setMatrixAt(i, dummy.matrix);
  }
  shafts.renderOrder = -60; shafts.frustumCulled = false; frame.add(shafts);

  const motePositions = new Float32Array(360 * 3);
  for (let i = 0; i < 360; i++) {
    const a = random() * Math.PI * 2, radius = 1.7 + random() * 14;
    motePositions[i * 3] = Math.cos(a) * radius;
    motePositions[i * 3 + 1] = -2.8 + random() * 8;
    motePositions[i * 3 + 2] = Math.sin(a) * radius;
  }
  const moteGeometry = new BufferGeometry();
  moteGeometry.setAttribute('position', new Float32BufferAttribute(motePositions, 3));
  const moteMaterial = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uReveal: { value: 0 }, uDrift: { value: new Vector3() }, uTravel: { value: new Vector3() }, ...environmentUniforms() }, transparent: true, depthWrite: false,
    vertexShader: `uniform float uTime; uniform vec3 uDrift; uniform vec3 uTravel; varying float vAlpha; void main() {
      // Passive drift and travel wrap inside a 32 m cell centred on the viewer: endless suspension, fixed count.
      vec3 p = position + uDrift - uTravel;
      p.xz = mod(p.xz + 16.0, 32.0) - 16.0;
      p.y = mod(p.y + 2.8, 8.0) - 2.8;
      p.x += sin(uTime * 0.11 + p.z) * 0.08; p.y += sin(uTime * 0.15 + p.x) * 0.1;
      vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(10.0 / max(1.0, -mv.z), 1.0, 4.0); vAlpha = 0.25 + 0.3 * sin(position.x * 7.0) * sin(position.x * 7.0);
    }`,
    fragmentShader: `uniform float uReveal; ${environmentGlsl} varying float vAlpha; void main() {
      float soft = 1.0 - smoothstep(0.05, 0.5, length(gl_PointCoord - 0.5));
      // Sunlit motes scatter daylight; deep motes become sparse cyan/violet bioluminescence.
      vec3 lit = vec3(0.46, 0.87, 0.82) * (0.25 + 0.75 * uLight);
      vec3 glow = mix(vec3(0.47, 0.85, 0.86), vec3(0.62, 0.51, 0.83), step(0.5, fract(vAlpha * 13.0)));
      float sparse = step(0.62, fract(vAlpha * 7.3));
      vec3 col = mix(lit, glow, uGlow * sparse);
      float alpha = soft * vAlpha * uReveal * mix(1.0, 0.4 + 1.6 * sparse, uGlow);
      gl_FragColor = vec4(col, alpha);
    }`,
  });
  const motes = new Points(moteGeometry, moteMaterial); motes.name = 'Ocean suspension'; motes.renderOrder = -50; root.add(motes);
  return root;
}
