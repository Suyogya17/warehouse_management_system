# Safe operations and deployment

## Before deployment

1. Take and verify a database backup.
2. Confirm production environment variables against `.env.example`. In
   particular, `JWT_SECRET` must contain at least 32 random characters.
3. Run `npm ci` and `npm test` in the backend.
4. Run `npm ci` and `npm run build` in `frontend/`.
5. Review `npm run migrate:status`. Apply pending migrations with
   `npm run migrate` during the planned deployment window.

Do not run the migration command concurrently from multiple terminals. The
runner also takes a MySQL advisory lock as a second line of defense.

## After deployment

1. Request `/api/health` and confirm HTTP 200 plus the expected
   `X-App-Revision` header.
2. Request `/api/ready` and confirm it returns HTTP 200 with
   `{ "success": true, "status": "ready" }`.
3. Sign in with a non-admin test account and an administrator account.
4. Verify one read-only stock page, one order page, and recent audit activity.
5. Watch slow-request, query-error, and HTTP 5xx logs for at least one normal
   operating cycle.

`/api/health` is a process liveness check. `/api/ready` verifies database
connectivity and is the endpoint a load balancer should use before routing
traffic.

## Database integration tests

`tests/stockAdjustment.integration.test.js` performs destructive setup and is
disabled locally by default. CI runs it against an isolated MySQL service. To
run it manually, set `RUN_DB_INTEGRATION=true` and use a dedicated database
whose name clearly contains `test` or `ci`. The test refuses to run otherwise.

Never point integration tests at development or production data.

## Rollback

Application code can be rolled back to the previous release artifact. Database
migrations are forward-only: do not edit or delete an applied migration. If a
schema change needs correction, add a new numbered migration and test it against
a restored copy of the production backup first.
