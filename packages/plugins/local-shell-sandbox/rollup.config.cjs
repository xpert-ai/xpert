// Workspace protocols are for source development. The separately installed
// extension must use host-compatible semver peers and contain only runtime files.
const fs = require('node:fs')
const path = require('node:path')

module.exports = (config) => ({
  ...config,
  plugins: [
    ...config.plugins,
    {
      name: 'local-shell-plugin-manifest',
      writeBundle: {
        order: 'post',
        sequential: true,
        handler(output) {
          const file = path.join(output.dir, 'package.json')
          const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
          for (const name of ['contracts', 'plugin-sdk']) {
            const peer = require(`../../${name}/package.json`)
            manifest.peerDependencies[peer.name] = `^${peer.version}`
          }
          manifest.scripts = {
            'check:terminal': manifest.scripts['check:terminal'],
            'rebuild:terminal': manifest.scripts['rebuild:terminal']
          }
          fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n')
        }
      }
    }
  ]
})
