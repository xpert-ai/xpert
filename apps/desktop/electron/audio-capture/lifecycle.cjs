function registerAudioCaptureIpc(ipcMain, capture, trusted) {
  ipcMain.handle('xpert:audio-capture', (event, input) =>
    trusted(event) ? capture.command(input) : { success: false, code: 'forbidden' }
  )
}
async function dispatchWithAudioCapture(service, dispatch, method, argument, translate) {
  const capture = service.audioCapture
  const changesScope = ['logout', 'configure', 'selectOrganization', 'login', 'loginLocal'].includes(method)
  if (method === 'voiceStart') {
    if (capture.active || capture.starting || capture.voiceActive || capture.scopeChanging)
      return {
        ok: false,
        key: 'End the audio recording or voice call first.',
        message: translate(service.config.locale, 'End the audio recording or voice call first.'),
        status: 409
      }
    // Reserve devices before awaiting the voice service to prevent a concurrent capture start.
    capture.voiceActive = true
  }
  if (changesScope) capture.scopeChanging++
  try {
    if (changesScope) await capture.stop('scope_changed')
    const result = await dispatch(service, method, argument)
    if (method === 'voiceStart' && !result.ok) capture.voiceActive = false
    if (result.ok && ['voiceEnd', 'logout', 'login', 'loginLocal', 'selectOrganization'].includes(method))
      capture.voiceActive = false
    return result
  } catch (error) {
    if (method === 'voiceStart') capture.voiceActive = false
    throw error
  } finally {
    if (changesScope) capture.scopeChanging--
  }
}
module.exports = { registerAudioCaptureIpc, dispatchWithAudioCapture }
