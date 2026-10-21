import { ESLint, type Linter } from 'eslint';
import * as path from 'node:path';
import { expect, test } from 'rstack/test';
import vueContentMapper from '../src/index';

const fixtures = path.join(import.meta.dirname, 'fixtures');

async function lint(code: string, rules: Linter.RulesRecord, fix = false) {
  const eslint = new ESLint({
    cwd: fixtures,
    overrideConfigFile: true,
    overrideConfig: [
      ...vueContentMapper.configs.base,
      { files: ['**/*.vue/*.ts', '**/*.vue/*.tsx'], rules },
    ],
    fix,
  });
  const [result] = await eslint.lintText(code, {
    filePath: path.join(fixtures, 'App.vue'),
  });
  return result!;
}

function positions(result: ESLint.LintResult) {
  return result.messages.map(
    ({ ruleId, line, column, endLine, endColumn }) =>
      `${ruleId} ${line}:${column}-${endLine}:${endColumn}`,
  );
}

const counter = `<script setup lang="ts">
import { ref } from 'vue';

const count = ref(0);
</script>

<template>
	<button @click="count++">{{ count == 2 ? 'two' : count }}</button>
</template>
`;

test('maps reports in script and template back to the original file', async () => {
  const result = await lint(counter, { eqeqeq: 'error' });
  expect(positions(result)).toEqual(['eqeqeq 8:36-8:38']);
});

test('drops reports that start in generated code', async () => {
  // The generated template code contains standalone expression statements such as
  // `( count.value == 2 ? 'two' : count.value );`, whose start has no original span.
  const result = await lint(counter, { 'no-unused-expressions': 'error' });
  expect(result.messages).toEqual([]);
});

test('deduplicates an original span that is generated more than once', async () => {
  const result = await lint(counter, {
    'no-restricted-syntax': ['error', 'Identifier[name="count"]'],
  });
  expect(positions(result)).toEqual([
    'no-restricted-syntax 4:7-4:12',
    'no-restricted-syntax 8:18-8:23',
    'no-restricted-syntax 8:30-8:35',
    'no-restricted-syntax 8:51-8:56',
  ]);
});

test('maps an Atom span as a whole', async () => {
  // `count` in the template is generated as `count.value`; the `.value` part is an Atom that maps
  // back to the same `count`, so the member expression report covers exactly `count`.
  const result = await lint(counter, {
    'no-restricted-syntax': [
      'error',
      'MemberExpression[property.name="value"]',
    ],
  });
  expect(positions(result)).toEqual([
    'no-restricted-syntax 8:18-8:23',
    'no-restricted-syntax 8:30-8:35',
    'no-restricted-syntax 8:51-8:56',
  ]);
});

test('applies fixes inside verbatim spans in script and template', async () => {
  const code = `<script setup lang="ts">
let flag = true;
</script>

<template>
	<div v-if="!!flag" />
</template>
`;
  const result = await lint(
    code,
    { 'prefer-const': 'error', 'no-extra-boolean-cast': 'error' },
    true,
  );
  expect(result.messages).toEqual([]);
  expect(result.output).toBe(`<script setup lang="ts">
const flag = true;
</script>

<template>
	<div v-if="flag" />
</template>
`);
});

test('reports mapped parse errors in the original file', async () => {
  const code = `<script setup lang="ts">
const a = ;
</script>
`;
  const result = await lint(code, {});
  expect(result.messages).toHaveLength(1);
  expect(result.messages[0]).toMatchObject({ fatal: true, line: 2 });
});
