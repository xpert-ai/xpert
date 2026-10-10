export type AudioCaptureJson =
  | null
  | boolean
  | number
  | string
  | AudioCaptureJson[]
  | { [key: string]: AudioCaptureJson }
export type AudioCaptureTrack = 'microphone' | 'system'
export type AudioCaptureCommand =
  | 'desktop.audio.capture.start'
  | 'desktop.audio.capture.stop'
  | 'desktop.audio.capture.state'
  | 'desktop.audio.capture.retry'
export type AudioCaptureDelivery = {
  /** Invoke action on the requesting View. Must acknowledge events idempotently by eventId. */
  eventAction: string
  /** File action on that same View. Receives a WAV file and AudioCaptureChunk metadata. */
  chunkAction: string
  /** Opaque plugin context. Desktop never interprets its fields. Maximum 8 KiB JSON. */
  context?: AudioCaptureJson
}
export type AudioCaptureStartPayload = { delivery: AudioCaptureDelivery }
export type AudioCaptureSelectionPayload = { captureId?: string }
export type AudioCaptureRequest = {
  botId: string
  hostId: string
  viewKey: string
  commandKey: AudioCaptureCommand
  payload: unknown
  /** Copied from the trusted shell, never from payload. Not a substitute for authorization. */
  userActivated: boolean
}
export type AudioCaptureState = {
  supported: boolean
  status: 'idle' | 'starting' | 'recording' | 'uploading' | 'pending'
  captureId?: string
  elapsedMs: number
  microphone: number
  system: number
  pendingCount: number
  errorCode?: string | null
}
export type AudioCaptureResult = { success: true; data: AudioCaptureState } | { success: false; code: string }
export type AudioCaptureStopReason =
  | 'user'
  | 'interrupted'
  | 'device_lost'
  | 'disk_error'
  | 'scope_changed'
  | 'sleep'
  | 'quit'
  | 'limit'
export type AudioCaptureEvent = {
  version: 1
  captureId: string
  eventId: string
  context?: AudioCaptureJson
} & (
  | { event: 'created'; createdAt: number; tracks: AudioCaptureTrack[] }
  | { event: 'started'; startedAt: number }
  | {
      event: 'stopped'
      durationMs: number
      reason: AudioCaptureStopReason
      chunks: Record<AudioCaptureTrack, number>
      errorCode: string | null
    }
)
export type AudioCaptureChunk = {
  version: 1
  captureId: string
  context?: AudioCaptureJson
  track: AudioCaptureTrack
  sequence: number
  startMs: number
  endMs: number
  sha256: string
}
export const AUDIO_CAPTURE_COMMANDS: readonly AudioCaptureCommand[]
export const AUDIO_CAPTURE_TRACKS: readonly AudioCaptureTrack[]
export const AUDIO_CAPTURE_LIMITS: Readonly<{
  durationMs: number
  contextBytes: number
  chunkMs: number
  chunkBytes: number
}>
export function isAudioCaptureCommand(value: unknown): value is AudioCaptureCommand
export function parseAudioCaptureDelivery(value: unknown): AudioCaptureDelivery
export function parseAudioCapturePayload(
  commandKey: 'desktop.audio.capture.start',
  payload: unknown
): AudioCaptureStartPayload
export function parseAudioCapturePayload(
  commandKey: Exclude<AudioCaptureCommand, 'desktop.audio.capture.start'>,
  payload: unknown
): AudioCaptureSelectionPayload
