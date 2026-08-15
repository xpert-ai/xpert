import type { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'

import type { AiModelTypeEnum } from '../agent'

export type ModelInvocationModality = 'image' | 'video'

export type ImageGenerationOperation = 'text_to_image' | 'image_to_image' | 'multi_image_to_image'

export type VideoGenerationOperation =
  | 'text_to_video'
  | 'image_to_video'
  | 'first_last_frame_to_video'
  | 'reference_to_video'

export type ModelInvocationOperation = ImageGenerationOperation | VideoGenerationOperation

export type ModelInvocationOriginType = 'execution' | 'tool'

export type ModelInvocationProviderState =
  | 'started'
  | 'submitted'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'acceptance_unknown'

export type ModelInvocationUsageAvailability = 'pending' | 'available' | 'unknown' | 'not_applicable'

export type ModelInvocationArtifactState = 'pending' | 'ready' | 'failed' | 'not_requested'

export type ModelInvocationReconciliationState = 'ready' | 'running' | 'retry_wait' | 'blocked' | 'finished'

export type ModelInvocationPricingDimensions = {
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
  operations?: ModelInvocationOperation[]
  dimensions?: Partial<Omit<ModelInvocationPricingDimensions, 'durationSeconds'>>
  source_url?: string
}

export type ModelUsagePricingConfig = {
  type: 'usage'
  rules: ModelUsagePriceRule[]
}

export type ModelUsagePricingContext = {
  model: string
  operation: ModelInvocationOperation
  modality: ModelInvocationModality
  pricingDimensions?: ModelInvocationPricingDimensions
  startedAt?: Date | string
}

export type ModelInvocationPricingSnapshot = {
  capturedAt: string
  status: 'rules' | 'unpriced'
  rules: ModelUsagePriceRule[]
}

export type ModelInvocationRawUsage = {
  [key: string]: string | number | boolean | null
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

export type ModelInvocationStartEvent = {
  phase: 'start'
  invocationKey: string
  provider: string
  model?: string
  toolName: string
  operation: ModelInvocationOperation
  modality: ModelInvocationModality
  pricingDimensions?: ModelInvocationPricingDimensions
  pricingSnapshot?: ModelInvocationPricingSnapshot
}

export type ModelInvocationBindEvent = {
  phase: 'bind'
  invocationId: string
  providerRequestId: string
}

export type ModelInvocationObserveEvent = {
  phase: 'observe'
  invocationId?: string
  providerRequestId?: string
  state: Exclude<ModelInvocationProviderState, 'started'>
  usageAvailability: ModelInvocationUsageAvailability
  metrics?: ModelUsageMetric[]
  rawUsage?: ModelInvocationRawUsage
  errorCode?: string
  artifactState?: ModelInvocationArtifactState
  artifactErrorCode?: string
  reconciliation?: 'continue' | 'finish'
}

export type ModelInvocationArtifactEvent = {
  phase: 'artifact'
  invocationId?: string
  providerRequestId?: string
  artifactState: ModelInvocationArtifactState
  artifactErrorCode?: string
}

export type ModelInvocationEvent =
  | ModelInvocationStartEvent
  | ModelInvocationBindEvent
  | ModelInvocationObserveEvent
  | ModelInvocationArtifactEvent

export type ModelInvocationRecordResult = {
  invocationId: string
  created?: boolean
  providerRequestId?: string
  providerState?: ModelInvocationProviderState
}

export type ModelInvocationObservationRequest = {
  providerRequestId: string
  provider: string
  model?: string
  operation: ModelInvocationOperation
  pricingDimensions?: ModelInvocationPricingDimensions
}

export type ModelInvocationObservation = Omit<
  ModelInvocationObserveEvent,
  'phase' | 'invocationId' | 'providerRequestId'
>

export type ModelInvocationObserver = (
  request: ModelInvocationObservationRequest
) => Promise<ModelInvocationObservation | null>

export interface IModelInvocation extends IBasePerTenantAndOrganizationEntityModel {
  invocationKey: string
  originType: ModelInvocationOriginType
  originId: string
  originExecutionId?: string | null
  userId?: string | null
  agentKey?: string | null
  toolsetId: string
  providerScopeId: string
  copilotId: string
  provider: string
  modelType: AiModelTypeEnum
  model?: string | null
  toolName: string
  operation: ModelInvocationOperation
  modality: ModelInvocationModality
  providerRequestId?: string | null
  providerState: ModelInvocationProviderState
  usageAvailability: ModelInvocationUsageAvailability
  metrics?: ModelUsageMetric[] | null
  pricingDimensions?: ModelInvocationPricingDimensions | null
  pricingSnapshot?: ModelInvocationPricingSnapshot | null
  rawUsage?: ModelInvocationRawUsage | null
  artifactState: ModelInvocationArtifactState
  artifactErrorCode?: string | null
  reconciliationState: ModelInvocationReconciliationState
  nextReconcileAt?: Date | null
  reconcileAttempts: number
  reconciliationErrorCode?: string | null
  startedAt: Date
  completedAt?: Date | null
  lastObservedAt?: Date | null
  errorCode?: string | null
}

export type ModelUsageLedgerStatus = 'recorded'

export interface IModelUsageLedger extends IBasePerTenantAndOrganizationEntityModel {
  invocationId: string
  revision: number
  userId?: string | null
  originType: ModelInvocationOriginType
  originId: string
  originExecutionId?: string | null
  copilotId: string
  providerScopeId: string
  provider: string
  model?: string | null
  modelType: AiModelTypeEnum
  modality: ModelInvocationModality
  operation: ModelInvocationOperation
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

export interface IModelChargeLedger extends IBasePerTenantAndOrganizationEntityModel {
  usageLedgerId: string
  invocationId: string
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
  modality?: ModelInvocationModality
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

export type ModelInvocationUsageSummary = {
  videoPromptTokens: number
  videoCompletionTokens: number
  videoTokens: number
  videoGenerations: number
  generatedSeconds: number
  pendingVideoInvocations: number
  unknownVideoUsage: number
}
