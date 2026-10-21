import tsParser from '@typescript-eslint/parser';
import type { ESLint, Linter } from 'eslint';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { processor } from './processor';
import { sfcParser } from './sfcParser';

const require = createRequire(import.meta.url);

type Plugin = ESLint.Plugin & { configs: Record<string, Linter.Config[]> };

/**
 * Rules of eslint-plugin-vue and Vize that check what ESLint core and typescript-eslint rules
 * already check on the virtual code, which covers the template too. Only rules about the SFC itself
 * are enabled.
 */
const coveredRules = new Set([
  'vue/no-unused-vars',
  'vize/vue/no-unused-vars',
  'vize/vue/no-unused-setup-bindings',
  'vize/script/no-restricted-globals',
  'vize/script/no-restricted-members',
  'vize/script/require-function-return-type',
  'vize/type/no-floating-promises',
  'vize/type/strict-boolean-expressions',
]);

function withoutCoveredRules(
  config: Linter.Config,
  isCovered: (rule: string) => boolean,
): Linter.Config {
  if (!config.rules) {
    return config;
  }
  return {
    ...config,
    rules: Object.fromEntries(
      Object.entries(config.rules).filter(([rule]) => !isCovered(rule)),
    ),
  };
}

/** eslint-plugin-vue's `flat/recommended`, scoped to the original SFC block. */
function createVueConfigs(): Linter.Config[] {
  const vue = require('eslint-plugin-vue') as Plugin;
  const isCovered = (name: string) => {
    const meta = vue.rules?.[name.slice('vue/'.length)]?.meta as
      { type?: string; docs?: { extensionSource?: unknown } } | undefined;
    return (
      coveredRules.has(name) ||
      // It only works with eslint-plugin-vue's processor, which this plugin replaces.
      name === 'vue/comment-directive' ||
      // Extensions of core rules, except layout ones the virtual code cannot check.
      (meta?.docs?.extensionSource !== undefined && meta.type !== 'layout')
    );
  };
  return [
    ...vue.configs['flat/recommended']!.map(
      ({ processor: _processor, ...config }) =>
        withoutCoveredRules({ files: ['**/*.vue'], ...config }, isCovered),
    ),
    {
      files: ['**/*.vue'],
      languageOptions: {
        parserOptions: { parser: tsParser },
      },
    },
  ];
}

/** Resolves an entry that `require.resolve` rejects because it only has an `import` condition. */
function resolveImportEntry(name: string, entry: string) {
  for (const dir of require.resolve.paths(name) ?? []) {
    const packageDir = path.join(dir, name);
    if (existsSync(path.join(packageDir, 'package.json'))) {
      const { exports } = require(path.join(packageDir, 'package.json')) as {
        exports: Record<string, { import: string }>;
      };
      return path.join(packageDir, exports[entry]!.import);
    }
  }
  throw new Error(`Cannot find package '${name}'`);
}

function createVizeConfigs(): Linter.Config[] {
  const { default: vize, configs } = require(
    resolveImportEntry('oxlint-plugin-vize', './eslint'),
  ) as typeof import('oxlint-plugin-vize/eslint');
  return [
    withoutCoveredRules(
      {
        files: ['**/*.vue'],
        plugins: { vize: vize as unknown as ESLint.Plugin },
        settings: { vize: { preset: 'incremental', helpLevel: 'none' } },
        rules: configs.recommended,
      },
      (rule) => coveredRules.has(rule),
    ),
  ];
}

const plugin: Plugin = {
  meta: {
    name: 'eslint-plugin-vue-contentmapper',
  },
  processors: {
    vue: processor,
  },
  configs: {},
};

plugin.configs = {
  base: [
    {
      files: ['**/*.vue'],
      plugins: { 'vue-contentmapper': plugin },
      processor: 'vue-contentmapper/vue',
      // For the original SFC block, which `configs.vue` parses with `vue-eslint-parser` instead.
      languageOptions: {
        parser: sfcParser,
      },
    },
    {
      // The virtual code block is a `.ts` file, or `.js` when `<script>` has no `lang`.
      files: ['**/*.vue/*.{js,jsx,ts,tsx}'],
      languageOptions: {
        parser: tsParser,
      },
    },
  ],
  // Peer dependencies are loaded only when their config is used.
  get vue() {
    return createVueConfigs();
  },
  get vize() {
    return createVizeConfigs();
  },
};

export default plugin as Plugin & {
  configs: {
    base: Linter.Config[];
    vue: Linter.Config[];
    vize: Linter.Config[];
  };
};
