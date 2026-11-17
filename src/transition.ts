// Pure transition math: large/background frame gaps cannot skip the reveal.
export function stepImmersion(current: number, destination: number, delta: number): number {
  const duration = destination > current ? 8 : 4.5;
  const step = Math.min(Math.max(delta, 0), 0.05) / duration;
  return destination > current ? Math.min(destination, current + step) : Math.max(destination, current - step);
}
export function immersionPhase(value: number, destination: number): string {
  if (value <= 0) return 'room';
  if (value >= 1) return 'ocean';
  return destination === 1 ? 'entering' : 'returning';
}
export function smoothReveal(value: number): number { return value * value * (3 - 2 * value); }
