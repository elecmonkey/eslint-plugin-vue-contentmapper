import { define } from 'rstack';

define.lib({
  lib: [
    {
      dts: true,
      shims: {
        esm: {
          // `@vue/content-mapper` loads TypeScript and Vue language plugins with runtime `require`.
          require: true,
        },
      },
    },
  ],
});

define.lint(({ globalIgnores, js, ts }) => [
  globalIgnores(['vue-language-tools/**', 'eslint-plugin-vue/**']),
  js.configs.recommended,
  ts.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
]);

define.fmt({
  singleQuote: true,
  sortPackageJson: true,
  ignorePatterns: ['vue-language-tools', 'eslint-plugin-vue'],
});

define.test({
  include: ['test/**/*.test.ts'],
  output: {
    // `@vue/language-core` imports `{ posix }` from this CommonJS package, a named export Node
    // cannot detect when the package is externalized as an ES module.
    bundleDependencies: ['path-browserify'],
  },
});
