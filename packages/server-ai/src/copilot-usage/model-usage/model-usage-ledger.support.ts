import type {
    IModelChargeLedger,
    IModelUsageDetails,
    IModelUsageLedger,
    IPagination,
    ModelUsageAccountSummary,
    ModelUsageBreakdownDimension,
    ModelUsageBreakdownSummary,
    ModelUsageLedgerQuery,
    ModelUsageLedgerTotals,
    ModelUsageLedgerModality,
    ModelUsageLedgerOperation,
    ModelUsageMetric,
    ModelUsageModality,
    ModelUsageOperation,
    ModelUsagePricingStatus,
    ModelUsagePricingSnapshot,
    ModelUsageReport,
    ModelUsageReportResult
} from '@xpert-ai/contracts'
import { AiModelTypeEnum, MembershipLedgerSourceEnum, ModelGatewayUsageChannelEnum } from '@xpert-ai/contracts'
import { calculateModelUsageCharge } from '@xpert-ai/plugin-sdk'
import { User } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { randomUUID } from 'node:crypto'
import { In, type Repository } from 'typeorm'
import { MembershipPointLedger } from '../../membership/membership-point-ledger.entity'
import { settleChargeToCny } from '../../membership/model-billing'
import { MembershipService } from '../../membership/membership.service'
import { formatInUTC0 } from '../../shared/utils'
import type {
    CopilotModelUsageRecordingScope,
    CopilotTokenUsageRecordingScope,
    CopilotTokenUsageReport
} from '../copilot-usage.types'
import { modelUsageMetricKey, normalizeModelUsageMetrics } from './model-usage.utils'

