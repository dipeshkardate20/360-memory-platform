import test from 'node:test';
import assert from 'node:assert/strict';
import { clampRotation, directionalProgressDelta, wrappedAngleDelta } from '../src/rotation-math.js';

test('wraps sensor changes across 0/360 in the shortest direction', () => {
  assert.equal(wrappedAngleDelta(2, 358), 4);
  assert.equal(wrappedAngleDelta(358, 2), -4);
});

test('maps alpha changes to the selected physical turn direction', () => {
  assert.equal(directionalProgressDelta(-30, 'right'), 30);
  assert.equal(directionalProgressDelta(30, 'left'), 30);
});

test('reverse turns reduce coverage instead of adding a full revolution', () => {
  assert.equal(directionalProgressDelta(12, 'right'), -12);
  assert.equal(directionalProgressDelta(-12, 'left'), -12);
});

test('keeps coverage within the 0 to 360 degree range', () => {
  assert.equal(clampRotation(-8), 0);
  assert.equal(clampRotation(372), 360);
  assert.equal(clampRotation(177), 177);
});
