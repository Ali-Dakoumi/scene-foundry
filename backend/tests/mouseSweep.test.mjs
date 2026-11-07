import assert from 'node:assert/strict';
import test from 'node:test';
import { getMouseSweepPosition } from '../dist/utils/mouseSweep.js';

test('mouse sweep stays inside the canvas and returns to its starting point', () => {
  const width = 800;
  const height = 600;
  const positions = [0, 0.25, 0.5, 0.75, 1].map((progress) => (
    getMouseSweepPosition(progress, width, height)
  ));

  for (const position of positions) {
    assert.ok(position.x > 0 && position.x < width);
    assert.ok(position.y > 0 && position.y < height);
  }
  assert.ok(Math.abs(positions[0].x - positions.at(-1).x) < 1e-8);
  assert.ok(Math.abs(positions[0].y - positions.at(-1).y) < 1e-8);
  assert.notDeepEqual(positions[0], positions[2]);
});
