import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IOrganization } from '../organization.model'
import { IUser } from '../user.model'
import { AiProvider } from './ai.model'
import { ICopilot, TCopilotTokenUsage } from './copilot.model'

export const USAGE_HOUR_FORMAT = 'yyyy-MM-dd HH'

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
  xpertId?: string
  /**
   * Usage hour in format 'yyyy-MM-dd HH' {@link USAGE_HOUR_FORMAT}
   */
  usageHour: string
  threadId: string
  // Associated AI Model provider
  provider?: AiProvider | string
  model?: string

  // Total tokens used historically
  tokenTotalUsed?: number
  priceTotalUsed?: number
}

export interface ICopilotUserUsageGroupKey {
  tenantId?: string
  organizationId?: string
  orgId?: string | null
  userId?: string
  provider?: AiProvider | string
  model?: string
  currency?: string | null
}

export interface ICopilotUserUsageSummary extends IBasePerTenantAndOrganizationEntityModel, TCopilotTokenUsage {
  orgId?: string | null
  org?: IOrganization
  userId?: string
  user?: IUser
  provider?: AiProvider | string
  model?: string
  currency?: string | null
  tokenTotalUsed?: number
  priceTotalUsed?: number
  groupKey: ICopilotUserUsageGroupKey
  details?: ICopilotUser[]
}

export type TCopilotUserUsageSummaryRenewInput = ICopilotUserUsageGroupKey &
  Pick<TCopilotTokenUsage, 'tokenLimit' | 'priceLimit'>
