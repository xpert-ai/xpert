import { t } from '../i18n'
import type { VoiceDiagnostic } from './runtime'

export function voiceDiagnosticMessage(code: VoiceDiagnostic | undefined) {
  switch (code) {
    case 'microphone_permission':
      return t('Microphone access was denied. Allow access and try again.')
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
