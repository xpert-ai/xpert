import type {
    IModelChargeLedger,
    IModelUsageDetails,
    IModelUsageLedger,
    ModelUsageLedgerModality,
    ModelUsageLedgerOperation,
    ModelUsageMetric,
    ModelUsageModality,
    ModelUsageOperation
} from '@xpert-ai/contracts'
import { AiModelTypeEnum, MembershipLedgerSourceEnum } from '@xpert-ai/contracts'
import { MembershipPointLedger } from '../../membership/membership-point-ledger.entity'

type StoredModelUsageEntry = MembershipPointLedger & {
    requestId: string
    revision: number
    originType: NonNullable<MembershipPointLedger['originType']>
    originId: string
    copilotId: string
    providerScopeId: string
    provider: string
    modelType: NonNullable<MembershipPointLedger['modelType']>
    modality: ModelUsageModality
    operation: ModelUsageOperation
    unit: NonNullable<MembershipPointLedger['unit']>
    authority: NonNullable<MembershipPointLedger['authority']>
    recordedAt: Date
    pricingStatus: NonNullable<MembershipPointLedger['pricingStatus']>
    priceQuantity: number
    chargedAt: Date
}

type StoredUsageLedgerEntry = MembershipPointLedger & {
    requestId: string
    revision: number
    originType: NonNullable<MembershipPointLedger['originType']>
    originId: string
    copilotId: string
    providerScopeId: string
    provider: string
    modelType: NonNullable<MembershipPointLedger['modelType']>
    modality: ModelUsageLedgerModality
    operation: ModelUsageLedgerOperation
    unit: NonNullable<MembershipPointLedger['unit']>
    authority: NonNullable<MembershipPointLedger['authority']>
    recordedAt: Date
    pricingStatus: NonNullable<MembershipPointLedger['pricingStatus']>
    priceQuantity: number
    chargedAt: Date
}

type LegacyUsageLedgerEntry = MembershipPointLedger & {
    source: MembershipLedgerSourceEnum.Usage | MembershipLedgerSourceEnum.PersonalUsage
    tokenUsed: number
    provider: string
    createdAt: Date
    updatedAt: Date
}

export function toUsageDetails(entries: MembershipPointLedger[]): IModelUsageDetails[] {
    const grouped = new Map<string, StoredModelUsageEntry[]>()
    for (const entry of entries) {
        if (!isStoredModelUsageEntry(entry)) continue
        const key = `${entry.providerScopeId}:${entry.requestId}`
        const group = grouped.get(key) ?? []
        group.push(entry)
        grouped.set(key, group)
    }
    return [...grouped.values()].map((rows) => {
        const first = rows[0]
        return {
            requestId: first.requestId,
            providerScopeId: first.providerScopeId,
            originExecutionId: first.originExecutionId,
            provider: first.provider,
            model: first.model,
            modelType: first.modelType,
            toolName: first.toolName,
            modality: first.modality,
            operation: first.operation,
            metrics: rows.map(toMetric),
            recordedAt: first.recordedAt
        }
    })
}

function toUsageLedgerDto(entry: StoredUsageLedgerEntry): IModelUsageLedger {
    return {
        id: entry.id,
        tenantId: entry.tenantId,
        organizationId: entry.organizationId,
        createdById: entry.createdById,
        updatedById: entry.updatedById,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        requestId: entry.requestId,
        revision: entry.revision,
        userId: entry.userId,
        originType: entry.originType,
        originId: entry.originId,
        originExecutionId: entry.originExecutionId,
        copilotId: entry.copilotId,
        providerScopeId: entry.providerScopeId,
        provider: entry.provider,
        model: entry.model,
        modelType: entry.modelType,
        toolName: entry.toolName,
        modality: entry.modality,
        operation: entry.operation,
        metricKey: entry.metricKey ?? (entry.component ? `${entry.component}:${entry.unit}` : entry.unit),
        component: entry.component,
        pricingDimensions: entry.pricingDimensions,
        unit: entry.unit,
        authority: entry.authority,
        quantity: entry.quantity,
        promptTokens: entry.promptTokens,
        completionTokens: entry.completionTokens,
        totalTokens: entry.totalTokens,
        recordedAt: entry.recordedAt,
        charge: toChargeDto(entry)
    }
}

