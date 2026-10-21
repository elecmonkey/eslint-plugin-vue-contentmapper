import type { Linter } from 'eslint';
import { LineIndex } from './sourceMap';

/**
 * Lets ESLint accept the original SFC block when `vue-eslint-parser` is not used. Vize's rules read
 * `sourceCode.text` and parse it themselves, so the AST is an empty program.
 */
export const sfcParser: Linter.Parser = {
  meta: {
    name: 'vue-contentmapper/sfc',
  },
  parseForESLint(code: string) {
    const end = new LineIndex(code).toPosition(code.length);
    return {
      ast: {
        type: 'Program',
        sourceType: 'module',
        body: [],
        comments: [],
        tokens: [],
        range: [0, code.length],
        loc: {
          start: { line: 1, column: 0 },
          end: { line: end.line, column: end.column - 1 },
        },
      },
    };
  },
};
