import { IChatMessage, TChatRequest } from '@xpert-ai/contracts'

/** Capture the failed turn before installing the new response placeholder. */
export function preparePreviewRetry(
  messages: Array<Pick<IChatMessage, 'id' | 'role'>>,
  options: {
    conversationId: string
    environmentId?: string | null
    messageId?: string
    checkpointId?: string
    placeholderId: string
  }
): { request: Extract<TChatRequest, { action: 'retry' }>; message: Partial<IChatMessage> } {
  return {
    request: {
      action: 'retry',
      conversationId: options.conversationId,
      environmentId: options.environmentId,
      ...(options.checkpointId ? { checkpointId: options.checkpointId } : {}),
      source: { aiMessageId: options.messageId ?? [...messages].reverse().find((message) => message.role === 'ai')?.id }
    },
    message: { id: options.placeholderId, role: 'ai', content: '', status: 'thinking' }
  }
}
