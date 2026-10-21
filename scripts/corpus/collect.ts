// Collects the test cases of eslint-plugin-vue's rule tests into `.corpus/cases.jsonl`. The
// `vue/*` rules themselves are not run: their cases only serve as SFC samples for `scan.ts`, and
// the cases of tests that run core rules on SFCs also provide expected errors for `diff.ts`.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { casesFile, isSfc, outDir, pluginRoot, readCases } from './shared.ts';

const vitest = path.join(pluginRoot, 'node_modules/.bin/vitest');
if (!existsSync(vitest)) {
  console.error(
    'eslint-plugin-vue has no dependencies installed; run `pnpm corpus:setup` first.',
  );
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
rmSync(casesFile, { force: true });

const result = spawnSync(
  vitest,
  ['run', '--config', path.join(import.meta.dirname, 'vitest.config.ts')],
  {
    cwd: pluginRoot,
    env: { ...process.env, CORPUS_CASES: casesFile },
    encoding: 'utf8',
  },
);

// A few test files import eslint-plugin-vue's own build output and fail to load; they are
// reported here and otherwise skipped.
const output = stripVTControlCharacters(result.stdout + result.stderr);
for (const line of output.split('\n')) {
  if (/Test Files|Cannot find module/.test(line)) {
    console.log(line.trim());
  }
}

if (!existsSync(casesFile)) {
  console.error('No cases were collected.');
  process.exit(1);
}
const cases = readCases();
const samples = new Set(cases.filter(isSfc).map((c) => c.code));
console.log(
  `Collected ${samples.size} unique SFC samples (${cases.length} cases from ${new Set(cases.map((c) => c.testFile)).size} test files) into ${path.relative(process.cwd(), casesFile)}.`,
);
