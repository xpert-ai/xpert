import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { CopilotBaseMessage, IChatConversation } from './chat.model'

export type TSummaryJob = {
  jobId: number | string;
  status: string
  progress?: number
  memoryKey?: string
}

/**
 * 
 */
export interface IChatMessage extends IBasePerTenantAndOrganizationEntityModel, Omit<Omit<CopilotBaseMessage, 'createdAt'>, 'id'> {

  summaryJob?: TSummaryJob

  // Many to one
  /**
   * Chat conversation
   */
  conversation?: IChatConversation
  conversationId?: string | null

  executionId?: string
  
}
