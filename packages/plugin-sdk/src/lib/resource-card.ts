import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import type { RunnableConfig } from '@langchain/core/runnables'
import { ChatMessageEventTypeEnum, createResourceCardContent, type ConversationResourceCard } from '@xpert-ai/contracts'

export { createResourceCardContent, parseResourceCard, resourceCardId } from '@xpert-ai/contracts'
export type {
  ConversationResourceCard,
  ResourceCardOpenTarget,
  ResourceCardScalar,
  TMessageContentResourceCard
} from '@xpert-ai/contracts'

/** Call after the business mutation commits. A display failure must not retry that mutation. */
export async function emitResourceCard(card: ConversationResourceCard, config?: RunnableConfig): Promise<void> {
  await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, createResourceCardContent(card), config)
}
