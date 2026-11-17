import assert from 'node:assert/strict';
import test from 'node:test';
import { immersionPhase, smoothReveal, stepImmersion } from '../src/transition.ts';

test('entry and return reach their exact endpoints', () => {
  let value = 0;
  for (let i = 0; i < 481; i++) value = stepImmersion(value, 1, 1 / 60);
  assert.equal(value, 1);
  assert.equal(immersionPhase(value, 1), 'ocean');
  for (let i = 0; i < 271; i++) value = stepImmersion(value, 0, 1 / 60);
  assert.equal(value, 0);
  assert.equal(immersionPhase(value, 0), 'room');
});
test('reversing halfway is continuous and returns toward the room', () => {
  const entered = stepImmersion(0.4, 1, 1 / 60);
  const reversed = stepImmersion(entered, 0, 1 / 60);
  assert.ok(reversed < entered && reversed > 0.39);
  assert.equal(immersionPhase(reversed, 0), 'returning');
  assert.ok(Math.abs(smoothReveal(reversed) - smoothReveal(entered)) < 0.01);
});
test('background gaps cannot jump to immersion and invalid negative delta cannot rewind', () => {
  assert.equal(stepImmersion(0, 1, 60), 0.05 / 8);
  assert.equal(stepImmersion(0.5, 1, -1), 0.5);
  assert.equal(smoothReveal(0), 0);
  assert.equal(smoothReveal(1), 1);
});
