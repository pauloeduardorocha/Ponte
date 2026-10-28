import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = process.argv[2];
if (!/^[a-f0-9]{40}$/i.test(sha ?? ''))
  throw new Error('Provide the base commit SHA (40 hex characters).');
const document = JSON.parse(
  execFileSync('git', ['show', `${sha}:docs/openapi.json`], {
    cwd: root,
    encoding: 'utf8',
  }),
);
const hash = createHash('sha256')
  .update(JSON.stringify(document))
  .digest('hex');
// Exact snapshots predating reproducible generation. They omit 70 live paths
// and retain two obsolete invoice routes. The initial migration reports their
// drift without blocking on documentation corrections. Any other legacy base
// fails closed; generated baselines always enforce ERR-level compatibility.
const legacy = new Set([
  'b7b7872edbbbaa6eef780b3afa995fb9e821d789f4ae955ae6a5be321c7bc65f',
  'f9d186c3dafd198c22c5663b06c4555d91e3e13622121d44b0e5b61a21acc417',
]);
const generated = document['x-ponte-generator'] === 1;
if (!generated && !legacy.has(hash))
  throw new Error(
    'Unknown legacy contract baseline. Review its drift before changing the baseline policy.',
  );
mkdirSync(join(root, 'tmp'), { recursive: true });
writeFileSync(
  join(root, 'tmp/openapi-base.json'),
  `${JSON.stringify(document, null, 2)}\n`,
);
const mode = generated ? 'strict' : 'legacy-migration';
console.log(`OpenAPI comparison mode: ${mode}. Base: ${sha}.`);
if (!generated)
  console.log(
    'Initial documentation migration: oasdiff reports legacy drift. Subsequent comparisons enforce breaking-change failures.',
  );
if (process.env.GITHUB_OUTPUT)
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `fail_on=${generated ? 'ERR' : ''}\n`,
  );
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `OpenAPI baseline: \`${sha}\`, mode **${mode}**. ${generated ? 'Breaking changes at ERR level block this PR.' : 'Known legacy snapshot: this first migration reports documentation drift; the generated baseline activates strict checks after merge.'}\n`,
  );
