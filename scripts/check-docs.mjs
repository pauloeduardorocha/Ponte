import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) =>
  readFileSync(join(root, path), 'utf8').replaceAll('\r\n', '\n');
const errors = [];
function markdownFiles(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? markdownFiles(path)
        : path.endsWith('.md')
          ? [path]
          : [];
    },
  );
}
const documents = [
  'README.md',
  'AGENTS.md',
  ...markdownFiles('docs'),
  ...markdownFiles('apps/api/prisma/library-production'),
];

// Check local Markdown destinations, including images, without requesting URLs.
// Ignore examples inside fenced/inline code, such as the mention syntax.
for (const file of documents) {
  const content = read(file)
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '')
    .replace(/(`+)[^\n]*?\1/g, '');
  for (const match of content.matchAll(/!?\[[^\]]*\]\(([^\s)]+)\)/g)) {
    const destination = match[1];
    if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(destination)) continue;
    const target = destination.split('#')[0];
    if (!existsSync(resolve(root, dirname(file), decodeURIComponent(target))))
      errors.push(`${file}: destino ausente: ${destination}`);
  }
}

// The long HTTP table must match the source allowlist exactly.
const policy = new Map(
  [
    ...read('packages/shared/src/http-cache-policy.ts').matchAll(
      /^ {2}'([^']+)': (\d+),$/gm,
    ),
  ].map((match) => [match[1], Number(match[2])]),
);
const table = new Map(
  [
    ...read('docs/http-cache-policy.md').matchAll(
      /^\|\s*`([^`]+)`\s*\|\s*(no-store|private, max-age=(\d+)[^|]*)\s*\|$/gm,
    ),
  ].map((match) => [match[1], Number(match[3] ?? 0)]),
);
if (!policy.size || policy.size !== table.size)
  errors.push('Cache: número de rotas diferente entre fonte e documentação.');
for (const [route, ttl] of policy)
  if (table.get(route) !== ttl)
    errors.push(`Cache: política divergente em ${route}`);

// Verify generated inventory documents without writing or accessing a database.
const require = createRequire(import.meta.url);
const {
  prepare,
  renderReview,
} = require('../apps/api/prisma/library-production/prepare-seed.cjs');
const inventory = JSON.parse(
  read('apps/api/prisma/library-production/inventory.json'),
);
const proposals = JSON.parse(
  read('apps/api/prisma/library-production/category-proposals.json'),
);
const seed = prepare(inventory, proposals);
if (
  JSON.stringify(seed) !==
  JSON.stringify(
    JSON.parse(read('apps/api/prisma/library-production/seed.json')),
  )
)
  errors.push('Biblioteca: seed.json diverge do preparador.');
if (
  renderReview(inventory, proposals, seed) !==
  read('docs/library-seed-review.md')
)
  errors.push('Biblioteca: relatório gerado diverge das fontes.');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `${documents.length} documentos: destinos locais válidos; ${policy.size} políticas de cache alinhadas; seed e relatório da biblioteca reproduzíveis.`,
  );
}
