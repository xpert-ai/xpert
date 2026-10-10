const path = require('node:path')
const { readdir, access } = require('node:fs/promises')
const { hasAudioInputEntitlement } = require('../electron/audio-permissions.cjs')

async function verifyAudioSigning(appPath, inspect = hasAudioInputEntitlement) {
  const frameworks = path.join(appPath, 'Contents/Frameworks')
  const helpers = (await readdir(frameworks)).filter((name) => name.endsWith('.app') && name.includes('Helper'))
  if (!helpers.length) throw new Error('Packaged Electron helpers are missing.')
  const native = path.join(appPath, 'Contents/Resources/app.asar.unpacked/resources/audio-capture/audio-capture')
  await access(native)
  for (const file of [appPath, ...helpers.map((name) => path.join(frameworks, name)), native]) {
    if (!(await inspect(file))) throw new Error(`Audio input entitlement is missing: ${path.basename(file)}`)
  }
}

module.exports = async (context) => {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  await verifyAudioSigning(appPath)
}
module.exports.verifyAudioSigning = verifyAudioSigning
