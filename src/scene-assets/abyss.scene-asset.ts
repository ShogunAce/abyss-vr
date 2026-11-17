import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, Points, PointsMaterial, RingGeometry, SphereGeometry, DoubleSide } from '@iwsdk/core';

// Metres, Y up, centered pivot. The sphere's diameter is 17 cm.
export function createSphere() {
  const sphere = new Mesh(new SphereGeometry(0.085, 32, 24), new MeshStandardMaterial({
    color: 0x1677ff, emissive: 0x096bff, emissiveIntensity: 1.4, roughness: 0.24, metalness: 0.12,
  }));
  sphere.name = 'Luminous sphere';
  return sphere;
}
export function createConfirmation() {
  const ring = new Mesh(new RingGeometry(0.105, 0.108, 64), new MeshBasicMaterial({
    color: 0x67fff0, transparent: true, opacity: 0.75, side: DoubleSide, depthWrite: false,
  }));
  ring.name = 'Pinch confirmation';
  return ring;
}
export function createParticles() {
  const positions = new Float32Array(96 * 3);
  let seed = 734;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (random() - 0.5) * 1.5;
    positions[i + 1] = (random() - 0.5) * 1.1;
    positions[i + 2] = -0.2 - random() * 0.65;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const points = new Points(geometry, new PointsMaterial({ color: 0x6de4ec, size: 0.003, transparent: true, opacity: 0.55, depthWrite: false }));
  points.name = 'Suspended particles';
  return points;
}
export function createLabel() {
  // Original single-stroke lettering: no downloaded fonts or textures.
  const strokes = [
    [[0,0],[0.5,1],[1,0]], [[0.23,0.45],[0.77,0.45]],
    [[1.5,0],[1.5,1],[2.1,1],[2.4,0.8],[2.1,0.55],[1.5,0.55]], [[2.1,0.55],[2.4,0.25],[2.1,0],[1.5,0]],
    [[2.9,1],[3.4,0.5],[3.9,1]], [[3.4,0.5],[3.4,0]],
    [[5.3,0.9],[5.05,1],[4.5,1],[4.3,0.75],[4.5,0.55],[5.1,0.45],[5.3,0.2],[5.05,0],[4.4,0]],
    [[6.7,0.9],[6.45,1],[5.9,1],[5.7,0.75],[5.9,0.55],[6.5,0.45],[6.7,0.2],[6.45,0],[5.8,0]],
  ];
  const positions: number[] = [];
  for (const stroke of strokes) for (let i = 1; i < stroke.length; i++) {
    for (const p of [stroke[i - 1], stroke[i]]) positions.push((p[0] - 3.35) * 0.034, p[1] * 0.034, 0);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const label = new LineSegments(geometry, new LineBasicMaterial({ color: 0x9ddde5 }));
  label.name = 'ABYSS';
  return label;
}
