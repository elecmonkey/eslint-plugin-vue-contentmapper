import tsParser from '@typescript-eslint/parser';
import type { ESLint, Linter } from 'eslint';
import { processor } from './processor';

const plugin: ESLint.Plugin & { configs: { base: Linter.Config[] } } = {
  meta: {
    name: 'eslint-plugin-vue-contentmapper',
  },
  processors: {
    vue: processor,
  },
  configs: { base: [] },
};

plugin.configs.base = [
  {
    files: ['**/*.vue'],
    plugins: { 'vue-contentmapper': plugin },
    processor: 'vue-contentmapper/vue',
  },
  {
    // Virtual blocks are named `<file>.vue/0.ts` or `<file>.vue/0.tsx`.
    files: ['**/*.vue/*.ts', '**/*.vue/*.tsx'],
    languageOptions: {
      parser: tsParser,
    },
  },
];

export default plugin;
