const test = require("node:test");
const assert = require("node:assert/strict");
const { securityHeaders } = require("../middleware/securityHeaders");

test("sets defensive browser headers and continues", () => {
  const headers = {};
  let nextCalled = false;
  const req = { secure: true, headers: {} };
  const res = {
    setHeader(name, value) {
      headers[name] = value;
    },
  };

  securityHeaders(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.match(headers["Strict-Transport-Security"], /max-age=31536000/);
});
