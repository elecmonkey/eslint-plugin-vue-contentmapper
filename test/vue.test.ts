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
      ...vueContentMapper.configs.vue,
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

test('runs eslint-plugin-vue rules on the SFC beside core rules on the virtual code', async () => {
  const code = `<script setup lang="ts">
const list: number[] = [1, 2];
</script>

<template>
  <div v-for="i in list">
    {{ i == 1 }}
  </div>
</template>
`;
  expect(await lint(code, { eqeqeq: 'error' })).toEqual([
    'vue/require-v-for-key 6:3-6:26',
    'eqeqeq 7:10-7:12',
  ]);
});

test('leaves rules covered by core rules to them', async () => {
  const code = `<script setup lang="ts">
const list = [1, 2];
</script>

<template>
  <div
    v-for="(item, index) in list"
    :key="item"
  >
    {{ item }}
  </div>
</template>
`;
  expect(await lint(code, { 'no-unused-vars': 'error' })).toEqual([
    'no-unused-vars 7:19-7:24',
  ]);
  const rules = vueContentMapper.configs.vue.flatMap((config) =>
    Object.keys(config.rules ?? {}),
  );
  expect(rules).toContain('vue/require-v-for-key');
  expect(rules).not.toContain('vue/no-unused-vars');
  expect(rules).not.toContain('vue/comment-directive');
});

test('turns off layout rules and picks the preset through options', () => {
  const rulesOf = (configs: Linter.Config[]) =>
    configs.flatMap((config) => Object.keys(config.rules ?? {}));
  const isLayout = (rule: string) =>
    vueContentMapper.pluginVue.rules[rule.slice('vue/'.length)]?.meta?.type ===
    'layout';

  expect(rulesOf(vueContentMapper.vue())).toEqual(
    rulesOf(vueContentMapper.configs.vue),
  );
  expect(rulesOf(vueContentMapper.vue()).some(isLayout)).toBe(true);

  const withoutLayout = rulesOf(vueContentMapper.vue({ layout: false }));
  expect(withoutLayout.some(isLayout)).toBe(false);
  expect(withoutLayout).toContain('vue/attributes-order');

  const essential = rulesOf(vueContentMapper.vue({ preset: 'essential' }));
  expect(essential).toContain('vue/require-v-for-key');
  expect(essential).not.toContain('vue/attributes-order');
});
