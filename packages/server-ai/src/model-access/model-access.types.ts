import {
    AiModelTypeEnum,
    I18nObject,
    IModelAccessEvent,
    IModelAccessModelSnapshot,
    IUser,
    ModelAccessActorTypeEnum,
    ModelAccessChannelEnum,
    ModelAccessClosedReasonCodeEnum,
    ModelAccessEventTypeEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessUnavailableReasonEnum,
    ModelFeature
} from '@xpert-ai/contracts'
import { MembershipModelAccess } from '../membership/membership.service'
export type ModelAccessLifecycleBatchInput = {
    requestAfterId?: string | null
    grantAfterId?: string | null
    limit?: number
}

export type ModelAccessLifecycleBatchResult = {
    requests: number
    grants: number
    nextRequestAfterId: string | null
    nextGrantAfterId: string | null
}

export type ModelTarget = {
    tenantId: string
    organizationId: string | null
    ownershipScope: ModelAccessOwnershipScopeEnum
    copilotId: string
    copilotModelId: string
    copilotName?: string | null
    provider: string
    providerLabel?: IModelAccessModelSnapshot['providerLabel']
    providerIconSmall?: I18nObject
    providerBackground?: string
    modelType: AiModelTypeEnum
    model: string
    modelLabel?: IModelAccessModelSnapshot['modelLabel']
    capabilities: ModelFeature[]
    deprecated: boolean
    enabled: boolean
    usesOrganizationCredentials: boolean
    listedForRequest?: boolean
}

export enum ModelTargetAccessMode {
    Direct = 'direct',
    Membership = 'membership',
    Blocked = 'blocked'
}

export type MembershipFeatureState = {
    organizationEnabled: boolean
    organizationPlanConfigured: boolean
    organizationModelsConfigured: boolean
    tenantEnabled: boolean
}

export type ResolveModelInput = {
    tenantId: string
    organizationId?: string | null
    userId: string
    xpertId?: string | null
    copilotId: string
    copilotModelId: string
    modelType: AiModelTypeEnum
}

export type CatalogModelAccessBatchInput = Pick<
    ResolveModelInput,
    'tenantId' | 'organizationId' | 'userId' | 'xpertId'
> & {
    models: Array<Pick<ResolveModelInput, 'copilotId' | 'copilotModelId' | 'modelType'>>
}

export type CatalogModelLabel = Pick<
    ModelTarget,
    'provider' | 'providerLabel' | 'providerIconSmall' | 'providerBackground' | 'modelLabel' | 'capabilities'
>

export type ModelAccessResolutionContext = {
    billableUserId: string
    runtimeOrganizationId: string | null
    membershipFeatureState: () => Promise<MembershipFeatureState>
    canManageProviderModels: () => Promise<boolean>
    membershipAccess: () => Promise<MembershipModelAccess | null>
    technicalUser: () => Promise<boolean>
    modelAccessFeatureEnabled: (organizationId: string | null) => Promise<boolean>
    quotaReason: (access: MembershipModelAccess | null) => Promise<ModelAccessUnavailableReasonEnum | null>
}

export type EventInput = {
    tenantId: string
    organizationId: string | null
    requestId?: string | null
    grantId?: string | null
    eventType: ModelAccessEventTypeEnum
    actor?: IUser | null
    actorType?: ModelAccessActorTypeEnum
    fromStatus?: string | null
    toStatus?: string | null
    reason?: string | null
    systemReasonCode?: ModelAccessClosedReasonCodeEnum | null
    metadata?: IModelAccessEvent['metadata']
    idempotencyKey: string
    modelSnapshot: IModelAccessModelSnapshot
    channel?: ModelAccessChannelEnum
}
