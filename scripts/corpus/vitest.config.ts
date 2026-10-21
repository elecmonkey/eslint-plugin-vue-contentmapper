// Runs eslint-plugin-vue's rule tests with `collect-compat.ts` in place of its RuleTester. Plain
// object without imports from `vitest`, so it loads from outside the submodule.
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(dirname, '../../eslint-plugin-vue');

export default {
  root: pluginRoot,
  resolve: {
    alias: [
      {
        find: /^(\.\.\/)+eslint-compat$/,
        replacement: path.join(dirname, 'collect-compat.ts'),
      },
      // Same CJS pinning as eslint-plugin-vue's own vitest.config.mts.
      {
        find: '@eslint-community/eslint-utils',
        replacement: path.join(
          pluginRoot,
          'node_modules/@eslint-community/eslint-utils/index.js',
        ),
      },
    ],
  },
  test: {
    include: [
      'tests/lib/rules/**/*.test.ts',
      'tests/lib/script-setup-vars.test.ts',
    ],
    globals: true,
    passWithNoTests: true,
  },
};
