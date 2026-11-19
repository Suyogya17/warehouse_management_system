# Fiscal-year operations

The application uses Nepal's Shrawan-to-Ashadh fiscal year. The
`fiscal_years` table is the authoritative calendar; transaction tables store a
`fiscal_year_id` for reliable and fast historical reporting.

## First deployment

1. Back up the production database.
2. Deploy the backend and frontend from the same revision.
3. Run `npm run migrate:status` on the server.
4. Run `npm run migrate` to apply `0003_fiscal_year_management.sql`.
5. Restart the backend so schema capability caches are refreshed.
6. Sign in as `ADMIN`, open **Fiscal Years**, and confirm that `2083/84` is
   active.
7. Click **Backfill existing data** once. The action is safe to repeat because
   it only fills records whose `fiscal_year_id` is still empty.
8. Check Orders and filter by two different fiscal years before considering
   the deployment complete.

## Year-end rollover

1. Create the next fiscal year in advance using the official BS and AD date
   boundaries.
2. Finish or reconcile transactions for the current year.
3. On the first day of the new year, click **Activate** on the new year.
4. Activation closes and locks the previously active year in the same database
   transaction.
5. Do not reset stock. Inventory balances carry forward; purchases,
   production, consumption, orders, and warehouse movements are separated by
   their transaction fiscal year.

## Corrections to a closed year

Only an `ADMIN` can reopen a closed year. Reopen it only when a documented
backdated posting is required, then lock it again immediately. Existing record
corrections continue to use their normal permission and activity-log controls.
Every fiscal-year state change and backfill is written to the activity log.

Never change an applied migration file. Add a new numbered migration for any
future schema correction.
