import { noiseGlsl } from '../visuals/glsl.js';
import { createReef, rockGeometry, seabedHeight } from './reef.scene-asset.js';
import { BackSide, Color, Vector4, BufferGeometry, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, Mesh, Object3D, PlaneGeometry, Points, ShaderMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';

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
    uShallow: { value: new Color(0.1, 0.56, 0.6) },
    uBlue: { value: new Color(0.012, 0.24, 0.33) },
    uDeep: { value: new Color(0.004, 0.05, 0.11) },
    uLight: { value: 1 }, uFog: { value: 0.095 }, uGlow: { value: 0 },
  };
}
const environmentGlsl = 'uniform vec3 uShallow; uniform vec3 uBlue; uniform vec3 uDeep; uniform float uLight; uniform float uFog; uniform float uGlow;';
function material(fragment: string, extras: Record<string, { value: unknown }> = {}) {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uReveal: { value: 0 }, ...environmentUniforms(), ...extras },
    vertexShader: vertex,
    fragmentShader: `uniform float uTime; uniform float uReveal; ${environmentGlsl} varying vec3 vPosition; varying vec3 vWorld; varying vec3 vNormal; ${waterColor} ${noiseGlsl} ${fragment}`,
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
      col += vec3(0.30, 0.55, 0.48) * glow * 0.5 * uLight + vec3(0.25, 0.5, 0.45) * pow(max(dot(d, sun), 0.0), 6.0) * 0.18 * uLight;
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
      vec3 nn = normalize(vNormal);
      // Wave-formed sand ripples whose direction wanders across the seabed (lit via their slope).
      float warp = sin(q.x * 0.23 + sin(q.y * 0.31) * 1.7) + sin(q.y * 0.17 - q.x * 0.11) + (vnoise(q * 0.35) - 0.5) * 1.6;
      float ang = warp * 0.6 + 0.4;
      vec2 dir = vec2(cos(ang), sin(ang));
      float phase = dot(q, dir) * 13.0 + warp * 3.0;
      float ripple = 0.5 + 0.5 * sin(phase + 0.6 * sin(phase));
      float slopeR = cos(phase + 0.6 * sin(phase)) * (1.0 + 0.6 * cos(phase));
      float rippleFade = 1.0 - smoothstep(4.0, 14.0, distanceToEye);
      float grain = hash21(floor(q * 140.0));
      float n1 = fbm3(q * 0.6);
      float patchy = smoothstep(0.2, 0.8, vnoise(q * 0.18 + 3.1));
      vec3 sand = mix(vec3(0.36, 0.32, 0.24), vec3(0.64, 0.58, 0.45), 0.25 + 0.6 * patchy);
      sand *= mix(1.0, 0.82 + 0.28 * ripple, rippleFade) * (0.9 + 0.14 * grain) * (0.9 + 0.2 * n1);
      // Darker, damper troughs collect detritus; scattered shell fragments catch the light.
      sand *= 1.0 - 0.12 * smoothstep(0.6, 0.0, ripple) * rippleFade;
      float shell = step(0.985, hash21(floor(q * 38.0))) * rippleFade;
      sand = mix(sand, vec3(0.95, 0.9, 0.82), shell * 0.7);
      // Steep mound flanks read as rock; algae turf on reef mounds, darker hollows.
      float slope = 1.0 - clamp(nn.y, 0.0, 1.0);
      sand = mix(sand, vec3(0.36, 0.34, 0.3) * (0.8 + 0.4 * n1), smoothstep(0.22, 0.55, slope));
      float turf = smoothstep(0.6, 0.85, vnoise(q * 0.9 + 7.0)) * smoothstep(-3.0, -2.2, vPosition.y);
      sand = mix(sand, mix(vec3(0.22, 0.42, 0.16), vec3(0.42, 0.5, 0.18), n1), turf * 0.55);
      sand *= 0.8 + 0.2 * smoothstep(-3.9, -3.0, vPosition.y);
      sand *= vec3(0.76, 0.9, 0.96); // water absorbs reds first
      vec3 L = normalize(vec3(-0.3, 1.0, -0.2));
      float key = 0.32 + 0.68 * max(dot(nn, L), 0.0);
      key *= 1.0 + slopeR * 0.16 * rippleFade;
      float caustic = caustics(q * 0.9, uTime);
      vec3 lit = sand * key * (0.07 + 0.93 * uLight) + vec3(0.55, 0.85, 0.75) * caustic * 0.34 * uLight * uLight * (0.6 + 0.4 * nn.y);
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
      vec3 nn = normalize(vNormal);
      vec2 tp = vWorld.xz * 1.3 + vWorld.y * 0.9;
      float n1 = fbm3(tp), n2 = vnoise(tp * 3.7 + 11.0);
      float wrap = (dot(nn, normalize(vec3(-0.3, 1.0, -0.2))) + 0.35) / 1.35;
      float lighting = 0.22 + max(wrap, 0.0) * 0.78;
      // Weathered limestone: layered noise, darker crevices, pale barnacle specks.
      vec3 stone = mix(vec3(0.24, 0.24, 0.22), vec3(0.46, 0.44, 0.38), n1);
      stone *= 0.65 + 0.5 * smoothstep(0.25, 0.7, n2);
      stone = mix(stone, vec3(0.85, 0.82, 0.74), step(0.93, hash21(floor(tp * 18.0))) * 0.6);
      // Living cover on upward faces: pink coralline crust, green turf, orange and violet encrusting sponge.
      float up = smoothstep(0.2, 0.75, nn.y);
      float crust = smoothstep(0.45, 0.75, vnoise(tp * 0.8 + 4.0)) * up;
      stone = mix(stone, vec3(0.86, 0.42, 0.55) * (0.8 + 0.3 * n2), crust * 0.75);
      stone = mix(stone, vec3(0.26, 0.48, 0.2) * (0.8 + 0.4 * n2), smoothstep(0.6, 0.8, vnoise(tp * 1.4 + 9.0)) * up * 0.6);
      float sponge = smoothstep(0.78, 0.88, vnoise(tp * 1.1 + 23.0));
      stone = mix(stone, mix(vec3(0.98, 0.5, 0.15), vec3(0.6, 0.25, 0.75), step(0.5, hash21(floor(tp * 0.7)))), sponge * 0.8);
      stone *= vec3(0.8, 0.92, 0.97) * lighting * (0.07 + 0.93 * uLight);
      stone += stone * caustics(vWorld.xz * 0.9, uTime) * 0.9 * uLight * up;
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
      float sparkle = caustics(p * 0.35, uTime * 1.4);
      vec3 col = water(normalize(vWorld - cameraPosition)) + vec3(0.16, 0.34, 0.3) * (lines + sparkle * 0.6) * centre * uLight;
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
      float edge = pow(max(0.0, 1.0 - abs(vPosition.x + sin(uTime * 0.21 + vWorld.z * 0.3) * 0.18 * (vPosition.y + 1.0))), 3.0);
      float end = smoothstep(-1.0, -0.7, vPosition.y) * (1.0 - smoothstep(0.5, 1.0, vPosition.y));
      float breathe = 0.9 + 0.1 * sin(uTime * 0.15 + vWorld.x);
      gl_FragColor = vec4(0.36, 0.82, 0.76, edge * end * breathe * uReveal * 0.06 * uLight);
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

  // 900 particles: a dense near field around the seated viewer (where hands can stir it) plus far haze.
  const MOTES = 900;
  const motePositions = new Float32Array(MOTES * 3);
  for (let i = 0; i < MOTES; i++) {
    const near = i < 420;
    const a = random() * Math.PI * 2, radius = near ? 0.25 + random() * 2.6 : 1.7 + random() * 14;
    motePositions[i * 3] = Math.cos(a) * radius;
    motePositions[i * 3 + 1] = near ? -0.9 + random() * 1.8 : -2.8 + random() * 8;
    motePositions[i * 3 + 2] = Math.sin(a) * radius;
  }
  const moteGeometry = new BufferGeometry();
  moteGeometry.setAttribute('position', new Float32BufferAttribute(motePositions, 3));
  const moteMaterial = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uReveal: { value: 0 }, uDrift: { value: new Vector3() }, uTravel: { value: new Vector3() }, uHandA: { value: new Vector4() }, uHandB: { value: new Vector4() }, uHandVA: { value: new Vector3() }, uHandVB: { value: new Vector3() }, ...environmentUniforms() }, transparent: true, depthWrite: false,
    vertexShader: `uniform float uTime; uniform vec3 uDrift; uniform vec3 uTravel; uniform vec4 uHandA; uniform vec4 uHandB; uniform vec3 uHandVA; uniform vec3 uHandVB; varying float vAlpha; varying float vSpark;
    // Hands stir the water: nearby particles are pushed aside and dragged along in the hand's wake.
    vec3 wake(vec3 p, vec4 h, vec3 v) { vec3 d = p - h.xyz; float f = exp(-dot(d, d) / 0.06) * h.w; return d * f * 1.6 + v * f * 0.22; }
    void main() {
      // Passive drift and travel wrap inside a 32 m cell centred on the viewer: endless suspension, fixed count.
      vec3 p = position + uDrift - uTravel;
      p.xz = mod(p.xz + 16.0, 32.0) - 16.0;
      p.y = mod(p.y + 2.8, 8.0) - 2.8;
      p.x += sin(uTime * 0.11 + p.z) * 0.08; p.y += sin(uTime * 0.15 + p.x) * 0.1;
      // Living light: plankton flash where a hand disturbs them (dinoflagellates do this for real).
      vec3 da = p - uHandA.xyz, db = p - uHandB.xyz;
      vSpark = clamp(exp(-dot(da, da) / 0.05) * uHandA.w * 1.6 + exp(-dot(db, db) / 0.05) * uHandB.w * 1.6, 0.0, 1.0);
      p += wake(p, uHandA, uHandVA) + wake(p, uHandB, uHandVB);
      vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(9.0 / max(0.45, -mv.z), 1.0, 6.0); vAlpha = 0.25 + 0.3 * sin(position.x * 7.0) * sin(position.x * 7.0);
    }`,
    fragmentShader: `uniform float uReveal; ${environmentGlsl} varying float vAlpha; varying float vSpark; void main() {
      float soft = 1.0 - smoothstep(0.05, 0.5, length(gl_PointCoord - 0.5));
      // Sunlit motes scatter daylight; deep motes become sparse cyan/violet bioluminescence.
      vec3 lit = vec3(0.46, 0.87, 0.82) * (0.25 + 0.75 * uLight);
      vec3 glow = mix(vec3(0.47, 0.85, 0.86), vec3(0.62, 0.51, 0.83), step(0.5, fract(vAlpha * 13.0)));
      float sparse = step(0.62, fract(vAlpha * 7.3));
      vec3 col = mix(lit, glow, uGlow * sparse);
      float alpha = soft * vAlpha * uReveal * mix(1.0, 0.4 + 1.6 * sparse, uGlow);
      float spark = vSpark * smoothstep(0.15, 0.6, uGlow);
      col = mix(col, vec3(0.55, 1.0, 0.95) * 1.6, spark);
      alpha = max(alpha, soft * spark * uReveal);
      gl_FragColor = vec4(col, alpha);
    }`,
  });
  const motes = new Points(moteGeometry, moteMaterial); motes.name = 'Ocean suspension'; motes.renderOrder = -50; root.add(motes);
  return root;
}
