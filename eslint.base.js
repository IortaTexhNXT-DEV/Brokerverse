import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';

/** Shared SonarQube-style rule set: complexity, size, duplication and bug-pattern rules for every workspace. */
export const qualityRules = {
  'sonarjs/cognitive-complexity': ['error', 15],
  'sonarjs/no-duplicate-string': ['error', { threshold: 4 }],
  complexity: ['error', 12],
  'max-lines-per-function': ['error', { max: 120, skipBlankLines: true, skipComments: true }],
  'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
  'max-depth': ['error', 4],
  'max-params': ['error', 5],
  'no-console': ['error', { allow: ['warn', 'error'] }],
  eqeqeq: 'error',
  'no-var': 'error',
  'prefer-const': 'error',
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
};

export const testOverrides = {
  'sonarjs/no-hardcoded-credentials': 'off',
  'sonarjs/no-hardcoded-passwords': 'off',
  'sonarjs/no-duplicate-string': 'off',
  'sonarjs/pseudo-random': 'off',
  'max-lines-per-function': 'off',
  'max-lines': 'off',
};

export function baseConfig(extra = []) {
  return tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    sonarjs.configs.recommended,
    { rules: qualityRules },
    ...extra,
    { ignores: ['dist/**', 'coverage/**'] },
  );
}
