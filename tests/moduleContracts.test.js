const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const controllersDirectory = path.join(__dirname, '..', 'controllers');
const destructuredRelativeImport =
  /const\s*\{([^}]+)\}\s*=\s*require\(['"](\.\.\/(?:services|utils|middleware)\/[^'"]+)['"]\);/g;

test('controller service, utility, and middleware imports exist', () => {
  const failures = [];
  const controllerFiles = fs
    .readdirSync(controllersDirectory)
    .filter((filename) => filename.endsWith('.js'));

  for (const filename of controllerFiles) {
    const controllerPath = path.join(controllersDirectory, filename);
    const source = fs.readFileSync(controllerPath, 'utf8');

    for (const match of source.matchAll(destructuredRelativeImport)) {
      const modulePath = path.resolve(controllersDirectory, match[2]);
      const importedModule = require(modulePath);
      const names = match[1]
        .split(',')
        .map((name) => name.trim().split(':')[0].trim())
        .filter(Boolean);

      for (const name of names) {
        if (importedModule[name] === undefined) {
          failures.push(`${filename}: ${match[2]} does not export ${name}`);
        }
      }
    }
  }

  assert.deepEqual(failures, []);
});
