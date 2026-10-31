import { modelContextSize } from './model-context-size'
import { ICopilotWithProvider, IModelAccessCatalogItem, ModelPropertyKey, ProviderModel } from '@xpert-ai/contracts'

export interface AvailableModelMetadata {
  model: ProviderModel
  providerId?: string
  contextSize?: number
}

export function findAvailableModelMetadata(
  item: Pick<IModelAccessCatalogItem, 'copilotId' | 'provider' | 'copilotModelId' | 'modelType'>,
  copilots: ICopilotWithProvider[]
): AvailableModelMetadata | null {
  const copilot = copilots.find(
    (candidate) => candidate.id === item.copilotId && candidate.providerWithModels?.provider === item.provider
  )
  const model = copilot?.providerWithModels?.models?.find(
    (candidate) => candidate.model === item.copilotModelId && candidate.model_type === item.modelType
  )
  if (!model) return null
  const value: unknown = model.model_properties?.[ModelPropertyKey.CONTEXT_SIZE]
  return {
    model,
    providerId: copilot.modelProvider?.id,
    contextSize: modelContextSize(value)
  }
}

export function modelParameterValue(value: unknown): string | null {
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.length) return value
  return null
}
