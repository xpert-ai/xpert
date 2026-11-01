import {
  ProviderModel,
  FetchFrom,
  AiModelTypeEnum,
  ModelFeature,
  ModelPropertyKey,
  I18nObject,
  readModelConfiguration,
  legacyModelFeatures,
  configuredModelSource,
  ICopilotProviderModel,
  ProviderModelCatalog,
  ProviderModelSource,
  isConfiguredModelAvailable,
  isProviderModelEnabled,
  usesConfiguredModelCatalog
} from '@xpert-ai/contracts'
import { modelContextSize } from '../model-presentation/model-context-size'
import { customProviderModelDisplayTags, ModelTag, providerModelDisplayTags } from '../model-tags'

export interface ProviderModelRow {
  modelType: AiModelTypeEnum
  key: string
  name: string
  label?: I18nObject
  features: ModelFeature[]
  contextSize?: number
  schema: ProviderModel
  source: ProviderModelSource
  tags: ModelTag[]
  deprecated?: boolean
  configuredModel?: ICopilotProviderModel
}

export function providerModelEnabled(row: ProviderModelRow, catalog?: ProviderModelCatalog | null): boolean {
  return (
    !row.deprecated &&
    (!row.configuredModel ||
      isConfiguredModelAvailable({ options: { modelDiscovery: catalog?.modelDiscovery } }, row.configuredModel)) &&
    isProviderModelEnabled(
      { options: { enabledModels: catalog?.enabledModels } },
      { model: row.name, modelType: row.modelType }
    )
  )
}

/** Imported catalogs expose saved models; built-ins remain reference metadata for configuration. */
export function providerModelRows(catalog?: ProviderModelCatalog | null): ProviderModelRow[] {
  const rows = new Map<string, ProviderModelRow>()
  const configuredOnly = usesConfiguredModelCatalog({ options: { modelDiscovery: catalog?.modelDiscovery } })
  for (const model of configuredOnly ? [] : (catalog?.builtin ?? [])) {
    const key = `${model.model_type}:${model.model}`
    rows.set(key, {
      key,
      name: model.model,
      label: model.label,
      features: model.features ?? [],
      contextSize: modelContextSize(model.model_properties?.[ModelPropertyKey.CONTEXT_SIZE]),
      modelType: model.model_type,
      source: 'builtin',
      schema: model,
      tags: providerModelDisplayTags(model),
      deprecated: model.deprecated
    })
  }
  for (const model of catalog?.custom ?? []) {
    const key = `${model.modelType}:${model.modelName}`
    const source = configuredModelSource(model)
    if (rows.get(key)?.source === 'manual' && source === 'discovered') continue
    const configuration = readModelConfiguration(model.modelProperties)
    rows.set(key, {
      key,
      name: model.modelName,
      features:
        configuration?.modelType === AiModelTypeEnum.LLM
          ? configuration.features
          : legacyModelFeatures(model.modelProperties),
      contextSize: modelContextSize(
        configuration?.contextSize ?? model.modelProperties?.[ModelPropertyKey.CONTEXT_SIZE]
      ),
      modelType: model.modelType,
      source,
      tags: customProviderModelDisplayTags(model),
      configuredModel: model,
      schema: {
        model: model.modelName,
        model_type: model.modelType,
        label: { en_US: model.modelName, zh_Hans: model.modelName },
        fetch_from: FetchFrom.CUSTOMIZABLE_MODEL,
        features:
          configuration?.modelType === AiModelTypeEnum.LLM
            ? configuration.features
            : legacyModelFeatures(model.modelProperties),
        model_properties: {
          [ModelPropertyKey.CONTEXT_SIZE]:
            configuration?.contextSize ?? model.modelProperties?.[ModelPropertyKey.CONTEXT_SIZE]
        }
      }
    })
  }
  return [...rows.values()]
}
