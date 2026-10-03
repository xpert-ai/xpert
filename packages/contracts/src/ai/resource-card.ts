// Keep platform imports stable while ChatKit owns the resource-card protocol.
export {
  createResourceCardContent,
  isResourceCardContent,
  parseResourceCard,
  parseResourceCardContent,
  resourceCardId,
  upsertResourceCardContent
} from '@xpert-ai/chatkit-types'
export type {
  ConversationResourceCard,
  ResourceCardOpenTarget,
  ResourceCardScalar,
  TMessageContentResourceCard
} from '@xpert-ai/chatkit-types'
