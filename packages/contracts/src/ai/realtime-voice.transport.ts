export type VoiceTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled' | 'waiting' | 'unknown'
export type { CallEndedContent, CompletedVoiceCall } from '@xpert-ai/chatkit-types'

export interface VoiceSessionTicket {
  sessionId: string
  conversationId: string
  ticket: string
  path: string
  inputSampleRate: 16000
  outputSampleRate: 24000
  expiresAt: string
}

export type VoiceClientControl =
  | { type: 'mute'; muted: boolean }
  | { type: 'interrupt' }
  | { type: 'end' }
  | { type: 'ping' }
  | { type: 'playback.done'; responseId: string }

/** Raw audio travels in bounded binary frames; supplier events are never forwarded. */
export type VoiceServerControl =
  | { type: 'ready'; sessionId: string }
  | { type: 'clear_audio' }
  | { type: 'response.started' | 'response.done'; responseId: string }
  | { type: 'transcript'; role: 'user' | 'assistant'; id: string; text: string; final: boolean }
  | { type: 'task'; action: 'send' | 'steer'; taskId: string; status: VoiceTaskStatus; text?: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'ended' }
  | { type: 'pong' }
