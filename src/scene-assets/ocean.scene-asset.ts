import { BackSide, BufferGeometry, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, Mesh, Object3D, PlaneGeometry, Points, ShaderMaterial, SphereGeometry } from '@iwsdk/core';

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
    vPosition = p.xyz;
    vWorld = (modelMatrix * p).xyz;
    vNormal = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }`;
const waterColor = `
  vec3 water(vec3 direction) {
    float elevation = direction.y * 0.5 + 0.5;
    vec3 deep = vec3(0.005, 0.038, 0.075);
    vec3 blue = vec3(0.012, 0.18, 0.23);
    vec3 shallow = vec3(0.09, 0.46, 0.49);
    return mix(mix(deep, blue, smoothstep(0.05, 0.62, elevation)), shallow, pow(max(direction.y, 0.0), 2.5));
  }`;
function material(fragment: string, extras: Record<string, { value: unknown }> = {}) {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uReveal: { value: 0 }, ...extras },
    vertexShader: vertex,
    fragmentShader: `uniform float uTime; uniform float uReveal; varying vec3 vPosition; varying vec3 vWorld; varying vec3 vNormal; ${waterColor} ${fragment}`,
    transparent: true, depthWrite: false,
  });
}

export function createOcean() {
  const root = new Group(); root.name = 'Ocean environment';
  const skyMaterial = material(`
    void main() {
      vec3 d = normalize(vPosition);
      vec3 col = water(d);
      vec3 sun = normalize(vec3(-0.3, 1.0, -0.55));
      float glow = pow(max(dot(d, sun), 0.0), 32.0);
      col += vec3(0.20, 0.38, 0.32) * glow * 0.42;
      gl_FragColor = vec4(col, uReveal);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`);
  skyMaterial.side = BackSide;
  const sky = new Mesh(new SphereGeometry(55, 48, 32), skyMaterial);
  sky.name = 'Water volume'; sky.renderOrder = -100;
  root.add(sky);

  const floorGeometry = new PlaneGeometry(90, 90, 100, 100);
  floorGeometry.rotateX(-Math.PI / 2);
  const positions = floorGeometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    const height = Math.sin(x * 0.28 + Math.sin(z * 0.19)) * 0.35 + Math.sin(z * 0.48 + x * 0.09) * 0.16;
    positions.setY(i, height);
  }
  floorGeometry.computeVertexNormals();
  const groundMaterial = material(`
    void main() {
      vec3 d = normalize(vWorld - cameraPosition);
      float distanceToEye = length(vWorld - cameraPosition);
      float ripple = sin(vPosition.x * 5.0 + sin(vPosition.z * 1.2) * 1.1) * 0.018;
      float caustic = pow(0.5 + 0.5 * sin(vPosition.x * 1.6 + sin(vPosition.z * 1.9 + uTime * 0.18) * 1.8), 12.0);
      caustic *= pow(0.5 + 0.5 * sin(vPosition.z * 1.4 - uTime * 0.12), 2.0);
      vec3 sand = vec3(0.16, 0.31, 0.29) + ripple + vec3(0.14, 0.30, 0.23) * caustic * 0.42;
      sand *= 0.7 + max(vNormal.y, 0.0) * 0.3;
      vec3 col = mix(sand, water(d), 1.0 - exp(-distanceToEye * 0.095));
      gl_FragColor = vec4(col, uReveal);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`);
  const seabed = new Mesh(floorGeometry, groundMaterial);
  groundMaterial.userData.solid = true;
  seabed.name = 'Rippled sand'; seabed.position.y = -3.4; seabed.renderOrder = -90;
  root.add(seabed);

  const rockMaterial = material(`
    void main() {
      float lighting = 0.26 + max(dot(normalize(vNormal), normalize(vec3(-0.3, 1.0, -0.2))), 0.0) * 0.7;
      float strata = sin(vWorld.y * 7.0 + sin(vWorld.x * 3.0)) * 0.018;
      vec3 stone = (vec3(0.075, 0.18, 0.19) + strata) * lighting;
      float distanceToEye = length(vWorld - cameraPosition);
      vec3 col = mix(stone, water(normalize(vWorld - cameraPosition)), 1.0 - exp(-distanceToEye * 0.075));
      gl_FragColor = vec4(col, uReveal);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`);
  const reef = new InstancedMesh(new IcosahedronGeometry(1, 2), rockMaterial, 42);
  rockMaterial.userData.solid = true;
  reef.name = 'Distant reef outcrops'; reef.renderOrder = -80;
  const dummy = new Object3D();
  let seed = 90210;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 42; i++) {
    const angle = i / 42 * Math.PI * 2;
    const radius = 7 + random() * 17;
    const height = 0.5 + random() * 3.3;
    dummy.position.set(Math.cos(angle) * radius, -3.5 + height * 0.3, Math.sin(angle) * radius);
    dummy.scale.set(0.8 + random() * 1.8, height, 0.8 + random() * 2);
    dummy.rotation.set(random() * 0.3, random() * Math.PI, random() * 0.15);
    dummy.updateMatrix(); reef.setMatrixAt(i, dummy.matrix);
  }
  root.add(reef);

  const surfaceMaterial = material(`
    void main() {
      vec2 p = vPosition.xy;
      float waves = sin(p.x * 0.75 + uTime * 0.12 + sin(p.y * 0.85)) * sin(p.y * 0.65 - uTime * 0.1);
      float lines = pow(abs(waves), 9.0);
      float centre = exp(-length(p) * 0.055);
      float edge = 1.0 - smoothstep(14.0, 34.0, length(p));
      vec3 col = water(normalize(vWorld - cameraPosition)) + vec3(0.10, 0.23, 0.19) * lines * centre;
      gl_FragColor = vec4(col, uReveal * edge * 0.55);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`);
  surfaceMaterial.side = DoubleSide;
  const surface = new Mesh(new PlaneGeometry(80, 80), surfaceMaterial);
  surface.name = 'Overhead water surface'; surface.rotation.x = Math.PI / 2; surface.position.y = 5.8;
  surface.renderOrder = -70; root.add(surface);

  // Broad, soft light shafts: low contrast, slow movement, no strobing.
  const shaftMaterial = material(`
    void main() {
      float edge = pow(max(0.0, 1.0 - abs(vPosition.x)), 3.0);
      float end = smoothstep(-1.0, -0.7, vPosition.y) * (1.0 - smoothstep(0.5, 1.0, vPosition.y));
      float breathe = 0.9 + 0.1 * sin(uTime * 0.15 + vWorld.x);
      gl_FragColor = vec4(0.28, 0.73, 0.69, edge * end * breathe * uReveal * 0.045);
    }`);
  shaftMaterial.side = DoubleSide;
  for (let i = 0; i < 7; i++) {
    const beam = new Mesh(new PlaneGeometry(2, 2), shaftMaterial);
    beam.name = `Sun shaft ${i + 1}`;
    beam.position.set(-8 + i * 2.6, 1.7, -7 - i * 1.2);
    beam.scale.set(0.7 + i * 0.16, 5, 1);
    beam.rotation.z = -0.22; beam.rotation.y = (i - 3) * 0.12;
    beam.renderOrder = -60; root.add(beam);
  }

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
    uniforms: { uTime: { value: 0 }, uReveal: { value: 0 } }, transparent: true, depthWrite: false,
    vertexShader: `uniform float uTime; varying float vAlpha; void main() {
      vec3 p = position; p.x += sin(uTime * 0.11 + p.z) * 0.08; p.y += sin(uTime * 0.15 + p.x) * 0.1;
      vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(10.0 / max(1.0, -mv.z), 1.0, 4.0); vAlpha = 0.25 + 0.3 * sin(position.x * 7.0) * sin(position.x * 7.0);
    }`,
    fragmentShader: `uniform float uReveal; varying float vAlpha; void main() {
      float soft = 1.0 - smoothstep(0.05, 0.5, length(gl_PointCoord - 0.5));
      gl_FragColor = vec4(0.46, 0.87, 0.82, soft * vAlpha * uReveal);
    }`,
  });
  const motes = new Points(moteGeometry, moteMaterial); motes.name = 'Ocean suspension'; motes.renderOrder = -50; root.add(motes);
  return root;
}
