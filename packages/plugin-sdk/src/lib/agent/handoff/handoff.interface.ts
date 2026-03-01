import { HandoffMessage, ProcessContext, ProcessorPolicy, ProcessResult } from './types'

/**
 * Handoff Processor interface.
 * - Processor focus only on message processing logic; scheduling, retries, concurrency, and cancellation are handled uniformly by Dispatcher + Queue.
 */
export interface IHandoffProcessor<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  process(message: HandoffMessage<TPayload>, ctx: ProcessContext): Promise<ProcessResult>
}

export interface HandoffProcessorMetadata {
  types: string[]
  policy: ProcessorPolicy
}

export interface ResolvedHandoffProcessor {
  type: string
  processor: IHandoffProcessor
  metadata: HandoffProcessorMetadata
}
