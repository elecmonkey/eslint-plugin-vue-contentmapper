// Stands in for eslint-plugin-vue's `tests/eslint-compat` while collecting test cases: `RuleTester`
// records every case to the file named by `CORPUS_CASES` instead of running it.
import { ESLint as ESLintRaw, Linter as LinterRaw } from 'eslint';
import { appendFileSync } from 'node:fs';
import type { Case, ExpectedError } from './shared.ts';

export const ESLint = ESLintRaw;
export const Linter = LinterRaw;
export const FlatESLint = ESLintRaw;

interface RuleLike {
  meta?: { messages?: Record<string, string> };
}

interface TestCase {
  code: unknown;
  filename?: string;
  options?: unknown[];
  languageOptions?: Record<string, unknown>;
  errors?:
    (string | (ExpectedError & { data?: Record<string, unknown> }))[] | number;
}

const out = process.env.CORPUS_CASES!;
// Vitest's `expect` is a global here (`globals: true`), so this file needs no `vitest` import.
const { expect } = globalThis as unknown as {
  expect: { getState(): { testPath?: string } };
};

function parserName(languageOptions: Record<string, unknown> | undefined) {
  const parser = languageOptions?.parser as
    { meta?: { name?: string }; name?: string } | undefined;
  return parser ? (parser.meta?.name ?? parser.name ?? 'unknown') : undefined;
}

// Keeps the serializable parts of languageOptions, dropping parser objects.
function plainLanguageOptions(languageOptions: Record<string, unknown>) {
  const { parser: _parser, parserOptions, ...rest } = languageOptions;
  const { parser: _innerParser, ...plainParserOptions } = (parserOptions ??
    {}) as Record<string, unknown>;
  return JSON.parse(
    JSON.stringify({ ...rest, parserOptions: plainParserOptions }),
  ) as Case['languageOptions'];
}

function interpolate(text: string, data: Record<string, unknown> = {}) {
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, key: string) =>
    key in data ? String(data[key]) : match,
  );
}

function resolveError(
  rule: RuleLike,
  error: string | (ExpectedError & { data?: Record<string, unknown> }),
): ExpectedError {
  if (typeof error === 'string') {
    return { message: error };
  }
  const { messageId, data, message, line, column, endLine, endColumn } = error;
  const template = messageId ? rule.meta?.messages?.[messageId] : undefined;
  return {
    message: message ?? (template ? interpolate(template, data) : undefined),
    messageId,
    line,
    column,
    endLine,
    endColumn,
  };
}

export class RuleTester {
  #config: { languageOptions?: Record<string, unknown> };

  constructor(config: { languageOptions?: Record<string, unknown> } = {}) {
    this.#config = config;
  }

  run(
    ruleName: string,
    rule: RuleLike,
    tests: { valid?: (string | TestCase)[]; invalid?: TestCase[] },
  ) {
    const testFile = expect.getState().testPath ?? '';
    const lines: string[] = [];
    for (const kind of ['valid', 'invalid'] as const) {
      (tests[kind] ?? []).forEach((item, index) => {
        const test: TestCase = typeof item === 'string' ? { code: item } : item;
        const languageOptions = {
          ...this.#config.languageOptions,
          ...test.languageOptions,
        };
        const record: Case = {
          testFile,
          ruleName,
          kind,
          index,
          code: test.code,
          filename: test.filename,
          options: test.options,
          parser:
            parserName(test.languageOptions) ??
            parserName(this.#config.languageOptions),
          languageOptions: plainLanguageOptions(languageOptions),
          errors:
            kind === 'invalid'
              ? typeof test.errors === 'number'
                ? test.errors
                : (test.errors ?? []).map((error) => resolveError(rule, error))
              : [],
        };
        lines.push(JSON.stringify(record));
      });
    }
    appendFileSync(out, lines.join('\n') + '\n');
  }
}
