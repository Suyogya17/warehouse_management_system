const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MINIMUM_PRODUCTION_JWT_SECRET_LENGTH,
  validateEnvironment,
} = require("../config/env");

const validEnvironment = () => ({
  NODE_ENV: "production",
  DB_USER: "test-user",
  DB_PASSWORD: "test-password",
  DB_NAME: "test-database",
  JWT_SECRET: "x".repeat(MINIMUM_PRODUCTION_JWT_SECRET_LENGTH),
  PORT: "3000",
});

test("accepts a complete production environment", () => {
  assert.equal(validateEnvironment(validEnvironment()), true);
});

test("reports missing required environment variables", () => {
  const environment = validEnvironment();
  delete environment.DB_NAME;

  assert.throws(
    () => validateEnvironment(environment),
    /Missing required environment variables: DB_NAME/
  );
});

test("rejects a short production JWT secret", () => {
  const environment = validEnvironment();
  environment.JWT_SECRET = "too-short";

  assert.throws(() => validateEnvironment(environment), /at least 32 characters/);
});

test("rejects invalid numeric configuration", () => {
  const environment = validEnvironment();
  environment.DB_CONNECTION_LIMIT = "zero";

  assert.throws(() => validateEnvironment(environment), /DB_CONNECTION_LIMIT/);
});
