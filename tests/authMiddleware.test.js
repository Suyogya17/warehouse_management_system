const test = require('node:test');
const assert = require('node:assert/strict');
const { authorize } = require('../middleware/authMiddleware');

const runAuthorization = (allowedRoles, user) => {
  let nextCalled = false;
  let statusCode = 200;
  let responseBody;
  const req = { user };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };

  authorize(...allowedRoles)(req, res, () => {
    nextCalled = true;
  });

  return { nextCalled, statusCode, responseBody };
};

test('authorize allows a configured role', () => {
  const result = runAuthorization(['ADMIN'], { id: 1, role: 'ADMIN' });
  assert.equal(result.nextCalled, true);
  assert.equal(result.statusCode, 200);
});

test('authorize rejects a role that is not configured', () => {
  const result = runAuthorization(['ADMIN'], { id: 2, role: 'CO_ADMIN' });
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
  assert.equal(result.responseBody.message, 'Forbidden');
});

test('authorize rejects a missing authenticated user', () => {
  const result = runAuthorization(['ADMIN'], null);
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
});
