import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IOrganization } from '../organization.model'
import { IUser } from '../user.model'
import { AiProvider } from './ai.model'
import { ICopilotUser } from './copilot-user.model'

export type TCopilotUsageDimension = 'user' | 'organization' | 'model'

export type TCopilotQuotaAdjustmentMode = 'set' | 'increase'

export interface ICopilotUsageGroupKey {
  dimension: TCopilotUsageDimension
  tenantId?: string
  organizationId?: string | null
  orgId?: string | null
  userId?: string | null
  provider?: AiProvider | string | null
  model?: string | null
  currency?: string | null
}

export interface ICopilotUsageSummary extends IBasePerTenantAndOrganizationEntityModel {
  dimension: TCopilotUsageDimension
  groupKey: ICopilotUsageGroupKey
  userId?: string | null
  user?: IUser
  organization?: IOrganization
  orgId?: string | null
  org?: IOrganization
  provider?: AiProvider | string | null
  model?: string | null
  currency?: string | null
  tokenUsed: number
  tokenLimit?: number | null
  tokenTotalUsed: number
  tokenGrandTotal: number
  priceUsed: number
  priceLimit?: number | null
  priceTotalUsed: number
  priceGrandTotal: number
  userCount?: number
  runtimeUserCount?: number
  xpertCount?: number
  organizationCount?: number
  detailCount?: number
  updatedAt?: Date
  details?: ICopilotUser[]
}

export interface ICopilotUsageTotals {
  currency?: string | null
  tokenUsed: number
  tokenTotalUsed: number
  tokenGrandTotal: number
  priceUsed: number
  priceTotalUsed: number
  priceGrandTotal: number
}

export interface ICopilotUsageQuery {
  dimension?: TCopilotUsageDimension
  start?: string
  end?: string
  provider?: string
  model?: string
  userId?: string
  organizationId?: string
  currency?: string
}

export type TCopilotQuotaAdjustInput = {
  dimension: Extract<TCopilotUsageDimension, 'user' | 'organization'>
  groupKey: ICopilotUsageGroupKey
  mode?: TCopilotQuotaAdjustmentMode
  tokenLimit?: number | null
  priceLimit?: number | null
}

export type TCopilotQuotaRenewInput = {
  dimension: Extract<TCopilotUsageDimension, 'user' | 'organization'>
  groupKey: ICopilotUsageGroupKey
  tokenLimit?: number | null
  priceLimit?: number | null
}
