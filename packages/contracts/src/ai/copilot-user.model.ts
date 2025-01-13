import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IOrganization } from '../organization.model'
import { IUser } from '../user.model'
import { AiProvider } from '../agent/'
import { ICopilot, TCopilotTokenUsage } from './copilot.model'

/**
 * 
 */
export interface ICopilotUser extends IBasePerTenantAndOrganizationEntityModel, TCopilotTokenUsage {
  orgId?: string
  org?: IOrganization
  copilotId?: string
  copilot?: ICopilot
  userId?: string
  user?: IUser
  // Associated AI Model provider
  provider?: AiProvider | string
  model?: string

  // Total tokens used historically
  tokenTotalUsed?: number
}
