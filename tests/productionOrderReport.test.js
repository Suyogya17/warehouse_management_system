const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeSeries,
  selectProducts,
} = require('../controllers/productionOrderReportController');

const products = [
  { id: 1, article_code: 'GP-5', sole_code: 'GP Sole', color: 'Black' },
  { id: 2, article_code: 'GP-5', sole_code: 'GP_Sole', color: 'White' },
  { id: 3, article_code: 'KJ-002', sole_code: 'KJ Sole', color: 'Blue' },
];

test('production-order report normalizes equivalent series names', () => {
  assert.equal(normalizeSeries('GP Sole'), 'GP');
  assert.equal(normalizeSeries('GP_Sole'), 'GP');
  assert.equal(normalizeSeries('  KJ   Sole  '), 'KJ');
});

test('production-order report selects a complete series or article', () => {
  assert.deepEqual(
    selectProducts(products, 'SERIES', 'gp').map((product) => product.id),
    [1, 2]
  );
  assert.deepEqual(
    selectProducts(products, 'ARTICLE', 'gp-5').map((product) => product.id),
    [1, 2]
  );
  assert.deepEqual(
    selectProducts(products, 'PRODUCT', '3').map((product) => product.id),
    [3]
  );
});
