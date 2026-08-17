import type { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import type { AiModelTypeEnum } from '../agent'
import type { LLMPriceAuthority, LLMPriceBreakdownItem, ModelPriceDailyTimeWindow } from './ai-model.model'

export type ModelUsageModality = 'text' | 'audio' | 'image' | 'video'

export type ModelUsageLedgerModality = ModelUsageModality

export type ImageGenerationOperation = 'text_to_image' | 'image_to_image' | 'multi_image_to_image'

export type VideoGenerationOperation =
  | 'text_to_video'
  | 'image_to_video'
  | 'first_last_frame_to_video'
  | 'reference_to_video'

export type ModelUsageOperation = AiModelTypeEnum | ImageGenerationOperation | VideoGenerationOperation

export type ModelUsageLedgerOperation = ModelUsageOperation

export type ModelUsageOriginType = 'execution' | 'tool' | 'model'

export type ModelUsagePricingDimensions = {
  resolution?: string
  audio?: boolean
  videoInput?: boolean
  durationSeconds?: number
  mode?: string
}

export type ModelUsagePricingStatus = 'priced' | 'free' | 'unpriced'

export type ModelUsageChargeType = 'paid' | 'free'

export type ModelUsageTokenType = 'prompt' | 'completion' | 'total'

export type ModelUsageMetricComponent = 'input' | 'output' | 'request'

export type ModelUsagePriceRule = {
  id: string
  version: string
  effective_from: string
  effective_to?: string
  unit: ModelUsageMetric['unit']
  token_type?: ModelUsageTokenType
  unit_size: number
  unit_price?: number
  currency?: string
  charge_type: ModelUsageChargeType
  component?: ModelUsageMetricComponent
  operations?: ModelUsageOperation[]
  dimensions?: Partial<Omit<ModelUsagePricingDimensions, 'durationSeconds'>>
  daily_time_window?: ModelPriceDailyTimeWindow
  source_url?: string
}

export type ModelUsagePricingConfig = {
  type: 'usage'
  rules: ModelUsagePriceRule[]
}

export type ModelUsagePricingContext = {
  model: string
  operation: ModelUsageOperation
  modality: ModelUsageModality
  pricingDimensions?: ModelUsagePricingDimensions
  startedAt?: Date | string
}

export type ModelUsagePricingSnapshot = {
  capturedAt: string
  pricingDimensions?: ModelUsagePricingDimensions
  rules: ModelUsagePriceRule[]
}

export type ModelUsageMetricQualifiers = {
  /** Stable identity inside one request. Required when component and unit are not unique. */
  key?: string
  component?: ModelUsageMetricComponent
  pricingDimensions?: ModelUsagePricingDimensions
}

export type ModelUsageMetric = ModelUsageMetricQualifiers &
  (
    | {
        unit: 'token'
        promptTokens?: number
        completionTokens?: number
        totalTokens?: number
        authority: 'provider'
      }
    | {
        unit: 'generation'
        quantity: number
        authority: 'provider' | 'contract'
      }
    | {
        unit: 'second'
        quantity: number
        authority: 'provider' | 'request'
      }
    | {
        unit: 'character'
        quantity: number
        authority: 'provider' | 'request'
      }
    | {
        unit: 'request'
        quantity: number
        authority: 'provider' | 'contract'
      }
  )

/** Final, authoritative usage emitted after a model request has completed. */
export type ModelUsageReport = {
  requestId: string
  model?: string
  modelType: AiModelTypeEnum
  toolName?: string
  operation: ModelUsageOperation
  modality: ModelUsageModality
  pricingDimensions?: ModelUsagePricingDimensions
  pricingSnapshot?: ModelUsagePricingSnapshot
  metrics: ModelUsageMetric[]
  recordedAt?: Date | string
}

export type ModelUsageReportResult = {
  requestId: string
  recorded: boolean
  ledgerIds: string[]
}

export interface IModelUsageLedger extends IBasePerTenantAndOrganizationEntityModel {
  requestId: string
  revision: number
  userId?: string | null
  userName?: string | null
  originType: ModelUsageOriginType
  originId: string
  originExecutionId?: string | null
  copilotId: string
  providerScopeId: string
  provider: string
  model?: string | null
  modelType: AiModelTypeEnum
  toolName?: string | null
  modality: ModelUsageLedgerModality
  operation: ModelUsageLedgerOperation
  metricKey: string
  component?: ModelUsageMetricComponent | null
  pricingDimensions?: ModelUsagePricingDimensions | null
  unit: ModelUsageMetric['unit']
  authority: ModelUsageMetric['authority']
  quantity?: number | null
  promptTokens?: number | null
  completionTokens?: number | null
  totalTokens?: number | null
  recordedAt: Date
  charge?: IModelChargeLedger | null
}

export interface IModelUsageDetails {
  requestId: string
  providerScopeId: string
  originExecutionId?: string | null
  provider: string
  model?: string | null
  modelType: AiModelTypeEnum
  toolName?: string | null
  modality: ModelUsageModality
  operation: ModelUsageOperation
  metrics: ModelUsageMetric[]
  recordedAt: Date
}

export interface IModelChargeLedger extends IBasePerTenantAndOrganizationEntityModel {
  usageLedgerId: string
  pricingStatus: ModelUsagePricingStatus
  pricingRuleId?: string | null
  pricingRuleVersion?: string | null
  unit: ModelUsageMetric['unit']
  quantity: number
  unitSize?: number | null
  unitPrice?: number | null
  currency?: string | null
  amount?: number | null
  priceAuthority?: LLMPriceAuthority | null
  pricingRule?: ModelUsagePriceRule | null
  pricingBreakdown?: LLMPriceBreakdownItem[] | null
  chargedAt: Date
  settlementCurrency?: string | null
  settlementAmount?: number | null
  exchangeRate?: number | null
}

export type ModelUsageLedgerQuery = {
  start?: string
  end?: string
  provider?: string
  model?: string
  userId?: string
  organizationId?: string
  unit?: ModelUsageMetric['unit']
  modality?: ModelUsageLedgerModality
  currency?: string
  pricingStatus?: ModelUsagePricingStatus
}

export type ModelUsageLedgerTotals = {
  modality: ModelUsageLedgerModality
  unit: ModelUsageMetric['unit']
  currency?: string | null
  pricingStatus: ModelUsagePricingStatus
  quantity: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  amount?: number | null
  settlementCurrency?: string | null
  settlementAmount?: number | null
  records: number
}
