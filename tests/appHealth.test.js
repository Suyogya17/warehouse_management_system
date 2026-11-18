const test = require("node:test");
const assert = require("node:assert/strict");
const { app } = require("../app");

test("app exposes liveness and readiness routes without identifying Express", () => {
  const routePaths = app._router.stack
    .map((layer) => layer.route?.path)
    .filter(Boolean);

  assert.equal(app.enabled("x-powered-by"), false);
  assert.ok(routePaths.includes("/api/health"));
  assert.ok(routePaths.includes("/api/ready"));
});
