// Compares this plugin's reports with eslint-plugin-vue's expected errors for the tests that run
// core rules on SFCs: `tests/lib/script-setup-vars.test.ts` (core `no-unused-vars` / `no-undef`)
// and the tests of rules that wrap a core rule for templates (`wrapCoreRule`).
import { ESLint, type Linter } from 'eslint';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import {
  type Case,
  describeCase,
  type ExpectedError,
  fixtures,
  isSfc,
  loadPlugin,
  outDir,
  pluginRoot,
  readCases,
  virtualFiles,
} from './shared.ts';

interface Report {
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

interface Result {
  where: string;
  rule: string;
  ok: boolean;
  expected: number;
  matched: number;
  missing: ExpectedError[];
  /** Unexpected reports; for wrapped rules only those in the template count. */
  extra: Report[];
  /** Reports of wrapped rules in `<script>`, where the core rule runs by design. */
  extraScript: number;
  rangeDiff: { expected: ExpectedError; actual: Report }[];
  fatal: string[];
}

const coreRuleTests = new Set(['script-setup-vars.test.ts']);
const rulesDir = path.join(pluginRoot, 'lib/rules');
const wrappedRuleTests = new Set(
  readdirSync(rulesDir)
    .filter(
      (file) =>
        /\.[jt]s$/.test(file) &&
        readFileSync(path.join(rulesDir, file), 'utf8').includes(
          'wrapCoreRule(',
        ),
    )
    .map((file) => file.replace(/\.[jt]s$/, '.test.ts')),
);

const plugin = await loadPlugin();
const cases = readCases().filter((c): c is Case & { code: string } => {
  const file = path.basename(c.testFile);
  return isSfc(c) && (coreRuleTests.has(file) || wrappedRuleTests.has(file));
});

function toReport(message: Linter.LintMessage): Report {
  const { line, column, endLine, endColumn } = message;
  return { message: message.message, line, column, endLine, endColumn };
}

function lineStarts(text: string) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

const results: Result[] = [];
for (const c of cases) {
  const eslint = new ESLint({
    cwd: fixtures,
    overrideConfigFile: true,
    overrideConfig: [
      ...plugin.configs.base,
      {
        files: virtualFiles,
        rules: {
          [c.ruleName]: ['error', ...(c.options ?? [])],
        } as Linter.RulesRecord,
        languageOptions: { globals: c.languageOptions?.globals ?? {} },
      },
    ],
  });
  const [lintResult] = await eslint.lintText(c.code, {
    filePath: path.join(fixtures, 'Case.vue'),
  });
  const messages = lintResult!.messages;
  const fatal = messages.filter((m) => m.fatal).map((m) => m.message);
  const actual = messages.filter((m) => m.ruleId === c.ruleName).map(toReport);

  const starts = lineStarts(c.code);
  const templateStart = c.code.indexOf('<template');
  const templateEnd = c.code.lastIndexOf('</template>');
  const inTemplate = (report: Report) => {
    const offset = starts[report.line - 1]! + report.column - 1;
    return templateStart >= 0 && offset > templateStart && offset < templateEnd;
  };

  const expected = Array.isArray(c.errors) ? c.errors : [];
  const unmatched = [...actual];
  const missing: ExpectedError[] = [];
  const rangeDiff: Result['rangeDiff'] = [];
  let matched = 0;
  for (const error of expected) {
    const index = unmatched.findIndex(
      (report) =>
        report.message === error.message &&
        (error.line === undefined || report.line === error.line) &&
        (error.column === undefined || report.column === error.column),
    );
    if (index < 0) {
      missing.push(error);
      continue;
    }
    const [report] = unmatched.splice(index, 1);
    matched++;
    if (
      (error.endLine !== undefined && report!.endLine !== error.endLine) ||
      (error.endColumn !== undefined && report!.endColumn !== error.endColumn)
    ) {
      rangeDiff.push({ expected: error, actual: report! });
    }
  }
  const coreRule = coreRuleTests.has(path.basename(c.testFile));
  const extra = coreRule ? unmatched : unmatched.filter(inTemplate);
  const countMismatch =
    typeof c.errors === 'number' && c.errors !== actual.length;

  results.push({
    where: describeCase(c),
    rule: c.ruleName,
    ok:
      !fatal.length &&
      !missing.length &&
      !extra.length &&
      !rangeDiff.length &&
      !countMismatch,
    expected: Array.isArray(c.errors) ? c.errors.length : c.errors,
    matched,
    missing,
    extra,
    extraScript: unmatched.length - extra.length,
    rangeDiff,
    fatal,
  });
}

writeFileSync(path.join(outDir, 'diff.json'), JSON.stringify(results, null, 2));

const byRule: Record<string, Record<string, number>> = {};
for (const r of results) {
  const s = (byRule[r.rule] ??= {
    cases: 0,
    ok: 0,
    expected: 0,
    matched: 0,
    missing: 0,
    extra: 0,
    extraScript: 0,
    rangeDiff: 0,
    fatal: 0,
  });
  s.cases!++;
  s.ok! += Number(r.ok);
  s.expected! += r.expected;
  s.matched! += r.matched;
  s.missing! += r.missing.length;
  s.extra! += r.extra.length;
  s.extraScript! += r.extraScript;
  s.rangeDiff! += r.rangeDiff.length;
  s.fatal! += Number(r.fatal.length > 0);
}
console.table(byRule);

const position = (p: {
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}) =>
  `${p.line}:${p.column}` +
  (p.endLine === undefined ? '' : `-${p.endLine}:${p.endColumn}`);
for (const r of results.filter((r) => !r.ok)) {
  console.log(r.where);
  for (const error of r.missing)
    console.log(`  missing ${position(error)}  ${error.message}`);
  for (const report of r.extra)
    console.log(`  extra   ${position(report)}  ${report.message}`);
  for (const { expected, actual } of r.rangeDiff)
    console.log(
      `  range   expected ${position(expected)}, got ${position(actual)}`,
    );
  for (const message of r.fatal) console.log(`  fatal   ${message}`);
}
console.log(
  `\n${results.filter((r) => r.ok).length}/${results.length} cases match. Details: ${path.relative(process.cwd(), path.join(outDir, 'diff.json'))}`,
);
