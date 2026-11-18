const test = require("node:test");
const assert = require("node:assert/strict");
const { createRateLimiter } = require("../middleware/rateLimit");

const runLimiter = (limiter, key = "client-1") => {
  const headers = {};
  let statusCode = 200;
  let body;
  let nextCalled = false;
  const req = { ip: key, body: {} };
  const res = {
    setHeader(name, value) {
      headers[name] = value;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  };

  limiter(req, res, () => {
    nextCalled = true;
  });

  return { body, headers, nextCalled, statusCode };
};

test("rate limiter blocks requests over the configured maximum", () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });

  assert.equal(runLimiter(limiter).nextCalled, true);
  assert.equal(runLimiter(limiter).nextCalled, true);
  const blocked = runLimiter(limiter);

  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers["Retry-After"], "60");
  assert.match(blocked.body.message, /Too many requests/);
});

test("rate limiter tracks separate clients independently", () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

  assert.equal(runLimiter(limiter, "client-1").nextCalled, true);
  assert.equal(runLimiter(limiter, "client-2").nextCalled, true);
  assert.equal(runLimiter(limiter, "client-1").statusCode, 429);
});
