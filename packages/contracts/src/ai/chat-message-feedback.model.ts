import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IChatMessage } from './chat-message.model'
import { IChatConversation } from './chat.model'

export enum ChatMessageFeedbackRatingEnum {
  LIKE = 'like',
  DISLIKE = 'dislike'
}

export type TSummaryJob = {
  jobId: number | string;
  status: string
  progress?: number
}

/**
 * 
 */
export interface IChatMessageFeedback extends IBasePerTenantAndOrganizationEntityModel {

  rating: ChatMessageFeedbackRatingEnum

  content?: string

  summaryJob: TSummaryJob

  // Many to one
  /**
   * Chat conversation
   */
  conversation?: IChatConversation
  conversationId?: string | null
  /**
   * Chat conversation message
   */
  message?: IChatMessage
  messageId?: string | null
}
