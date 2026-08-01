import { AiModelTypeEnum } from '../agent'
import { IBasePerTenantAndOrganizationEntityModel, IBasePerTenantEntityModel } from '../base-entity.model'
import { I18nObject } from '../types'

export enum ModelAccessRequestStatusEnum {
  Requested = 'requested',
  Approved = 'approved',
  Rejected = 'rejected',
  Withdrawn = 'withdrawn',
  Closed = 'closed'
}

export enum UserModelGrantStatusEnum {
  Active = 'active',
  Expired = 'expired',
  Revoked = 'revoked'
}

export enum ModelAccessOwnershipScopeEnum {
  Tenant = 'tenant',
  Organization = 'organization'
}

export enum ModelAccessChannelEnum {
  Xpert = 'xpert',
  ExternalApi = 'external_api'
}

export enum ModelAccessSourceEnum {
  Direct = 'direct',
  Plan = 'plan',
  Grant = 'grant'
}

export enum ModelAccessUnavailableReasonEnum {
  FeatureDisabled = 'feature_disabled',
  ModelDisabled = 'model_disabled',
  ModelDeleted = 'model_deleted',
  GrantExpired = 'grant_expired',
  GrantRevoked = 'grant_revoked',
  QuotaExhausted = 'quota_exhausted',
  MembershipRequired = 'membership_required',
  TechnicalUser = 'technical_user',
  ExternalApiIneligible = 'external_api_ineligible'
}

export enum ModelAccessClosedReasonCodeEnum {
  PlanIncluded = 'plan_included',
  ModelDeleted = 'model_deleted',
  UserLeftOrganization = 'user_left_organization',
  Other = 'other'
}

export enum ModelAccessEventTypeEnum {
  Requested = 'requested',
  Withdrawn = 'withdrawn',
  Approved = 'approved',
  Rejected = 'rejected',
  Extended = 'extended',
  Revoked = 'revoked',
  GrantActivated = 'grant_activated',
  GrantExpired = 'grant_expired',
  SystemClosed = 'system_closed',
  ModelSuspended = 'model_suspended',
  ModelRestored = 'model_restored',
  ModelDeleted = 'model_deleted',
  UserLeftOrganization = 'user_left_organization'
}

export enum ModelAccessActorTypeEnum {
  User = 'user',
  System = 'system'
}

export interface IModelAccessModelSnapshot {
  copilotId: string
  copilotName?: string | null
  copilotOrganizationId?: string | null
  provider: string
  providerLabel?: I18nObject | null
  modelType: AiModelTypeEnum
  model: string
  modelLabel?: I18nObject | null
  externalModelId?: string | null
  capturedAt: Date | string
}

export interface IModelAccessRequest extends IBasePerTenantAndOrganizationEntityModel {
  channel: ModelAccessChannelEnum
  requesterId: string
  requesterName?: string | null
  requestedFromOrganizationId?: string | null
  copilotId: string
  copilotModelId: string
  provider: string
  modelType: AiModelTypeEnum
  model: string
  ownershipScope: ModelAccessOwnershipScopeEnum
  reason: string
  status: ModelAccessRequestStatusEnum
  decidedById?: string | null
  decidedByName?: string | null
  decisionReason?: string | null
  decidedAt?: Date | string | null
  requestedValidUntil?: Date | string | null
  closedReasonCode?: ModelAccessClosedReasonCodeEnum | null
  gatewayPublicationId?: string | null
  externalModelId?: string | null
  modelSnapshot: IModelAccessModelSnapshot
  events?: IModelAccessEvent[]
}

