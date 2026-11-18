// Shared GLSL chunks (pure strings: safe for scene assets evaluated by both runtime and editor).

/** Cheap value noise, fbm and animated two-layer caustics. */
export const noiseGlsl = `
  float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm3(vec2 p) { float s = 0.0, a = 0.5; for (int k = 0; k < 3; k++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.875; }
  // Sunlight focused by surface waves: a warped web of bright lines that drifts slowly.
  float caustics(vec2 p, float t) {
    vec2 a = p * 1.15 + vec2(sin(p.y * 1.7 + t * 0.55), cos(p.x * 1.3 - t * 0.45)) * 0.55;
    vec2 b = p * 1.9 + vec2(cos(p.y * 1.1 - t * 0.38), sin(p.x * 1.9 + t * 0.62)) * 0.45;
    float la = abs(sin(a.x * 2.1) * sin(a.y * 2.3));
    float lb = abs(sin(b.x * 1.7 + 1.3) * sin(b.y * 1.9 + 0.7));
    return pow(1.0 - la, 7.0) * 0.65 + pow(1.0 - lb, 9.0) * 0.5;
  }
`;
