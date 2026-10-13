const { cpSync, existsSync, mkdirSync, readFileSync } = require('node:fs');
const { dirname, join, relative, resolve } = require('node:path');
const { createRequire } = require('node:module');

const apiRoot = resolve(__dirname, '..');
const repoRoot = resolve(apiRoot, '../..');
const output = join(apiRoot, 'dist/efatura-runtime');
const visited = new Set();
function copyDependency(name, base) {
  const localRequire = createRequire(join(base, 'package.json'));
  const directory = localRequire.resolve
    .paths(name)
    .map((path) => join(path, name))
    .find((path) => existsSync(join(path, 'package.json')));
  if (!directory) throw new Error(`Missing worker dependency: ${name}`);
  if (visited.has(directory)) return;
  visited.add(directory);
  const path = relative(repoRoot, directory);
  if (path.startsWith('..'))
    throw new Error('Worker dependency outside repository');
  const destination = join(output, path);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(directory, destination, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json')));
  for (const dependency of Object.keys(manifest.dependencies || {})) {
    copyDependency(dependency, directory);
  }
}
copyDependency('puppeteer-core', apiRoot);
copyDependency('@sparticuz/chromium', apiRoot);
cpSync(
  join(apiRoot, 'src/modules/banking/efatura'),
  join(output, 'apps/api/src/modules/banking/efatura'),
  {
    recursive: true,
    filter: (path) => !path.endsWith('.test.cjs'),
  },
);
console.log(`Packaged ${visited.size} e-Fatura runtime dependency directories`);
