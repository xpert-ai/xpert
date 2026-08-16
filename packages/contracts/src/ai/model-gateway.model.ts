import { AiModelTypeEnum } from '../agent'
import { ModelFeature } from './ai-model.model'
import { IModelAccessRequest, IUserModelGrant, ModelAccessUnavailableReasonEnum } from './model-access.model'
import { IBasePerTenantAndOrganizationEntityModel, IBasePerTenantEntityModel } from '../base-entity.model'

export enum ModelGatewayApiKeyStatusEnum {
  Active = 'active',
  Expired = 'expired',
  Revoked = 'revoked'
}

export enum ModelGatewayApiKeyLifetimeEnum {
  Days30 = '30_days',
  Days90 = '90_days',
  Days180 = '180_days',
  Permanent = 'permanent'
}

export enum ModelGatewayCallStatusEnum {
  Started = 'started',
  SettlementPending = 'settlement_pending',
  Succeeded = 'succeeded',
  Failed = 'failed'
}

export enum ModelGatewayUsageSourceEnum {
  Provider = 'provider',
  Estimated = 'estimated',
  None = 'none'
}

export enum ModelGatewayUsageChannelEnum {
  Xpert = 'xpert',
  ExternalApi = 'external_api'
}

export const MODEL_GATEWAY_REQUESTS_PER_MINUTE_SETTING = 'modelGatewayRequestsPerMinute'
export const DEFAULT_MODEL_GATEWAY_REQUESTS_PER_MINUTE = 60
export const MIN_MODEL_GATEWAY_REQUESTS_PER_MINUTE = 1
export const MAX_MODEL_GATEWAY_REQUESTS_PER_MINUTE = 10000

export const MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS_SETTING = 'modelGatewayMaxConcurrentRequests'
export const DEFAULT_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS = 5
export const MIN_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS = 1
export const MAX_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS = 100

export const DEFAULT_MODEL_GATEWAY_BODY_RETENTION_DAYS = 7
export const MIN_MODEL_GATEWAY_BODY_RETENTION_DAYS = 1
export const MAX_MODEL_GATEWAY_BODY_RETENTION_DAYS = 3650

export const MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING = 'modelGatewayCallRetentionEnabled'
export const MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING = 'modelGatewayCallRetentionDays'
export const DEFAULT_MODEL_GATEWAY_CALL_RETENTION_DAYS = 60
export const MIN_MODEL_GATEWAY_CALL_RETENTION_DAYS = 1
export const MAX_MODEL_GATEWAY_CALL_RETENTION_DAYS = 3650

export interface IModelGatewayPublication extends IBasePerTenantAndOrganizationEntityModel {
  copilotId: string
  copilotModelId: string
  provider: string
  modelType: AiModelTypeEnum
  model: string
  externalModelId: string
  capabilities: ModelFeature[]
}

export interface IModelGatewayApiKey extends IBasePerTenantAndOrganizationEntityModel {
  userId: string
  userName?: string | null
  name: string
  prefix: string
  secret?: string
  status: ModelGatewayApiKeyStatusEnum
  validUntil?: Date | string | null
  lastUsedAt?: Date | string | null
  revokedAt?: Date | string | null
  revokedById?: string | null
  revokeReason?: string | null
}

export interface IModelGatewayApiKeyCreated extends IModelGatewayApiKey {
  secret: string
}

export interface IModelGatewaySettings extends IBasePerTenantEntityModel {
  storeBodies: boolean
  bodyRetentionDays: number
}

export interface IModelGatewayAdminSettings extends IModelGatewaySettings {
  requestsPerMinute: number
  maxConcurrentRequests: number
}

export interface IModelGatewayCall extends IBasePerTenantAndOrganizationEntityModel {
  requestId: string
  userId: string
  userName?: string | null
  apiKeyId: string
  publicationId: string
  externalModelId: string
  provider: string
  model: string
  status: ModelGatewayCallStatusEnum
  startedAt: Date | string
  completedAt?: Date | string | null
  durationMs?: number | null
  inputTokens: number
  outputTokens: number
  totalTokens: number
  priceAmount?: number | null
  priceCurrency?: string | null
  settlementAmount?: number | null
  settlementCurrency?: string | null
  exchangeRate?: number | null
  chargedPoints: number
  excessPoints: number
  usageSource: ModelGatewayUsageSourceEnum
  errorCode?: string | null
  errorMessage?: string | null
  encryptedRequest?: string | null
  encryptedResponse?: string | null
  bodyExpiresAt?: Date | string | null
}

export interface IModelGatewayCallBody {
  request: unknown | null
  response: unknown | null
  expiresAt?: Date | string | null
}

export interface IModelGatewayCatalogItem {
  id: string
  copilotId: string
  copilotModelId: string
  provider: string
  modelType: AiModelTypeEnum
  model: string
  externalModelId: string
  capabilities: ModelFeature[]
  deprecated: boolean
  allowed: boolean
  unavailableReason?: ModelAccessUnavailableReasonEnum | null
  requestable: boolean
  planIncluded: boolean
  multiplier: number
  pendingRequest?: IModelAccessRequest | null
  grant?: IUserModelGrant | null
}

export interface IModelGatewayCatalog {
  items: IModelGatewayCatalogItem[]
  eligible: boolean
  tenantFeatureEnabled: boolean
  organizationFeatureEnabled: boolean
}

export type TModelGatewayApiKeyCreateInput = {
  name: string
  lifetime?: ModelGatewayApiKeyLifetimeEnum
}

export type TModelGatewayApiKeyRevokeInput = {
  reason?: string | null
}

export type TModelGatewayExternalRequestCreateInput = {
  copilotId: string
  copilotModelId: string
  modelType: AiModelTypeEnum
  reason: string
}

export type TModelGatewaySettingsUpdateInput = {
  storeBodies: boolean
  bodyRetentionDays?: number
  requestsPerMinute: number
  maxConcurrentRequests: number
}

export interface IModelGatewayAdminQuery {
  search?: string
  status?: string
  userId?: string
  take?: number
  skip?: number
}
