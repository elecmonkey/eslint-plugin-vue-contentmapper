import { ESLint, type Linter } from 'eslint';
import * as path from 'node:path';
import { expect, test } from 'rstack/test';
import vueContentMapper from '../src/index';

const fixtures = path.join(import.meta.dirname, 'fixtures');

async function lint(code: string, rules: Linter.RulesRecord = {}) {
  const eslint = new ESLint({
    cwd: fixtures,
    overrideConfigFile: true,
    overrideConfig: [
      ...vueContentMapper.configs.base,
      ...vueContentMapper.configs.vize,
      { files: ['**/*.vue/*.{js,jsx,ts,tsx}'], rules },
    ],
  });
  const [result] = await eslint.lintText(code, {
    filePath: path.join(fixtures, 'App.vue'),
  });
  return result!.messages.map(
    ({ ruleId, line, column, endLine, endColumn }) =>
      `${ruleId} ${line}:${column}-${endLine}:${endColumn}`,
  );
}

test('runs Vize rules on the SFC beside core rules on the virtual code', async () => {
  const code = `<script setup lang="ts">
const list = [1, 2];
</script>

<template>
  <div v-for="i in list">{{ i == 1 }}</div>
</template>
`;
  expect(await lint(code, { eqeqeq: 'error' })).toEqual([
    'vize/vue/require-v-for-key 6:3-6:26',
    'eqeqeq 6:31-6:33',
  ]);
});

test('lints SFCs without a script', async () => {
  const code = `<template>
  <div v-for="i in list">{{ i }}</div>
</template>
`;
  expect(await lint(code)).toEqual(['vize/vue/require-v-for-key 2:3-2:26']);
});

test('leaves rules covered by core rules to them', async () => {
  // Core `no-unused-vars` reports the unused `v-for` alias; Vize's `vue/no-unused-vars` is off.
  const code = `<script setup lang="ts">
const list = [1, 2];
</script>

<template>
  <div v-for="(item, index) in list" :key="item">{{ item }}</div>
</template>
`;
  expect(await lint(code, { 'no-unused-vars': 'error' })).toEqual([
    'no-unused-vars 6:22-6:27',
  ]);
  expect(vueContentMapper.configs.vize[0]!.rules).not.toHaveProperty(
    'vize/vue/no-unused-vars',
  );
});
