import { z } from 'zod'
import { AiModelTypeEnum } from '../agent/ai-model'
import { AIModelEntity, ModelFeature, ModelPropertyKey, ProviderModel } from './ai-model.model'
import type { ICopilotProvider, ICopilotProviderModel } from './copilot-provider.model'

export const discoverableModelTypes = [
  AiModelTypeEnum.LLM,
  AiModelTypeEnum.TEXT_EMBEDDING,
  AiModelTypeEnum.RERANK
] as const
export type DiscoverableModelType = (typeof discoverableModelTypes)[number]

const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const common = { contextSize: positiveInteger, maxConcurrency: positiveInteger.max(1000) }

/** Saved model configuration is explicit; name heuristics are only discovery suggestions. */
export const modelConfigurationSchema = z
  .discriminatedUnion('modelType', [
    z
      .object({
        modelType: z.literal(AiModelTypeEnum.LLM),
        ...common,
        maxOutputTokens: positiveInteger,
        defaultMaxTokens: positiveInteger,
        features: z.array(z.nativeEnum(ModelFeature)).max(20)
      })
      .strict(),
    z
      .object({
        modelType: z.literal(AiModelTypeEnum.TEXT_EMBEDDING),
        ...common,
        dimensions: positiveInteger.optional(),
        batchSize: positiveInteger.max(2048)
      })
      .strict(),
    z.object({ modelType: z.literal(AiModelTypeEnum.RERANK), ...common }).strict()
  ])
  .superRefine((value, ctx) => {
    if (value.modelType === AiModelTypeEnum.LLM) {
      if (value.maxOutputTokens > value.contextSize) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['maxOutputTokens'],
          message: 'Output limit exceeds context size'
        })
      }
      if (value.defaultMaxTokens > value.maxOutputTokens) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['defaultMaxTokens'],
          message: 'Default output exceeds output limit'
        })
      }
    }
  })

export type ModelConfiguration = z.output<typeof modelConfigurationSchema>

export function defaultModelConfiguration(modelType: DiscoverableModelType): ModelConfiguration {
  const common = { contextSize: 8192, maxConcurrency: 1 }
  switch (modelType) {
    case AiModelTypeEnum.LLM:
      return { modelType, ...common, maxOutputTokens: 2048, defaultMaxTokens: 2048, features: [] }
    case AiModelTypeEnum.TEXT_EMBEDDING:
      return { modelType, ...common, batchSize: 16 }
    case AiModelTypeEnum.RERANK:
      return { modelType, ...common }
  }
}

/** Start with editable defaults and overlay the matching built-in YAML values. */
export function configurationFromModel(
  modelType: ModelConfiguration['modelType'],
  model?: Partial<AIModelEntity>
): ModelConfiguration {
  const configuration = defaultModelConfiguration(modelType)
  if (model?.model_type && model.model_type !== modelType) return configuration
  const context = model?.model_properties?.[ModelPropertyKey.CONTEXT_SIZE]
  if (typeof context === 'number' && Number.isSafeInteger(context) && context > 0) configuration.contextSize = context
  if (configuration.modelType === AiModelTypeEnum.LLM) {
    const rule = model?.parameter_rules?.find((item) => item.name === 'max_tokens')
    if (typeof rule?.max === 'number' && rule.max > 0)
      configuration.maxOutputTokens = Math.min(rule.max, configuration.contextSize)
    if (typeof rule?.default === 'number' && rule.default > 0) configuration.defaultMaxTokens = rule.default
    configuration.maxOutputTokens = Math.min(configuration.maxOutputTokens, configuration.contextSize)
    configuration.defaultMaxTokens = Math.min(configuration.defaultMaxTokens, configuration.maxOutputTokens)
    configuration.features = [...(model?.features ?? [])]
  }
  if (configuration.modelType === AiModelTypeEnum.TEXT_EMBEDDING) {
    const batchSize = model?.model_properties?.[ModelPropertyKey.MAX_CHUNKS]
    const dimensions = model?.parameter_rules?.find((item) => item.name === 'dimensions')?.default
    if (typeof batchSize === 'number' && Number.isSafeInteger(batchSize) && batchSize > 0 && batchSize <= 2048) {
      configuration.batchSize = batchSize
    }
    if (typeof dimensions === 'number' && Number.isSafeInteger(dimensions) && dimensions > 0) {
      configuration.dimensions = dimensions
    }
  }
  return configuration
}