export interface IUserModelGrant extends IBasePerTenantAndOrganizationEntityModel {
  channel: ModelAccessChannelEnum
  userId: string
  userName?: string | null
  requestId: string
  copilotId: string
  copilotModelId: string
  provider: string
  modelType: AiModelTypeEnum
  model: string
  ownershipScope: ModelAccessOwnershipScopeEnum
  status: UserModelGrantStatusEnum
  validUntil?: Date | string | null
  approvedAt: Date | string
  approvedById?: string | null
  approvedByName?: string | null
  revokedAt?: Date | string | null
  revokedById?: string | null
  revokedByName?: string | null
  revokeReason?: string | null
  lastUnavailableReason?: ModelAccessUnavailableReasonEnum | null
  gatewayPublicationId?: string | null
  externalModelId?: string | null
  modelSnapshot: IModelAccessModelSnapshot
  events?: IModelAccessEvent[]
}

export interface IModelAccessEvent extends IBasePerTenantEntityModel {
  channel: ModelAccessChannelEnum
  organizationId?: string | null
  requestedFromOrganizationId?: string | null
  requestId?: string | null
  grantId?: string | null
  eventType: ModelAccessEventTypeEnum
  actorId?: string | null
  actorName?: string | null
  actorType: ModelAccessActorTypeEnum
  actorScope: ModelAccessOwnershipScopeEnum
  fromStatus?: string | null
  toStatus?: string | null
  reason?: string | null
  systemReasonCode?: ModelAccessClosedReasonCodeEnum | null
  metadata?: Record<string, unknown> | null
  idempotencyKey: string
  modelSnapshot: IModelAccessModelSnapshot
}

export interface IModelAccessCatalogItem {
  key: string
  channel: ModelAccessChannelEnum
  copilotId: string
  copilotModelId: string
  copilotName?: string | null
  provider: string
  providerLabel?: I18nObject | null
  modelType: AiModelTypeEnum
  model: string
  modelLabel?: I18nObject | null
  ownershipScope: ModelAccessOwnershipScopeEnum
  organizationId?: string | null
  gatewayPublicationId?: string | null
  externalModelId?: string | null
  accessSource?: ModelAccessSourceEnum | null
  grantId?: string | null
  planIncluded: boolean
  allowed: boolean
  requestable: boolean
  unavailableReason?: ModelAccessUnavailableReasonEnum | null
  pendingRequest?: IModelAccessRequest | null
  grant?: IUserModelGrant | null
}

export interface IModelAccessCatalog {
  items: IModelAccessCatalogItem[]
  canRequest: boolean
  requestBlockedReason?: ModelAccessUnavailableReasonEnum | 'manager' | null
  tenantFeatureEnabled: boolean
  organizationFeatureEnabled: boolean
}

export interface IModelAccessResolution {
  allowed: boolean
  channel: ModelAccessChannelEnum
  billableUserId: string
  copilotId: string
  copilotModelId: string
  provider?: string | null
  modelType: AiModelTypeEnum
  model?: string | null
  accessSource?: ModelAccessSourceEnum | null
  planId?: string | null
  grantId?: string | null
  multiplier: number
  scope: ModelAccessOwnershipScopeEnum
  organizationId?: string | null
  gatewayPublicationId?: string | null
  externalModelId?: string | null
  unavailableReason?: ModelAccessUnavailableReasonEnum | null
}

export type TModelAccessRequestCreateInput = {
  copilotId: string
  copilotModelId: string
  modelType: AiModelTypeEnum
  reason: string
  channel?: ModelAccessChannelEnum
  gatewayPublicationId?: string
}

export type TModelAccessRequestWithdrawInput = {
  reason?: string | null
}

export type TModelAccessRequestApproveInput = {
  validUntil?: string | null
  note?: string | null
}

export type TModelAccessRequestRejectInput = {
  reason: string
}

export type TUserModelGrantExtendInput = {
  validUntil: string | null
  note?: string | null
}

export type TUserModelGrantRevokeInput = {
  reason: string
}

export interface IModelAccessAdminQuery {
  channel?: ModelAccessChannelEnum
  search?: string
  modelType?: AiModelTypeEnum
  status?: ModelAccessRequestStatusEnum | UserModelGrantStatusEnum
  expiresBefore?: string
  take?: number
  skip?: number
}
