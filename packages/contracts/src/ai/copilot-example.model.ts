import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { AiProvider } from './ai.model'
import { IXpert } from './xpert.model'

/**
 * Examples for copilot, which is used to few shot user question
 */
export interface ICopilotKnowledge extends IBasePerTenantAndOrganizationEntityModel {
  provider?: AiProvider | string
  /**
   * The name of xpert (copilot type)
   */
  role?: string
  command?: string
  input?: string
  output?: string

  // Has vector
  vector?: boolean

  xpert?: IXpert
  xpertId?: string
}
