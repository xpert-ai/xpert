import { AiModelTypeEnum } from '../agent/ai-model'
import {
  configurationFromModel,
  defaultModelConfiguration,
  discoverableModelTypes,
  modelConfigurationSchema,
  modelImportSchema,
  isConfiguredModelAvailable,
  configuredModelSource
} from './model-discovery.model'

describe('model discovery contracts', () => {
  it.each(discoverableModelTypes)('provides valid defaults for %s', (type) => {
    expect(modelConfigurationSchema.parse(defaultModelConfiguration(type)).modelType).toBe(type)
  })

  it('fills defaults from matching YAML and keeps fallback values only for missing fields', () => {
    expect(
      configurationFromModel(AiModelTypeEnum.RERANK, {
        model_type: AiModelTypeEnum.RERANK,
        model_properties: { context_size: 120000 }
      })
    ).toEqual({ modelType: 'rerank', contextSize: 120000, maxConcurrency: 1 })
    expect(
      configurationFromModel(AiModelTypeEnum.TEXT_EMBEDDING, {
        model_type: AiModelTypeEnum.TEXT_EMBEDDING,
        model_properties: { context_size: 32000, max_chunks: 64 }
      })
    ).toEqual({
      modelType: 'text-embedding',
      contextSize: 32000,
      maxConcurrency: 1,
      batchSize: 64
    })
    expect(configurationFromModel(AiModelTypeEnum.LLM)).toEqual(defaultModelConfiguration(AiModelTypeEnum.LLM))
    expect(
      configurationFromModel(AiModelTypeEnum.LLM, {
        model_type: AiModelTypeEnum.RERANK,
        model_properties: { context_size: 120000 }
      })
    ).toEqual(defaultModelConfiguration(AiModelTypeEnum.LLM))
  })

  it('rejects inconsistent output limits and invalid concurrency', () => {
    const configuration = defaultModelConfiguration(AiModelTypeEnum.LLM)
    expect(modelConfigurationSchema.safeParse({ ...configuration, maxOutputTokens: 8193 }).success).toBe(false)
    expect(modelConfigurationSchema.safeParse({ ...configuration, defaultMaxTokens: 2049 }).success).toBe(false)
    expect(modelConfigurationSchema.safeParse({ ...configuration, maxConcurrency: 0 }).success).toBe(false)
  })

  it('rejects duplicate IDs, unsupported types, and client-supplied credentials', () => {
    const model = { model: 'qwen3', configuration: defaultModelConfiguration(AiModelTypeEnum.LLM) }
    expect(modelImportSchema.safeParse({ models: [model, model] }).success).toBe(false)
    expect(
      modelImportSchema.safeParse({ models: [{ ...model, modelProperties: { app_key: 'secret' } }] }).success
    ).toBe(false)
    expect(
      modelConfigurationSchema.safeParse({ modelType: AiModelTypeEnum.IMAGE, contextSize: 8192, maxConcurrency: 1 })
        .success
    ).toBe(false)
  })
})

describe('configured model catalog policy', () => {
  const provider = {
    options: {
      modelDiscovery: { mode: 'configured' as const, syncedAt: '2026-10-13T00:00:00Z', availableModelIds: ['exact-id'] }
    }
  }
  it('allows empty sync requests', () => expect(modelImportSchema.parse({ models: [] })).toEqual({ models: [] }))
  it('preserves legacy providers and manual models but excludes unconfigured builtins', () => {
    expect(isConfiguredModelAvailable({})).toBe(true)
    expect(isConfiguredModelAvailable(provider)).toBe(false)
    expect(isConfiguredModelAvailable(provider, { modelProperties: {} })).toBe(true)
    expect(configuredModelSource({ modelProperties: {} })).toBe('manual')
  })
  it('labels edited imports as manual without losing their original account availability check', () => {
    const model = { modelProperties: { discovery_model_id: 'removed', configuration_source: 'manual' as const } }
    expect(configuredModelSource(model)).toBe('manual')
    expect(isConfiguredModelAvailable(provider, model)).toBe(false)
  })
  it('uses the immutable discovery ID, independent of renames, and makes missing imports unavailable', () => {
    expect(isConfiguredModelAvailable(provider, { modelProperties: { discovery_model_id: 'exact-id' } })).toBe(true)
    expect(isConfiguredModelAvailable(provider, { modelProperties: { discovery_model_id: 'removed' } })).toBe(false)
    expect(configuredModelSource({ modelProperties: { discovery_model_id: 'exact-id' } })).toBe('discovered')
  })
})
