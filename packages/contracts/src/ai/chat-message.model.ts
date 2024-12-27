import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { CopilotBaseMessage, IChatConversation } from './chat.model'
import { LongTermMemoryTypeEnum } from './xpert.model'

export type TSummaryJob = Record<LongTermMemoryTypeEnum, {
    jobId: number | string;
    status: string
    progress?: number
    memoryKey?: string
  }>

/**
 * 
 */
export interface IChatMessage extends IBasePerTenantAndOrganizationEntityModel, Omit<Omit<CopilotBaseMessage, 'createdAt'>, 'id'> {

  summaryJob?: TSummaryJob

  /**
   * the third-party platform's message
   */
  thirdPartyMessage?: any

  // Many to one
  /**
   * Chat conversation
   */
  conversation?: IChatConversation
  conversationId?: string | null

  executionId?: string
}
