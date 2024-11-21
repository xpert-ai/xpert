import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IXpertToolset } from './xpert-toolset.model'
import { IKnowledgebase } from './knowledgebase.model'

/**
 * @deprecated use Xpert
 * 
 * Copilot role, business role for the copilot
 */
export interface ICopilotRole extends IBasePerTenantAndOrganizationEntityModel {
  name: string
  title?: string
  titleCN?: string
  description?: string
  /**
   * 系统提示语
   */
  prompt?: string
  /**
   * 对话开场白
   */
  starters?: string[]
  active?: boolean
  avatar?: string

  toolsets?: IXpertToolset[]
  /**
   * More configuration
   */
  options?: TCopilotRoleOptions

  // Many to many relationship
  knowledgebases?: IKnowledgebase[]
}

/**
 * @deprecated use XpertRole
 */
export type TCopilotRoleOptions = {
  context?: Record<string, any>
  toolsets: {
    [id: string]: {
      [tool: string]: {
        defaultArgs: Record<string, any>
      }
    }
  }
}