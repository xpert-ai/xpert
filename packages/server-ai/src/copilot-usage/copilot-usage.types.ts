import type {
    AiModelTypeEnum,
    IModelAccessResolution,
    LLMPriceAuthority,
    LLMPriceBreakdownItem,
    ModelUsageOriginType,
    ModelUsagePricingStatus
} from '@xpert-ai/contracts'

export type CopilotModelUsageRecordingScope = {
    tenantId: string
    organizationId?: string | null
    copilotOrganizationId?: string | null
    userId?: string | null
    modelAccess?: IModelAccessResolution
    originType?: ModelUsageOriginType
    originId?: string | null
    originExecutionId?: string | null
    xpertId?: string | null
    copilotId: string
    providerScopeId: string
    provider: string
}

export type CopilotTokenUsageRecordingScope = {
    tenantId: string
    organizationId?: string | null
    copilotOrganizationId?: string | null
    userId: string
    originId?: string | null
    xpertId?: string | null
    copilotId: string
    providerScopeId: string
    provider: string
    modelAccess?: IModelAccessResolution
}

export type CopilotTokenUsageReport = {
    requestId: string
    model: string
    modelType: AiModelTypeEnum
    promptTokens?: number
    completionTokens?: number
    totalTokens: number
    priceAmount?: number | null
    priceCurrency?: string | null
    pricingStatus?: ModelUsagePricingStatus
    priceAuthority?: LLMPriceAuthority
    pricingBreakdown?: LLMPriceBreakdownItem[]
    recordedAt?: Date | string
}
