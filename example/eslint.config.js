import tseslint from 'typescript-eslint';
import vueContentMapper from '../dist/index.js';

export default [
  ...vueContentMapper.configs.base,
  {
    files: ['**/*.vue/*.{js,jsx,ts,tsx}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      eqeqeq: 'error',
      'no-debugger': 'error',
      'no-unused-expressions': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];
