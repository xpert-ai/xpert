import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { connectionDefaults } = require('../electron/connection/defaults.cjs')

export function connectionDefaultsPlugin() {
  return {
    name: 'bosi-connection-defaults',
    apply: 'build',
    buildStart() {
      this.emitFile({
        type: 'asset',
        fileName: 'connection-defaults.json',
        source: JSON.stringify(connectionDefaults(), null, 2) + '\n'
      })
    }
  }
}
