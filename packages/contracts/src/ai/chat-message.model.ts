import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { CopilotBaseMessage, IChatConversation } from './chat.model'

/**
 * 
 */
export interface IChatMessage extends IBasePerTenantAndOrganizationEntityModel, Omit<Omit<CopilotBaseMessage, 'createdAt'>, 'id'> {

  // Many to one
  /**
   * Chat conversation
   */
  conversation?: IChatConversation
  conversationId?: string | null

  executionId?: string
}
