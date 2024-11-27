import { AiProvider } from './ai.model'
import { IBasePerTenantEntityModel } from '../base-entity.model'
import { IOrganization } from '../organization.model'
import { ICopilot, TCopilotTokenUsage } from './copilot.model'

/**
 * Organization token usage of global copilot
 */
export interface ICopilotOrganization extends IBasePerTenantEntityModel, TCopilotTokenUsage {
  organizationId?: string
  organization?: IOrganization
  copilotId?: string
  copilot?: ICopilot
  // Associated AI Model provider
  provider?: AiProvider | string

  // Total tokens used historically
  tokenTotalUsed?: number
}
