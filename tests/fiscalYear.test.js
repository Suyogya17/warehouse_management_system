const test = require('node:test');
const assert = require('node:assert/strict');

const { getNepaliFiscalMeta } = require('../utils/nepaliFiscalYear');
const {
  normalizeSqlDate,
  validateFiscalYearInput,
} = require('../services/fiscalYearService');

test('Nepali dates are assigned to the correct Shrawan-to-Ashadh fiscal year', () => {
  assert.equal(
    getNepaliFiscalMeta(new Date(2026, 6, 17, 12)).bs_fiscal_year,
    '2083/84'
  );
  assert.equal(
    getNepaliFiscalMeta(new Date(2026, 6, 16, 12)).bs_fiscal_year,
    '2082/83'
  );
});

test('fiscal-year input accepts valid boundaries and normalizes the code', () => {
  assert.deepEqual(
    validateFiscalYearInput({
      code: '2084-85',
      bs_start_date: '2084-04-01',
      bs_end_date: '2085-03-31',
      ad_start_date: '2027-07-17',
      ad_end_date: '2028-07-15',
    }),
    {
      code: '2084/85',
      bs_start_date: '2084-04-01',
      bs_end_date: '2085-03-31',
      ad_start_date: '2027-07-17',
      ad_end_date: '2028-07-15',
    }
  );
});

test('fiscal-year input rejects an overlapping direction and an invalid code', () => {
  assert.throws(
    () =>
      validateFiscalYearInput({
        code: '2084/86',
        bs_start_date: '2084-04-01',
        bs_end_date: '2085-03-31',
        ad_start_date: '2028-07-15',
        ad_end_date: '2027-07-17',
      }),
    /start date|code should/i
  );
});

test('SQL dates retain their calendar day without UTC conversion', () => {
  assert.equal(normalizeSqlDate('2026-07-17T23:55:00+05:45'), '2026-07-17');
  assert.equal(normalizeSqlDate(new Date(2026, 6, 17, 23, 55)), '2026-07-17');
});
