const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getStockoutSeverity,
} = require('../services/stockoutMonitoringService');

test('stockout severity escalates at two and five cycles', () => {
  assert.equal(getStockoutSeverity(0), 'MONITORING');
  assert.equal(getStockoutSeverity(1), 'MONITORING');
  assert.equal(getStockoutSeverity(2), 'WARNING');
  assert.equal(getStockoutSeverity(4), 'WARNING');
  assert.equal(getStockoutSeverity(5), 'CRITICAL');
  assert.equal(getStockoutSeverity(8), 'CRITICAL');
});
