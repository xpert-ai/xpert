/**
 * In order to solve the problem that the `index.cjs.js` cannot be found during the development phase
 *  when introducing external plugins (`@xpert-ai/plugin-xxx`) and it referencing `@metad/server-core`.
 * - Before using external plugins, you need to nx build this library.
 */
module.exports = require('../../dist/packages/server/src/index')