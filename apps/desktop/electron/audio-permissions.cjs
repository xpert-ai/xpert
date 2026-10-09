// OS consent and hardened-runtime signing are independent. Never prompt from capability polling.
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const run = promisify(execFile)

async function hasAudioInputEntitlement(executable) {
  const { stdout } = await run('/usr/bin/codesign', ['-d', '--entitlements', ':-', executable], {
    timeout: 5000,
    maxBuffer: 128 * 1024
  })
  return /<key>com\.apple\.security\.device\.audio-input<\/key>\s*<true\s*\/>/.test(stdout)
}

function createAudioPermissions({
  systemPreferences,
  platform = process.platform,
  packaged = false,
  executable = process.execPath,
  inspectSigning = hasAudioInputEntitlement
}) {
  let signature
  let requesting
  async function microphone({ prompt = false } = {}) {
    if (platform !== 'darwin') return { success: true }
    try {
      if (packaged) {
        signature ??= inspectSigning(executable)
        if (!(await signature)) return { success: false, code: 'audio_signing_missing' }
      }
      const status = systemPreferences.getMediaAccessStatus('microphone')
      if (status === 'granted') return { success: true }
      if (status === 'not-determined' && !prompt) return { success: true }
      if (status === 'not-determined') {
        requesting ??= systemPreferences.askForMediaAccess('microphone').finally(() => {
          requesting = undefined
        })
        return (await requesting) ? { success: true } : { success: false, code: 'audio_permission_denied' }
      }
      return {
        success: false,
        code: status === 'unknown' ? 'audio_permission_check_failed' : 'audio_permission_denied'
      }
    } catch {
      return { success: false, code: 'audio_permission_check_failed' }
    }
  }
  return { microphone }
}

function registerAudioPermissionIpc(ipcMain, permissions, trusted) {
  ipcMain.handle('xpert:microphone-permission', (event) =>
    trusted(event) ? permissions.microphone({ prompt: true }) : { success: false, code: 'forbidden' }
  )
}
module.exports = { createAudioPermissions, hasAudioInputEntitlement, registerAudioPermissionIpc }
