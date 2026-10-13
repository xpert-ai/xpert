import {
  configuredModelSource,
  ICopilotProviderModel,
  ProviderModelCatalog,
  ProviderModelSource
} from '@xpert-ai/contracts'
import { customProviderModelDisplayTags, ModelTag, providerModelDisplayTags } from '../model-tags'

export interface ProviderModelRow {
  key: string
  name: string
  source: ProviderModelSource
  tags: ModelTag[]
  deprecated?: boolean
  configuredModel?: ICopilotProviderModel
}

/** Keep catalog order while replacing each model with its highest-priority configuration. */
export function providerModelRows(catalog?: ProviderModelCatalog | null): ProviderModelRow[] {
  const rows = new Map<string, ProviderModelRow>()
  for (const model of catalog?.builtin ?? []) {
    const key = `${model.model_type}:${model.model}`
    rows.set(key, {
      key,
      name: model.model,
      source: 'builtin',
      tags: providerModelDisplayTags(model),
      deprecated: model.deprecated
    })
  }
  for (const model of catalog?.custom ?? []) {
    const key = `${model.modelType}:${model.modelName}`
    const source = configuredModelSource(model)
    if (rows.get(key)?.source === 'manual' && source === 'discovered') continue
    rows.set(key, {
      key,
      name: model.modelName,
      source,
      tags: customProviderModelDisplayTags(model),
      configuredModel: model
    })
  }
  return [...rows.values()]
}
