import { t } from '../i18n'
import type { VoiceDiagnostic } from './runtime'

export function voiceDiagnosticMessage(code: VoiceDiagnostic | undefined) {
  switch (code) {
    case 'microphone_permission':
      return t(
        'Allow Bosi to use the microphone in System Settings → Privacy & Security, then restart the app and try again.'
      )
    case 'microphone_signing':
      return t(
        'This Bosi installation is missing its microphone signing permission. Install an updated, correctly signed version.'
      )
    case 'microphone_permission_check':
      return t('Could not verify microphone access. Restart Bosi or install the latest version and try again.')
    case 'microphone_no_signal':
      return t(
        'No microphone signal is reaching the call. Check the selected input and hardware mute; the call ends after 30 seconds without a signal.'
      )
    case 'microphone_unavailable':
      return t('The microphone is unavailable. Check your audio input and try again.')
    case 'audio_playback':
      return t('Audio playback failed. Please restart the call.')
    case 'playback_overflow':
      return t('This reply was too long to play. The call is still connected; please continue speaking.')
    case 'connection_timeout':
      return t('The voice connection timed out. Please try again.')
    case 'network':
      return t('The voice connection was interrupted. Please check your network and try again.')
    case 'protocol':
      return t('Unexpected voice data was received. Please restart the call.')
    case 'server':
      return t('The voice service returned an error. Please try again.')
    default:
      return t('Could not start the voice call. Check the voice model configuration and try again.')
  }
}
