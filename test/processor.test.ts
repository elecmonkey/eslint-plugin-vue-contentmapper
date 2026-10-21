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
      { files: ['**/*.vue/*.{js,jsx,ts,tsx}'], rules },
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

test('lints SFCs whose script has no lang', async () => {
  // A `<script>` without `lang` produces a `.js` virtual block.
  const code = `<script setup>
const props = defineUnknown({ foo: String });
</script>
`;
  const result = await lint(code, { 'no-undef': 'error' });
  expect(positions(result)).toEqual(['no-undef 2:15-2:28']);
});

test('drops reports that start in generated code', async () => {
  // The generated template code contains standalone expression statements such as
  // `( count.value == 2 ? 'two' : count.value );`, whose start has no original span.
  const result = await lint(counter, { 'no-unused-expressions': 'error' });
  expect(result.messages).toEqual([]);
});

test('maps reports that start on a generated identifier prefix', async () => {
  // Props are read as `__VLS_ctx.b`, plain reads of setup bindings as `__VLS_unwrap(a, …)`, and
  // unknown names as `__VLS_ctx.value`.
  const code = `<script setup lang="ts">
let a = 1;
defineProps<{ b: number }>();
</script>

<template>
	<div :class="b !== 2 ? 'x' : 'y'">{{ a + 1 }}{{ value() }}</div>
</template>
`;
  const result = await lint(code, {
    'no-negated-condition': 'error',
    'no-restricted-syntax': [
      'error',
      'BinaryExpression[operator="+"]',
      'CallExpression',
    ],
  });
  // The generated `__VLS_unwrap(a, …)` call itself is not reported; `defineProps()` is user code.
  expect(positions(result)).toEqual([
    'no-restricted-syntax 3:1-3:29',
    'no-negated-condition 7:15-7:34',
    'no-restricted-syntax 7:39-7:44',
    'no-restricted-syntax 7:50-7:57',
  ]);
});

test('drops reports on a generated identifier wrapper itself', async () => {
  // `{{ value }}` is generated as `__VLS_ctx.value`, a member expression the user did not write.
  const code = `<template>{{ value }}</template>\n`;
  const result = await lint(code, {
    'no-restricted-syntax': ['error', 'MemberExpression'],
  });
  expect(result.messages).toEqual([]);
});

test('drops reports on generated names mapped to user code', async () => {
  // `__VLS_export` maps to the whole `<script setup>` content; its `no-unused-vars` report must
  // not land on the script, while the unused import is still reported.
  const code = `<script setup>
import Foo from './Foo.vue';
import Bar from './Bar.vue';
</script>

<template><Foo /></template>
`;
  const result = await lint(code, { 'no-unused-vars': 'error' });
  expect(
    result.messages.map((m) => `${m.line}:${m.column} ${m.message}`),
  ).toEqual(["3:8 'Bar' is defined but never used."]);
});

test('removes identifier wrappers from messages', async () => {
  // `foo` is read as `__VLS_ctx.foo`, `a` as `__VLS_unwrap(a, …)`.
  const code = `<script setup lang="ts">
let a = 1;
</script>

<template>{{ !!foo }}{{ '' + a }}</template>
`;
  const result = await lint(code, { 'no-implicit-coercion': 'error' });
  expect(result.messages.map((m) => m.message)).toEqual([
    'Unexpected implicit coercion encountered. Use `Boolean(foo)` instead.',
    'Unexpected implicit coercion encountered. Use `String(a)` instead.',
  ]);
});

test('keeps message text that the user wrote', async () => {
  const code = `<script setup lang="ts">
const s = '__VLS_ctx.foo';
</script>

<template>{{ !!foo }}</template>
`;
  const result = await lint(code, { 'no-implicit-coercion': 'error' });
  expect(result.messages.map((m) => m.message)).toEqual([
    'Unexpected implicit coercion encountered. Use `Boolean(__VLS_ctx.foo)` instead.',
  ]);
});

test('keeps reports on user code spelling a generated prefix', async () => {
  const code = `<template>
	<div>{{ '__VLS_ctx.foo' }}</div>
</template>
`;
  const result = await lint(code, {
    'no-restricted-syntax': ['error', 'Literal'],
  });
  expect(positions(result)).toEqual(['no-restricted-syntax 2:10-2:25']);
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
