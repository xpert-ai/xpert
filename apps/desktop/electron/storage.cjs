const fs = require('node:fs')
const path = require('node:path')

function createStorage(directory, encryption) {
  const file = path.join(directory, 'desktop-state.json')
  return {
    read() {
      try {
        const state = JSON.parse(fs.readFileSync(file, 'utf8'))
        let credentials = null
        if (state.encrypted && encryption.isEncryptionAvailable()) {
          credentials = JSON.parse(encryption.decryptString(Buffer.from(state.encrypted, 'base64')))
          if (typeof credentials?.token !== 'string' || typeof credentials.refreshToken !== 'string') credentials = null
        }
        return { config: state.config, credentials, sidebars: state.sidebars }
      } catch {
        return null
      }
    },
    write(state) {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
      const encrypted =
        state.credentials && encryption.isEncryptionAvailable()
          ? encryption.encryptString(JSON.stringify(state.credentials)).toString('base64')
          : null
      const temporary = `${file}.tmp`
      fs.writeFileSync(temporary, JSON.stringify({ config: state.config, encrypted, sidebars: state.sidebars }), {
        mode: 0o600
      })
      fs.renameSync(temporary, file)
    }
  }
}
module.exports = { createStorage }
