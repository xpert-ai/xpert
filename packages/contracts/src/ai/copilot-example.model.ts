import { AiBusinessRole, AiProvider } from './ai.model'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'

/**
 * Examples for copilot, which is used to few shot user question
 */
export interface ICopilotKnowledge extends IBasePerTenantAndOrganizationEntityModel {
  provider?: AiProvider | string
  role?: AiBusinessRole | string
  command?: string
  input?: string
  output?: string

  // Has vector
  vector?: boolean
}
