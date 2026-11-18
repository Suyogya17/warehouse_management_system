# Database migrations

New database changes belong here as numbered SQL files, for example
`0002_add_order_reference.sql`. Run them with `npm run migrate` and inspect the
current state with `npm run migrate:status`.

The runner records a SHA-256 checksum in `schema_migrations`, refuses to run two
files with the same version, and uses a MySQL advisory lock so two deployments
cannot migrate simultaneously. Never edit a migration after it has been applied;
add another numbered migration instead.

Each file is executed as one statement by default. For a migration containing
multiple statements, put `-- migrate:split` on a line between statements. Avoid
mixing non-idempotent DDL with data updates when possible because MySQL may
implicitly commit DDL.

The old files under `sql/` are retained as legacy deployment history. They are
not replayed automatically because production installations may already contain
some or all of those changes. Migration `0001` can only baseline a database that
already contains the `users`, `finished_goods`, and `orders` tables; the runner
refuses to mark a blank database as current.
