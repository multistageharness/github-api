import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

import root from '../eslint.config.js';

/**
 * Package-local flat config: the shared workspace rules (which only match
 * `**\/*.ts`) plus the same rules for `**\/*.tsx`, with JSX parsing enabled.
 * Kept local so the root config stays `.ts`-only for the other packages.
 */
const tsBlock = root.find((c) => c.files?.includes('**/*.ts'));
if (!tsBlock) throw new Error('eslint: shared **/*.ts block not found in ../eslint.config.js');

export default [
  ...root,
  {
    ...tsBlock,
    files: ['**/*.tsx'],
    languageOptions: {
      ...tsBlock.languageOptions,
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { '@typescript-eslint': tsPlugin },
  },
];
