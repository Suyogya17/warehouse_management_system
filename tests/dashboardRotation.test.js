const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDeterministicOrder,
  getRotationWindow,
  normalizeSettings,
  parseRotationTimes,
} = require('../services/dashboardRotationService');

test('deterministic rotation gives every user the same order for one key', () => {
  const ids = [9, 2, 17, 4, 2];
  const first = createDeterministicOrder(ids, '2026-11-18-slot-2-revision-0');
  const second = createDeterministicOrder([...ids].reverse(), '2026-11-18-slot-2-revision-0');

  assert.deepEqual(first, second);
  assert.deepEqual([...first].sort((a, b) => a - b), [2, 4, 9, 17]);
});

test('a new rotation key changes the shared order', () => {
  const ids = Array.from({ length: 20 }, (_, index) => index + 1);
  assert.notDeepEqual(
    createDeterministicOrder(ids, '2026-11-18-slot-1-revision-0'),
    createDeterministicOrder(ids, '2026-11-18-slot-2-revision-0')
  );
});

test('rotation window uses Nepal time and returns the next configured slot', () => {
  const settings = normalizeSettings({
    rotations_per_day: 3,
    rotation_times: ['06:00', '14:00', '22:00'],
  });
  const state = getRotationWindow(settings, new Date('2026-11-18T09:00:00.000Z'));

  assert.equal(state.scheduled_rotation_key, '2026-11-18-slot-2');
  assert.equal(state.next_rotation_at, '2026-11-18T16:15:00.000Z');
  assert.equal(state.timezone, 'Asia/Kathmandu');
});

test('locked rotations keep the same key and do not schedule another change', () => {
  const state = getRotationWindow(
    {
      rotations_per_day: 2,
      rotation_times: ['08:00', '20:00'],
      locked: 1,
      locked_rotation_key: 'locked-example',
    },
    new Date('2026-11-18T12:00:00.000Z')
  );

  assert.equal(state.rotation_key, 'locked-example');
  assert.equal(state.next_rotation_at, null);
});

test('rotation time parsing removes invalid and duplicate values', () => {
  assert.deepEqual(
    parseRotationTimes('["22:00", "06:00", "06:00", "25:00"]'),
    ['06:00', '22:00']
  );
});
