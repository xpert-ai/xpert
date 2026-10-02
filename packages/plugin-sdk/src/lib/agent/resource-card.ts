import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import type { RunnableConfig } from '@langchain/core/runnables'
import { createResourceCardContent, type ConversationResourceCard } from '@xpert-ai/contracts'

export const RESOURCE_CARD_EVENT = 'xpert.resource_card'

/** Emit only after the resource is committed. The host binds the owning reply and execution. */
export async function emitResourceCard(card: ConversationResourceCard, config: RunnableConfig) {
  await dispatchCustomEvent(RESOURCE_CARD_EVENT, createResourceCardContent(card), config)
}
