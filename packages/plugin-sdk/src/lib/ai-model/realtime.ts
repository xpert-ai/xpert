import type { RealtimeModelEvent, RealtimeToolResult, RealtimeTaskContext } from '@xpert-ai/contracts'
import type { JSONSchema7 } from 'json-schema'

export interface RealtimeSessionOptions {
  voice: string
  instructions: string
  tools: { name: string; description: string; parameters: JSONSchema7 }[]
}

/** The host owns networking, credentials, backpressure and authorization. */
export interface RealtimeProtocolSink {
  send(event: object): void
  emit(event: RealtimeModelEvent): void
}

export interface RealtimeProtocol {
  start(): void
  receive(event: unknown): void
  appendAudio(audio: Uint8Array): void
  setMuted(muted: boolean): void
  cancelResponse(): void
  submitToolResults(results: RealtimeToolResult[]): void
  /** Synchronize task facts without requesting speech or emitting a user transcript. */
  updateTaskContext?(tasks: RealtimeTaskContext[]): void
  notify(text: string): boolean
  close(): void
}

/** Server-only connection descriptor. Never serialize this object to clients. */
export interface RealtimeModelConnection {
  url: string
  headers: { [header: string]: string }
  createProtocol(options: RealtimeSessionOptions, sink: RealtimeProtocolSink): RealtimeProtocol
}
