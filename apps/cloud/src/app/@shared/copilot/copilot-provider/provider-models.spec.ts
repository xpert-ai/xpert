import {
  AiModelTypeEnum,
  FetchFrom,
  ICopilotProviderModel,
  ProviderModel,
  ProviderModelCatalog
} from '@xpert-ai/contracts'
import { providerModelRows } from './provider-models'

describe('unified provider model list', () => {
  const builtin: ProviderModel = {
    model: 'shared',
    label: {},
    model_type: AiModelTypeEnum.LLM,
    fetch_from: FetchFrom.PREDEFINED_MODEL,
    model_properties: { context_size: 8192 }
  }
  const imported: ICopilotProviderModel = {
    id: 'imported',
    modelName: 'shared',
    modelType: AiModelTypeEnum.LLM,
    modelProperties: { discovery_model_id: 'shared', context_size: 32000 }
  }
  const manual: ICopilotProviderModel = {
    ...imported,
    id: 'manual',
    modelProperties: { ...imported.modelProperties, configuration_source: 'manual', context_size: 64000 }
  }
  const catalog: ProviderModelCatalog = {
    discoverySupported: true,
    builtin: [builtin],
    custom: [imported],
    modelDiscovery: { mode: 'configured', syncedAt: '2026-10-13T00:00:00Z', availableModelIds: ['shared'] }
  }

  it('includes built-ins and API models together even after account synchronization', () => {
    const rows = providerModelRows({ ...catalog, builtin: [{ ...builtin, model: 'builtin-only' }, builtin] })
    expect(rows.map(({ name, source }) => ({ name, source }))).toEqual([
      { name: 'builtin-only', source: 'builtin' },
      { name: 'shared', source: 'discovered' }
    ])
    expect(rows[1].configuredModel?.id).toBe('imported')
    expect(rows[1].tags.map((tag) => tag.defaultText)).toContain('32K')
  })

  it.each([
    [manual, imported],
    [imported, manual]
  ])('keeps the manual override regardless of response order', (...custom) => {
    const rows = providerModelRows({ ...catalog, custom })
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('manual')
    expect(rows[0].configuredModel?.id).toBe('manual')
    expect(rows[0].tags.map((tag) => tag.defaultText)).toContain('64K')
  })

  it('does not merge different model types and preserves catalog metadata', () => {
    const rows = providerModelRows({
      ...catalog,
      builtin: [{ ...builtin, model_type: AiModelTypeEnum.TEXT_EMBEDDING, deprecated: true }]
    })
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.key)).size).toBe(2)
    expect(rows[0].deprecated).toBe(true)
    expect(rows[0].configuredModel).toBeUndefined()
    expect(catalog.custom).toEqual([imported])
    expect(providerModelRows()).toEqual([])
  })
})
