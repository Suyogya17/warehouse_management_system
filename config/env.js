const REQUIRED_ENVIRONMENT_VARIABLES = [
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "JWT_SECRET",
];

const MINIMUM_PRODUCTION_JWT_SECRET_LENGTH = 32;

const validateEnvironment = (environment = process.env) => {
  const missing = REQUIRED_ENVIRONMENT_VARIABLES.filter(
    (name) => !String(environment[name] || "").trim()
  );
  const errors = [];

  if (missing.length) {
    errors.push(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (
    String(environment.NODE_ENV || "").toLowerCase() === "production" &&
    String(environment.JWT_SECRET || "").length <
      MINIMUM_PRODUCTION_JWT_SECRET_LENGTH
  ) {
    errors.push(
      `JWT_SECRET must be at least ${MINIMUM_PRODUCTION_JWT_SECRET_LENGTH} characters in production.`
    );
  }

  const numericSettings = [
    ["PORT", 1],
    ["DB_PORT", 1],
    ["DB_CONNECTION_LIMIT", 1],
    ["DB_QUEUE_LIMIT", 0],
    ["DB_CONNECT_TIMEOUT_MS", 1],
    ["DB_QUERY_TIMEOUT_MS", 1],
  ];

  for (const [name, minimum] of numericSettings) {
    if (environment[name] === undefined || environment[name] === "") continue;
    const value = Number(environment[name]);
    if (!Number.isInteger(value) || value < minimum) {
      errors.push(`${name} must be an integer greater than or equal to ${minimum}.`);
    }
  }

  if (errors.length) {
    const error = new Error(`Invalid application environment:\n- ${errors.join("\n- ")}`);
    error.code = "INVALID_ENVIRONMENT";
    throw error;
  }

  return true;
};

module.exports = {
  MINIMUM_PRODUCTION_JWT_SECRET_LENGTH,
  REQUIRED_ENVIRONMENT_VARIABLES,
  validateEnvironment,
};
