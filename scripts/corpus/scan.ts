// Lints every collected SFC with all non-deprecated core rules and reports crashes, fatal parse
// errors and positions outside the original file. Fatal errors are split by whether Vue's own
// compiler accepts the SFC: if it does not, the input itself is invalid.
import { ESLint, type Linter } from 'eslint';
import { builtinRules } from 'eslint/use-at-your-own-risk';
import { writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { compileScript, compileTemplate, parse } from 'vue/compiler-sfc';
import {
  describeCase,
  fixtures,
  isSfc,
  loadPlugin,
  outDir,
  readCases,
  virtualFiles,
} from './shared.ts';

interface Failure {
  type: 'crash' | 'fatal' | 'bad-position';
  where: string;
  message: string;
  /** Whether `vue/compiler-sfc` compiles the SFC without errors. */
  vueValid: boolean;
  code: string;
}

const lineBreak = new RegExp('\\r\\n|[\\r\\n\\u2028\\u2029]', 'u');

function vueErrors(code: string) {
  const errors: string[] = [];
  const { descriptor, errors: parseErrors } = parse(code, {
    filename: 'Case.vue',
  });
  errors.push(...parseErrors.map(String));
  let bindings;
  if (descriptor.script || descriptor.scriptSetup) {
    try {
      bindings = compileScript(descriptor, { id: 'case' }).bindings;
    } catch (error) {
      errors.push(String(error));
    }
  }
  if (descriptor.template && !descriptor.template.src) {
    const lang = descriptor.scriptSetup?.lang ?? descriptor.script?.lang;
    const result = compileTemplate({
      source: descriptor.template.content,
      filename: 'Case.vue',
      id: 'case',
      compilerOptions: {
        isTS: lang === 'ts' || lang === 'tsx',
        bindingMetadata: bindings,
      },
    });
    errors.push(...result.errors.map(String));
  }
  return errors;
}

function isBadPosition(message: Linter.LintMessage, lines: string[]) {
  const line = lines[message.line - 1];
  if (
    line === undefined ||
    message.column < 1 ||
    message.column > line.length + 1
  ) {
    return true;
  }
  if (message.endLine === undefined || message.endColumn === undefined) {
    return false;
  }
  return (
    message.endLine < message.line ||
    (message.endLine === message.line && message.endColumn < message.column)
  );
}

const plugin = await loadPlugin();
const rules: Linter.RulesRecord = {};
for (const [name, rule] of builtinRules) {
  if (!rule.meta?.deprecated) {
    rules[name] = 'error';
  }
}
const eslint = new ESLint({
  cwd: fixtures,
  overrideConfigFile: true,
  overrideConfig: [...plugin.configs.base, { files: virtualFiles, rules }],
});

const unique = new Map<string, string>();
for (const c of readCases()) {
  if (isSfc(c) && !unique.has(c.code)) {
    unique.set(c.code, describeCase(c));
  }
}

// `@vue/compiler-dom` logs recoverable parser errors from inside the content mapper, and
// `vue/compiler-sfc` logs warnings while classifying.
const { error: consoleError, warn: consoleWarn } = console;
console.error = console.warn = () => {};
const failures: Failure[] = [];
for (const [code, where] of unique) {
  const lines = code.split(lineBreak);
  let vueValid: boolean | undefined;
  const add = (type: Failure['type'], message: string) => {
    vueValid ??= vueErrors(code).length === 0;
    failures.push({ type, where, message, vueValid, code });
  };
  try {
    const [result] = await eslint.lintText(code, {
      filePath: path.join(fixtures, 'Case.vue'),
    });
    for (const message of result!.messages) {
      if (message.fatal) {
        add('fatal', message.message);
      } else if (isBadPosition(message, lines)) {
        add(
          'bad-position',
          `${message.ruleId} ${message.line}:${message.column}-${message.endLine}:${message.endColumn}`,
        );
      }
    }
  } catch (error) {
    add('crash', String(error).split('\n')[0]!);
  }
}
console.error = consoleError;
console.warn = consoleWarn;

writeFileSync(
  path.join(outDir, 'scan.json'),
  JSON.stringify(failures, null, 2),
);

const groups = new Map<string, Failure[]>();
for (const failure of failures) {
  const key = `${failure.vueValid ? 'vue-valid  ' : 'vue-invalid'}  ${failure.type}  ${failure.message.replace(/'[^']*'/g, `'…'`)}`;
  groups.set(key, [...(groups.get(key) ?? []), failure]);
}
console.log(
  `${unique.size} unique SFCs, ${failures.length} failures (${failures.filter((f) => f.vueValid).length} on SFCs Vue accepts)\n`,
);
for (const [key, group] of [...groups].sort(
  (a, b) => a[0].localeCompare(b[0]) || b[1].length - a[1].length,
)) {
  console.log(
    `${String(group.length).padStart(5)}  ${key}  e.g. ${group[0]!.where}`,
  );
}
console.log(
  `\nDetails: ${path.relative(process.cwd(), path.join(outDir, 'scan.json'))}`,
);
