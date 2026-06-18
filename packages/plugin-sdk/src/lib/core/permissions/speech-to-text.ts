export type SpeechToTextPermissionOperation = 'transcribe'

/**
 * Speech-to-text Permission
 * Example: { type: 'speech_to_text', operations: ['transcribe'] }
 */
export interface SpeechToTextPermission {
  type: 'speech_to_text'
  operations?: SpeechToTextPermissionOperation[]
  scope?: string[]
  description?: string
}

/**
 * System token for resolving speech-to-text service from plugin context.
 */
export const SPEECH_TO_TEXT_PERMISSION_SERVICE_TOKEN = 'XPERT_PLUGIN_SPEECH_TO_TEXT_PERMISSION_SERVICE'

/**
 * Internal system token used by core to expose the speech-to-text bridge.
 */
export const SPEECH_TO_TEXT_SERVICE_TOKEN = 'XPERT_SPEECH_TO_TEXT_SERVICE'

export interface SpeechToTextTranscribeFileInput {
  data: Uint8Array
  originalName: string
  mimeType?: string
  size?: number
}

export interface SpeechToTextTranscribeInput {
  xpertId: string
  isDraft?: boolean
  tenantId?: string | null
  organizationId?: string | null
  file: SpeechToTextTranscribeFileInput
}

export interface SpeechToTextTranscribeResult {
  text: string
}

/**
 * Speech-to-text service exposed to plugins under permission control.
 */
export interface SpeechToTextPermissionService {
  transcribe(input: SpeechToTextTranscribeInput): Promise<SpeechToTextTranscribeResult>
}