export const USAGE_HOUR_FORMAT = 'yyyy-MM-dd HH'
export const UNKNOWN_USAGE_ACCOUNT_KEY = '__unknown_account__'
export const LEGACY_USAGE_SOURCES = [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
export const LEGACY_USAGE_PREDICATE = `
    ledger.source IN (:...legacyUsageSources)
    AND COALESCE(ledger.tokenUsed, 0) > 0
    AND ledger.settlementAmount IS NULL
`

export type StoredModelUsageEntry = MembershipPointLedger & {
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

export type StoredUsageLedgerEntry = MembershipPointLedger & {
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

export type LegacyUsageLedgerEntry = MembershipPointLedger & {
    source: MembershipLedgerSourceEnum.Usage | MembershipLedgerSourceEnum.PersonalUsage
    tokenUsed: number
    provider: string
    createdAt: Date
    updatedAt: Date
}

export function modelUsageRequestKeySql() {
    return "CONCAT(COALESCE(ledger.providerScopeId, ''), ':', COALESCE(NULLIF(ledger.requestId, ''), CONCAT('legacy:', ledger.id)))"
}

export function modelUsageAccountKeySql() {
    return `COALESCE(CAST(ledger.userId AS text), '${UNKNOWN_USAGE_ACCOUNT_KEY}')`
}

export function modelUsageBreakdownKeySql(dimension: ModelUsageBreakdownDimension) {
    const providerKey = modelUsageBreakdownKeyPartSql('ledger.provider')
    if (dimension === 'provider') return providerKey
    return `CONCAT(${providerKey}, ':', ${modelUsageBreakdownKeyPartSql('ledger.model')})`
}

export function modelUsageBreakdownKeyPartSql(column: 'ledger.provider' | 'ledger.model') {
    return `CASE WHEN NULLIF(${column}, '') IS NULL THEN '-1:' ELSE CONCAT(LENGTH(${column}), ':', ${column}) END`
}

export function pricingStatusFromRank(value: string | number): ModelUsagePricingStatus {
    const rank = Number(value) || 0
    if (rank >= 2) return 'priced'
    if (rank === 1) return 'free'
    return 'unpriced'
}

export function toLedgerEntry(
    scope: CopilotModelUsageRecordingScope,
    report: ModelUsageReport & { recordedAt: Date },
    metric: ModelUsageMetric,
    pricingSnapshot: ModelUsagePricingSnapshot
): Partial<MembershipPointLedger> {
    const calculation = calculateModelUsageCharge(pricingSnapshot, metric)
    const settlement = settleChargeToCny(calculation)
    const rule = calculation.pricingRule
    const base: Partial<MembershipPointLedger> = {
        id: randomUUID(),
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        runtimeOrganizationId: scope.organizationId,
        createdById: scope.userId ?? undefined,
        actorId: scope.userId ?? undefined,
        userId: scope.userId,
        source: MembershipLedgerSourceEnum.ModelUsage,
        pointsDelta: 0,
        requestId: report.requestId,
        revision: 1,
        originType: scope.originType ?? (scope.originExecutionId ? 'execution' : 'tool'),
        originId: scope.originId ?? scope.originExecutionId ?? report.requestId,
        originExecutionId: scope.originExecutionId,
        xpertId: scope.xpertId,
        copilotId: scope.copilotId,
        providerScopeId: scope.providerScopeId,
        provider: scope.provider,
        model: report.model,
        modelType: report.modelType,
        toolName: report.toolName,
        modality: report.modality,
        operation: report.operation,
        metricKey: modelUsageMetricKey(metric),
        component: metric.component ?? null,
        pricingDimensions: metric.pricingDimensions ?? null,
        unit: metric.unit,
        authority: metric.authority,
        recordedAt: report.recordedAt,
        usageHour: formatInUTC0(report.recordedAt, USAGE_HOUR_FORMAT),
        pricingStatus: calculation.pricingStatus,
        pricingRuleId: rule?.id ?? null,
        pricingRuleVersion: rule?.version ?? null,
        priceQuantity: calculation.quantity,
        unitSize: calculation.unitSize ?? null,
        unitPrice: calculation.unitPrice ?? null,
        priceCurrency: calculation.currency ?? null,
        priceAmount: calculation.amount ?? null,
        pricingRule: rule ?? null,
        chargedAt: report.recordedAt,
        settlementCurrency: settlement?.currency ?? null,
        settlementAmount: settlement?.amount ?? null,
        exchangeRate: settlement?.exchangeRate ?? null
    }
    if (metric.unit === 'token') {
        return {
            ...base,
            tokenUsed: metric.totalTokens ?? null,
            promptTokens: metric.promptTokens ?? null,
            completionTokens: metric.completionTokens ?? null,
            totalTokens: metric.totalTokens ?? null,
            quantity: null
        }
    }
    return {
        ...base,
        quantity: metric.quantity,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null
    }
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

export function toUsageLedgerDto(entry: StoredUsageLedgerEntry): IModelUsageLedger {
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
        usageChannel: entry.usageChannel,
        executionContext: entry.executionContext,
        xpertId: entry.xpertId,
        tokenDetails: entry.tokenDetails,
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

export function toLegacyUsageLedgerDto(entry: LegacyUsageLedgerEntry): IModelUsageLedger {
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

export function toChargeDto(entry: StoredUsageLedgerEntry): IModelChargeLedger {
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

export function toMetric(usage: StoredModelUsageEntry): ModelUsageMetric {
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

export function isStoredModelUsageEntry(entry: MembershipPointLedger): entry is StoredModelUsageEntry {
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

export function isStoredUsageLedgerEntry(entry: MembershipPointLedger): entry is StoredUsageLedgerEntry {
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

export function isLegacyUsageLedgerEntry(entry: MembershipPointLedger): entry is LegacyUsageLedgerEntry {
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

export function requireText(value: string | null | undefined, label: string) {
    const normalized = value?.trim()
    if (!normalized) {
        throw new Error(
            t('server-ai:Error.ModelUsageFieldRequired', {
                field: label,
                defaultValue: "Model usage field '{{field}}' is required."
            })
        )
    }
    return normalized
}

export function normalizeTake(value?: number) {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? Math.min(Math.trunc(number), 200) : 50
}

export function normalizeText(value?: string | null) {
    const normalized = value?.trim()
    return normalized || undefined
}

export function normalizeDate(value?: Date | string) {
    if (!value) return undefined
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
}

export function normalizeTokenCount(value: number | null | undefined) {
    const normalized = Math.trunc(Number(value))
    return Number.isFinite(normalized) && normalized > 0 ? normalized : 0
}

export function normalizeOptionalTokenCount(value: number | null | undefined) {
    const normalized = normalizeTokenCount(value)
    return normalized || null
}

export function normalizePriceAmount(value: number | null | undefined) {
    if (value === null || value === undefined) return undefined
    const normalized = Number(value)
    return Number.isFinite(normalized) && normalized >= 0 ? normalized : undefined
}

export function displayUserName(user: User) {
    return (
        user.name?.trim() ||
        [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
        user.email?.trim() ||
        user.username?.trim() ||
        null
    )
}