export function isDiscoverableModelType(value: unknown): value is DiscoverableModelType {
  return value === AiModelTypeEnum.LLM || value === AiModelTypeEnum.TEXT_EMBEDDING || value === AiModelTypeEnum.RERANK
}

/** Parse the persisted JSON field once when entering the model configuration boundary. */
export function readModelConfiguration(
  properties?: { model_configuration?: unknown } | null
): ModelConfiguration | undefined {
  const value = properties?.model_configuration
  if (value == null) return undefined
  return modelConfigurationSchema.parse(value)
}

export interface DiscoveredModel {
  /** Exact ID returned by the upstream discovery endpoint. */
  model: string
  label: string
  modelType: DiscoverableModelType | null
  typeSource: 'provider' | 'catalog' | 'name' | 'unknown'
  configuration?: ModelConfiguration
  /** Adapter-owned, non-secret settings such as an exact endpoint model ID or rerank path. */
  modelProperties?: Record<string, string | number | boolean>
}

/** Last successful, explicitly saved account catalog; failed previews never change it. */
export interface ModelDiscoveryState {
  mode: 'configured'
  syncedAt: string
  availableModelIds: string[]
}

export type ProviderModelSource = 'builtin' | 'discovered' | 'manual'

export function configuredModelSource(
  model: Pick<ICopilotProviderModel, 'modelProperties'>
): Exclude<ProviderModelSource, 'builtin'> {
  return (
    model.modelProperties?.configuration_source ?? (model.modelProperties?.discovery_model_id ? 'discovered' : 'manual')
  )
}

export function usesConfiguredModelCatalog(provider: Pick<ICopilotProvider, 'options'>): boolean {
  return provider.options?.modelDiscovery?.mode === 'configured'
}

/** Shared by management UI, pickers and execution authorization. Manual additions remain explicit opt-ins. */
export function isConfiguredModelAvailable(
  provider: Pick<ICopilotProvider, 'options'>,
  model?: Pick<ICopilotProviderModel, 'modelProperties'> | null
): boolean {
  if (!usesConfiguredModelCatalog(provider)) return true
  if (!model) return false
  const sourceId = model.modelProperties?.discovery_model_id
  return !sourceId || provider.options.modelDiscovery.availableModelIds.includes(sourceId)
}

export interface ModelDiscoveryItem extends DiscoveredModel {
  configured: boolean
  configuredModelId?: string
  source: Exclude<ProviderModelSource, 'builtin'>
  available: boolean
}

export interface ModelDiscoveryResult {
  models: ModelDiscoveryItem[]
}

export interface ProviderModelCatalog {
  custom: ICopilotProviderModel[]
  /** Reference metadata, not proof of account access. */
  builtin: Array<ProviderModel & Partial<Pick<AIModelEntity, 'parameter_rules'>>>
  discoverySupported: boolean
  modelDiscovery?: ModelDiscoveryState
}

export const modelImportSchema = z
  .object({
    models: z
      .array(
        z
          .object({
            model: z.string().trim().min(1).max(512),
            configuration: modelConfigurationSchema
          })
          .strict()
      )
      .max(1000)
  })
  .strict()
  .refine((value) => new Set(value.models.map((model) => model.model)).size === value.models.length, {
    message: 'Duplicate model IDs'
  })
export type ModelImportInput = z.output<typeof modelImportSchema>
export interface ModelImportResult {
  added: number
  skipped: number
}
