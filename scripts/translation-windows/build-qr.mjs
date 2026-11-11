import { buildSync } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const destination = process.argv[2];
if (!destination || !fs.statSync(destination).isDirectory())
  throw Error('Informe a pasta da fonte Windows.');
buildSync({
  entryPoints: [fileURLToPath(new URL('./qr-entry.mjs', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  minify: true,
  legalComments: 'inline',
  outfile: path.join(destination, 'qr-code.cjs'),
});
const licenses = [
  ['qrcode', 'LICENSE'],
  ['dijkstrajs', 'LICENSE.md'],
]
  .map(
    ([name, file]) =>
      name +
      '\n' +
      fs.readFileSync(
        path.join(path.dirname(require.resolve(name + '/package.json')), file),
        'utf8',
      ),
  )
  .join('\n\n');
fs.writeFileSync(path.join(destination, 'qr-code.LICENSE.txt'), licenses);
