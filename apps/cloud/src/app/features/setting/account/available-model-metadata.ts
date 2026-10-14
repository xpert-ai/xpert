import { ICopilotWithProvider, IModelAccessCatalogItem, ModelPropertyKey, ProviderModel } from '@xpert-ai/contracts'

export interface AvailableModelMetadata {
  model: ProviderModel
  providerId?: string
  contextSize?: number
}

export function findAvailableModelMetadata(
  item: IModelAccessCatalogItem,
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
  const contextSize =
    typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return {
    model,
    providerId: copilot.modelProvider?.id,
    contextSize: Number.isFinite(contextSize) && contextSize > 0 ? Math.floor(contextSize) : undefined
  }
}

export function modelParameterValue(value: unknown): string | null {
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.length) return value
  return null
}
