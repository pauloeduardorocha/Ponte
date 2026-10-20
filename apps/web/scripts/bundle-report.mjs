import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import console from 'node:console';
import { gzipSync } from 'node:zlib';

const dist = new URL('../dist/', import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL('.vite/manifest.json', dist), 'utf8'),
);
const initial = new Set();

function visit(key) {
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Missing manifest entry: ${key}`);
  if (initial.has(chunk.file)) return;
  initial.add(chunk.file);
  for (const dependency of chunk.imports ?? []) visit(dependency);
}

for (const [key, chunk] of Object.entries(manifest)) {
  if (chunk.isEntry) visit(key);
}

function report(label, files) {
  let bytes = 0;
  let gzip = 0;
  for (const file of files) {
    const buffer = readFileSync(new URL(file, dist));
    bytes += buffer.length;
    gzip += gzipSync(buffer).length;
  }
  console.log(
    `${label}: ${files.length} files, ${(bytes / 1000).toFixed(2)} kB, ${(gzip / 1000).toFixed(2)} kB gzip`,
  );
}

const all = readdirSync(fileURLToPath(new URL('assets/', dist)))
  .filter((file) => file.endsWith('.js'))
  .map((file) => `assets/${file}`);
report(
  'Initial JavaScript (static imports)',
  [...initial].filter((file) => file.endsWith('.js')),
);
report('All JavaScript chunks', all);
console.log(
  'Excludes CSS, PDF worker assets and service-worker files. PWA precaching may download lazy chunks in the background.',
);
