# Phase 8 performance

This phase is deliberately split into application instrumentation and a
separate database migration.

## Runtime thresholds

- Requests at or above `SLOW_REQUEST_MS` are logged as `slow_request`.
- Queries at or above `DB_SLOW_QUERY_MS` are logged as `slow_query`.
- Query parameters are never logged. Logs contain only a normalized SQL
  preview, parameter count, duration, and row count.
- Set `LOG_ALL_REQUESTS=true` or `DB_LOG_ALL_QUERIES=true` temporarily while
  measuring. Keep both false during normal production operation to avoid noisy
  logs.

## API changes

- `GET /api/orders` accepts `page`, `per_page`, `search`, and `status`.
- `GET /api/finished-goods` accepts `page`, `per_page`, `search`, `id`,
  `sole_code`, and `commission`.
- `GET /api/finished-goods/filters` returns the stable series filter list.
- `GET /api/analytics/dealers/detail` accepts `page`, `per_page`,
  `product_search`, and `product_status`.
- Paginated responses include `pagination.page`, `per_page`, `total`, and
  `total_pages`.

Existing callers that do not pass pagination parameters continue receiving the
legacy response shape.

## Database deployment

1. Back up the database.
2. Run `sql/add-phase-8-performance-indexes.sql` during a quiet period.
3. Run `npm run performance:explain`.
4. Confirm recent-order lookups use the new composite indexes and no longer
   require a full table scan plus sort.
5. Restart the Node.js application with the performance environment values from
   `.env.example`.

The migration is idempotent and checks both table and column availability
before adding each index.

## Baseline evidence

The local pre-index EXPLAIN audit showed:

- recent admin orders: full `orders` table scan followed by a sort;
- recent dealer orders: `created_by` lookup followed by a sort;
- active reservations: `order_items` table scan and temporary aggregation;
- latest production: product lookup followed by a date/id sort.

The composite indexes in the migration directly target these four plans. Run
the same audit after applying the migration and compare the selected key and
whether the explicit sort/table scan disappears.

## Verification

Review Node.js logs for at least one normal business day. Investigate endpoints
that repeatedly exceed 800 ms or queries that repeatedly exceed 500 ms. Cache
hits include `X-Cache: HIT`; analytics summaries are cached for 30 seconds and
are invalidated by data-changing requests.
