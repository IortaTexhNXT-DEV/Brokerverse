import { baseConfig, testOverrides } from '../eslint.base.js';
export default baseConfig([{ files: ['test/**'], rules: testOverrides }]);
