const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateStockAdjustmentInput,
} = require('../utils/stockAdjustmentValidation');

test('normalizes a valid stock adjustment', () => {
  const result = validateStockAdjustmentInput({
    finished_good_id: '12',
    qty: '-5',
    reason: '  damaged pairs  ',
  });

  assert.deepEqual(result.value, {
    finishedGoodId: 12,
    quantity: -5,
    reason: 'damaged pairs',
  });
});

test('rejects zero, decimal, and non-numeric quantities', () => {
  for (const qty of [0, '0', 1.5, 'abc', Infinity]) {
    const result = validateStockAdjustmentInput({
      finished_good_id: 1,
      qty,
    });
    assert.match(result.error, /qty/);
  }
});

test('rejects an invalid finished good ID', () => {
  const result = validateStockAdjustmentInput({
    finished_good_id: 'not-an-id',
    qty: 5,
  });
  assert.match(result.error, /finished_good_id/);
});

test('rejects an excessively long reason', () => {
  const result = validateStockAdjustmentInput({
    finished_good_id: 1,
    qty: 5,
    reason: 'x'.repeat(501),
  });
  assert.match(result.error, /500/);
});
