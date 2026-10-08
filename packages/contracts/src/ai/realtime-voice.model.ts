import type { TCopilotModel } from './copilot-model.model'
import type { VoiceTaskStatus } from './realtime-voice.transport'

/** Realtime is a separate model capability, not the Assistant's reasoning model. */
export interface RealtimeVoiceFeature {
  enabled: boolean
  copilotModel?: TCopilotModel
  voice?: string
}

export interface RealtimeVoiceSelection {
  modelId: string
  voice: string
}

export interface RealtimeModelMetadata {
  voices: { id: string; label: string }[]
  defaultVoice: string
  notification: 'text' | 'next-turn'
}

export interface RealtimeModelOption extends RealtimeModelMetadata {
  id: string
  label: string
  copilotModel: TCopilotModel
}

export interface RealtimeToolCall {
  id: string
  name: string
  arguments: string
}

export interface RealtimeToolResult {
  id: string
  output: string
}

/** Latest authoritative task state, separate from historical tool response messages. */
export interface RealtimeTaskContext {
  taskHandle: string
  status: VoiceTaskStatus
  result?: string
}

export interface RealtimeUsage {
  responseId: string
  inputText?: number
  inputAudio?: number
  outputText?: number
  outputAudio?: number
  cachedInputText?: number
  cachedInputAudio?: number
}

/** Server-side diagnostics only; never include provider messages, headers or request bodies. */
export interface RealtimeProviderDiagnostic {
  providerCode?: string
  providerType?: string
  eventId?: string
}

export type RealtimeModelEvent =
  | { type: 'ready' }
  | { type: 'speech.started' }
  | { type: 'transcript'; role: 'user' | 'assistant'; id: string; text: string; final: boolean }
  | { type: 'audio'; responseId: string; audio: Uint8Array }
  | { type: 'response.started'; responseId: string }
  | { type: 'response.done'; responseId: string }
  | { type: 'tools'; calls: RealtimeToolCall[] }
  | { type: 'usage'; usage: RealtimeUsage }
  | { type: 'error'; code: string; recoverable?: boolean; diagnostic?: RealtimeProviderDiagnostic }
  | { type: 'closed' }

export * from './realtime-voice.transport'
