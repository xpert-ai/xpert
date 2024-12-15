import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IChatMessage } from './chat-message.model'
import { IChatConversation } from './chat.model'

/**
 * 
 */
export interface IChatMessageFeedback extends IBasePerTenantAndOrganizationEntityModel {

  rating: string

  content?: string

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
