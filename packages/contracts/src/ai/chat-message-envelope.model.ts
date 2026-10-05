/** Provenance is descriptive, never an execution principal or an authorization grant. */
export type TChatMessageSource =
  | { type: 'user'; userId: string }
  | { type: 'voice'; sessionId: string }
  | { type: 'assistant'; xpertId: string }
  | { type: 'agent'; xpertId: string; agentKey: string }
  | { type: 'automation'; taskId: string }

/** Presentation does not change model roles or remove input from execution/retry history. */
export type TChatMessagePresentation = 'message' | 'event' | 'runtime'

/** Host-created provenance, persisted in ChatMessage.messageEnvelope. */
export interface TChatMessageEnvelope {
  version: 1
  source: TChatMessageSource
  presentation: TChatMessagePresentation
  /** Audited destination, not routing instructions. The authorized request owns routing. */
  target?: { xpertId: string; agentKey?: string; conversationId?: string; threadId?: string }
  correlation?: { messageId?: string; executionId?: string; invocationId?: string; taskId?: string }
}

/** Persistence boundary: unknown versions stay hidden until this host understands their policy. */
export function chatMessagePresentation(message: { messageEnvelope?: unknown }): TChatMessagePresentation {
  const envelope = message.messageEnvelope
  if (envelope == null) return 'message'
  if (
    typeof envelope === 'object' &&
    !Array.isArray(envelope) &&
    'version' in envelope &&
    envelope.version === 1 &&
    'presentation' in envelope &&
    (envelope.presentation === 'message' || envelope.presentation === 'event')
  )
    return envelope.presentation
  return 'runtime'
}

export function isRuntimeChatMessage(message: { messageEnvelope?: unknown }): boolean {
  return chatMessagePresentation(message) === 'runtime'
}