export function toUsageLedgerItem(entry: MembershipPointLedger): IModelUsageLedger | null {
    if (isStoredUsageLedgerEntry(entry)) {
        return toUsageLedgerDto(entry)
    }
    if (isLegacyUsageLedgerEntry(entry)) {
        return toLegacyUsageLedgerDto(entry)
    }
    return null
}

function toLegacyUsageLedgerDto(entry: LegacyUsageLedgerEntry): IModelUsageLedger {
    const recordedAt = entry.createdAt
    return {
        id: entry.id,
        tenantId: entry.tenantId,
        organizationId: entry.organizationId,
        createdById: entry.createdById,
        updatedById: entry.updatedById,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        requestId: `legacy:${entry.id}`,
        revision: 0,
        userId: entry.userId,
        originType: 'model',
        originId: entry.threadId ?? entry.xpertId ?? entry.copilotId ?? entry.id,
        originExecutionId: null,
        copilotId: entry.copilotId ?? 'legacy',
        providerScopeId: `legacy:${entry.provider}`,
        provider: entry.provider,
        model: entry.model,
        modelType: AiModelTypeEnum.LLM,
        toolName: null,
        modality: 'text',
        operation: AiModelTypeEnum.LLM,
        metricKey: 'token',
        component: null,
        pricingDimensions: null,
        unit: 'token',
        authority: 'provider',
        quantity: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: entry.tokenUsed,
        recordedAt,
        charge: {
            id: entry.id,
            tenantId: entry.tenantId,
            organizationId: entry.organizationId,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
            usageLedgerId: entry.id,
            pricingStatus: 'unpriced',
            pricingRuleId: null,
            pricingRuleVersion: null,
            unit: 'token',
            quantity: entry.tokenUsed,
            unitSize: null,
            unitPrice: null,
            currency: null,
            amount: null,
            pricingRule: null,
            chargedAt: recordedAt,
            settlementCurrency: null,
            settlementAmount: null,
            exchangeRate: null
        }
    }
}

function toChargeDto(entry: StoredUsageLedgerEntry): IModelChargeLedger {
    return {
        id: entry.id,
        tenantId: entry.tenantId,
        organizationId: entry.organizationId,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        usageLedgerId: entry.id,
        pricingStatus: entry.pricingStatus,
        pricingRuleId: entry.pricingRuleId,
        pricingRuleVersion: entry.pricingRuleVersion,
        unit: entry.unit,
        quantity: entry.priceQuantity,
        unitSize: entry.unitSize,
        unitPrice: entry.unitPrice,
        currency: entry.priceCurrency,
        amount: entry.priceAmount,
        priceAuthority: entry.priceAuthority,
        pricingRule: entry.pricingRule,
        pricingBreakdown: entry.pricingBreakdown,
        chargedAt: entry.chargedAt,
        settlementCurrency: entry.settlementCurrency,
        settlementAmount: entry.settlementAmount,
        exchangeRate: entry.exchangeRate
    }
}

