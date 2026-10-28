import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(
  dirname(fileURLToPath(import.meta.url)),
  'openapi-base.mjs',
);

for (const scenario of ['generated', 'unknown-legacy', 'invalid-sha']) {
  test(`contract baseline command: ${scenario}`, () => {
    const folder = mkdtempSync(join(tmpdir(), 'ponte contract baseline '));
    try {
      mkdirSync(join(folder, 'scripts'));
      mkdirSync(join(folder, 'docs'));
      copyFileSync(script, join(folder, 'scripts/openapi-base.mjs'));
      const doc = {
        openapi: '3.0.0',
        paths: {},
        ...(scenario === 'generated' ? { 'x-ponte-generator': 1 } : {}),
      };
      writeFileSync(join(folder, 'docs/openapi.json'), JSON.stringify(doc));
      const git = (...args) =>
        execFileSync('git', args, {
          cwd: folder,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
      git('init');
      git('add', 'docs/openapi.json');
      git(
        '-c',
        'user.name=Contract fixture',
        '-c',
        'user.email=contract@example.invalid',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-m',
        'fixture',
      );
      const sha = git('rev-parse', 'HEAD');
      const output = join(folder, 'github-output.txt');
      const run = spawnSync(
        process.execPath,
        [
          join(folder, 'scripts/openapi-base.mjs'),
          scenario === 'invalid-sha' ? '--help' : sha,
        ],
        {
          cwd: folder,
          encoding: 'utf8',
          env: {
            ...process.env,
            GITHUB_OUTPUT: output,
            GITHUB_STEP_SUMMARY: '',
          },
        },
      );
      if (scenario === 'generated') {
        assert.equal(run.status, 0, run.stderr);
        assert.match(readFileSync(output, 'utf8'), /fail_on=ERR/);
        assert.deepEqual(
          JSON.parse(
            readFileSync(join(folder, 'tmp/openapi-base.json'), 'utf8'),
          ),
          doc,
        );
      } else {
        assert.notEqual(run.status, 0);
        assert.match(
          run.stderr,
          scenario === 'invalid-sha' ? /40 hex/ : /Unknown legacy contract/,
        );
      }
    } finally {
      // Only remove the exact temporary fixture created by this test.
      if (dirname(resolve(folder)) === resolve(tmpdir()))
        rmSync(folder, { recursive: true, force: true });
    }
  });
}
