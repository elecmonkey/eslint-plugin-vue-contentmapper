import type { Linter } from 'eslint';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ExpectedError {
  message?: string;
  messageId?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

/** One RuleTester case from eslint-plugin-vue, as recorded by `collect-compat.ts`. */
export interface Case {
  testFile: string;
  ruleName: string;
  kind: 'valid' | 'invalid';
  index: number;
  code: unknown;
  filename?: string;
  options?: unknown[];
  parser?: string;
  languageOptions?: { globals?: Linter.Globals };
  /** Expected errors, or only their count when the test gives a number. */
  errors: ExpectedError[] | number;
}

export const root = path.resolve(import.meta.dirname, '../..');
export const pluginRoot = path.join(root, 'eslint-plugin-vue');
export const outDir = path.join(root, '.corpus');
export const casesFile = path.join(outDir, 'cases.jsonl');
/** Directory with a tsconfig, used as `cwd` and file location when linting cases. */
export const fixtures = path.join(root, 'test/fixtures');

export function readCases(): Case[] {
  return readFileSync(casesFile, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Case);
}

/** Whether eslint-plugin-vue's tests parse the case as an SFC. */
export function isSfc(c: Case): c is Case & { code: string } {
  if (typeof c.code !== 'string') {
    return false;
  }
  if (c.filename) {
    return c.filename.endsWith('.vue');
  }
  return c.parser === 'vue-eslint-parser';
}

export function describeCase(c: Case) {
  return `${path.basename(c.testFile)} ${c.ruleName} ${c.kind}[${c.index}]`;
}

/** The built plugin from `dist/`, which bundles `@vue/content-mapper`. */
export async function loadPlugin() {
  const module = (await import(
    pathToFileURL(path.join(root, 'dist/index.js')).href
  )) as typeof import('../../src/index.ts');
  return module.default;
}

export const virtualFiles = ['**/*.vue/*.{js,jsx,ts,tsx}'];