function toMetric(usage: StoredModelUsageEntry): ModelUsageMetric {
    const qualifiers = {
        key: usage.metricKey ?? (usage.component ? `${usage.component}:${usage.unit}` : usage.unit),
        ...(usage.component ? { component: usage.component } : {}),
        ...(usage.pricingDimensions ? { pricingDimensions: usage.pricingDimensions } : {})
    }
    if (usage.unit === 'token') {
        return {
            ...qualifiers,
            unit: 'token',
            promptTokens: usage.promptTokens ?? undefined,
            completionTokens: usage.completionTokens ?? undefined,
            totalTokens: usage.totalTokens ?? undefined,
            authority: 'provider'
        }
    }
    if (usage.unit === 'generation') {
        return {
            ...qualifiers,
            unit: 'generation',
            quantity: usage.quantity ?? 0,
            authority: usage.authority === 'contract' ? 'contract' : 'provider'
        }
    }
    if (usage.unit === 'second' || usage.unit === 'character') {
        return {
            ...qualifiers,
            unit: usage.unit,
            quantity: usage.quantity ?? 0,
            authority: usage.authority === 'request' ? 'request' : 'provider'
        }
    }
    return {
        ...qualifiers,
        unit: 'request',
        quantity: usage.quantity ?? 0,
        authority: usage.authority === 'contract' ? 'contract' : 'provider'
    }
}

function isStoredModelUsageEntry(entry: MembershipPointLedger): entry is StoredModelUsageEntry {
    return (
        typeof entry.requestId === 'string' &&
        typeof entry.revision === 'number' &&
        (entry.originType === 'execution' || entry.originType === 'tool') &&
        typeof entry.originId === 'string' &&
        typeof entry.copilotId === 'string' &&
        typeof entry.providerScopeId === 'string' &&
        typeof entry.provider === 'string' &&
        entry.modelType !== null &&
        entry.modelType !== undefined &&
        (entry.modality === 'text' ||
            entry.modality === 'audio' ||
            entry.modality === 'image' ||
            entry.modality === 'video') &&
        typeof entry.operation === 'string' &&
        (entry.unit === 'token' ||
            entry.unit === 'generation' ||
            entry.unit === 'second' ||
            entry.unit === 'character' ||
            entry.unit === 'request') &&
        typeof entry.authority === 'string' &&
        entry.recordedAt instanceof Date &&
        (entry.pricingStatus === 'priced' || entry.pricingStatus === 'free' || entry.pricingStatus === 'unpriced') &&
        typeof entry.priceQuantity === 'number' &&
        entry.chargedAt instanceof Date
    )
}

function isStoredUsageLedgerEntry(entry: MembershipPointLedger): entry is StoredUsageLedgerEntry {
    return (
        typeof entry.requestId === 'string' &&
        typeof entry.revision === 'number' &&
        (entry.originType === 'execution' || entry.originType === 'tool' || entry.originType === 'model') &&
        typeof entry.originId === 'string' &&
        typeof entry.copilotId === 'string' &&
        typeof entry.providerScopeId === 'string' &&
        typeof entry.provider === 'string' &&
        entry.modelType !== null &&
        entry.modelType !== undefined &&
        (entry.modality === 'text' ||
            entry.modality === 'audio' ||
            entry.modality === 'image' ||
            entry.modality === 'video') &&
        typeof entry.operation === 'string' &&
        (entry.unit === 'token' ||
            entry.unit === 'generation' ||
            entry.unit === 'second' ||
            entry.unit === 'character' ||
            entry.unit === 'request') &&
        typeof entry.authority === 'string' &&
        entry.recordedAt instanceof Date &&
        (entry.pricingStatus === 'priced' || entry.pricingStatus === 'free' || entry.pricingStatus === 'unpriced') &&
        typeof entry.priceQuantity === 'number' &&
        entry.chargedAt instanceof Date
    )
}

function isLegacyUsageLedgerEntry(entry: MembershipPointLedger): entry is LegacyUsageLedgerEntry {
    return (
        (entry.source === MembershipLedgerSourceEnum.Usage ||
            entry.source === MembershipLedgerSourceEnum.PersonalUsage) &&
        typeof entry.tokenUsed === 'number' &&
        entry.tokenUsed > 0 &&
        (entry.settlementAmount === null || entry.settlementAmount === undefined) &&
        typeof entry.provider === 'string' &&
        entry.createdAt instanceof Date &&
        entry.updatedAt instanceof Date
    )
}
