const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canRestoreCancelledOrders,
} = require('../controllers/orderController');

test('only administrators can restore cancelled orders', () => {
  assert.equal(canRestoreCancelledOrders({ role: 'ADMIN' }), true);
  assert.equal(
    canRestoreCancelledOrders({
      role: 'CO_ADMIN',
      name: 'Suyogya Shrestha',
      email: 'kingarna@nepcha.com',
    }),
    false
  );
  assert.equal(canRestoreCancelledOrders({ role: 'USER' }), false);
  assert.equal(canRestoreCancelledOrders({}), false);
});
