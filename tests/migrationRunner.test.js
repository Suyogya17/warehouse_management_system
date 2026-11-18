const test = require("node:test");
const assert = require("node:assert/strict");
const { checksum, splitStatements } = require("../scripts/migrate");

test("migration checksums are stable and detect content changes", () => {
  assert.equal(checksum("SELECT 1;"), checksum("SELECT 1;"));
  assert.notEqual(checksum("SELECT 1;"), checksum("SELECT 2;"));
});

test("migration statements split only on explicit markers", () => {
  const statements = splitStatements(`
    INSERT INTO example (value) VALUES ('a;b');
    -- migrate:split
    UPDATE example SET value = 'done';
  `);

  assert.equal(statements.length, 2);
  assert.match(statements[0], /'a;b'/);
  assert.match(statements[1], /^UPDATE/);
});
