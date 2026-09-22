import { baseConfig, testOverrides } from '../eslint.base.js';
export default baseConfig([
  { files: ['test/**'], rules: testOverrides },
  { files: ['src/seed.ts', 'src/cli.ts', 'src/index.ts'], rules: { 'sonarjs/no-hardcoded-passwords': 'off', 'no-console': 'off' } },
]);
