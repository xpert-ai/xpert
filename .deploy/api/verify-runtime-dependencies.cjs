const { createRequire } = require('node:module')
const path = require('node:path')

// Why this exists: main.js keeps ChatKit as an external require(). A healthy
// API can still fail business requests when the image installs an older package.
// Resolve from main.js, not from this checker's own directory.
const requireFromApi = createRequire(path.resolve('main.js'))
const chatkit = requireFromApi('@xpert-ai/chatkit-types')
const requiredExports = ['getMessageSkillUsages', 'normalizeChatSkillUsages', 'normalizeThreadReference']
const missing = requiredExports.filter((name) => typeof chatkit[name] !== 'function')

if (missing.length) {
  throw new Error(`Incompatible @xpert-ai/chatkit-types runtime: missing ${missing.join(', ')}`)
}

console.log('ChatKit runtime exports verified')
