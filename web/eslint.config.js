import reactHooks from 'eslint-plugin-react-hooks';
import { baseConfig, testOverrides } from '../eslint.base.js';
export default baseConfig([
  { plugins: { 'react-hooks': reactHooks }, rules: { ...reactHooks.configs.recommended.rules } },
  { files: ['src/test/**'], rules: testOverrides },
]);
