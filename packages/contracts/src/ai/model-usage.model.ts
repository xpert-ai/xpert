import type { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import type { AiModelTypeEnum } from '../agent'

export type ModelUsageModality = 'image' | 'video'

export type ImageGenerationOperation = 'text_to_image' | 'image_to_image' | 'multi_image_to_image'

export type VideoGenerationOperation =
  | 'text_to_video'
  | 'image_to_video'
  | 'first_last_frame_to_video'
  | 'reference_to_video'

export type ModelUsageOperation = ImageGenerationOperation | VideoGenerationOperation

export type ModelUsageOriginType = 'execution' | 'tool'

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
  operations?: ModelUsageOperation[]
  dimensions?: Partial<Omit<ModelUsagePricingDimensions, 'durationSeconds'>>
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
  status: 'rules' | 'unpriced'
  rules: ModelUsagePriceRule[]
}

export type ModelUsageMetric =
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

export type ModelUsageLedgerStatus = 'recorded'

export interface IModelUsageLedger extends IBasePerTenantAndOrganizationEntityModel {
  requestId: string
  revision: number
  userId?: string | null
  originType: ModelUsageOriginType
  originId: string
  originExecutionId?: string | null
  copilotId: string
  providerScopeId: string
  provider: string
  model?: string | null
  modelType: AiModelTypeEnum
  toolName?: string | null
  modality: ModelUsageModality
  operation: ModelUsageOperation
  unit: ModelUsageMetric['unit']
  authority: ModelUsageMetric['authority']
  quantity?: number | null
  promptTokens?: number | null
  completionTokens?: number | null
  totalTokens?: number | null
  status: ModelUsageLedgerStatus
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
  requestId: string
  pricingStatus: ModelUsagePricingStatus
  pricingRuleId?: string | null
  pricingRuleVersion?: string | null
  unit: ModelUsageMetric['unit']
  quantity: number
  unitSize?: number | null
  unitPrice?: number | null
  currency?: string | null
  amount?: number | null
  pricingRule?: ModelUsagePriceRule | null
  chargedAt: Date
}

export type ModelUsageLedgerQuery = {
  start?: string
  end?: string
  provider?: string
  model?: string
  userId?: string
  organizationId?: string
  unit?: ModelUsageMetric['unit']
  modality?: ModelUsageModality
  currency?: string
  pricingStatus?: ModelUsagePricingStatus
}

export type ModelUsageLedgerTotals = {
  unit: ModelUsageMetric['unit']
  currency?: string | null
  pricingStatus: ModelUsagePricingStatus
  quantity: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  amount?: number | null
  records: number
}

export type ModelUsageSummary = {
  videoPromptTokens: number
  videoCompletionTokens: number
  videoTokens: number
  videoGenerations: number
  generatedSeconds: number
}
