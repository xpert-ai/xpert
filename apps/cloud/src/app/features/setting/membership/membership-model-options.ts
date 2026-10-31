import { AiModelTypeEnum, IMembershipAllowedModel, IMembershipModelMultiplier } from '@xpert-ai/contracts'

export type MembershipModelOption = {
  value: string
  provider: string
  model: string
  available: boolean
  copilotId?: string
  modelType?: AiModelTypeEnum
  copilotLabel?: string
}

export function modelOptionValue(provider: string, model: string) {
  return `${encodeURIComponent(provider)}|${encodeURIComponent(model)}`
}

export function decodeModelOptionValue(value?: string): IMembershipAllowedModel | null {
  if (!value) {
    return null
  }
  const separatorIndex = value.indexOf('|')
  if (separatorIndex < 0) {
    return null
  }
  try {
    return {
      provider: decodeURIComponent(value.slice(0, separatorIndex)),
      model: decodeURIComponent(value.slice(separatorIndex + 1))
    }
  } catch {
    return null
  }
}

export function allowedModelOptionValue(
  provider: string,
  model: string,
  copilotId?: string,
  modelType?: AiModelTypeEnum
) {
  if (modelType) return [copilotId ?? '', provider, model, modelType].map(encodeURIComponent).join('|')
  return [copilotId ?? '', provider, model].map(encodeURIComponent).join('|')
}

export function decodeAllowedModelOptionValue(value?: string): IMembershipAllowedModel | null {
  if (!value) {
    return null
  }
  const parts = value.split('|')
  if (parts.length !== 3 && parts.length !== 4) {
    return null
  }
  try {
    const [copilotId, provider, model, rawType] = parts.map(decodeURIComponent)
    if (!provider || !model) {
      return null
    }
    const modelType = Object.values(AiModelTypeEnum).find((type) => type === rawType)
    if (rawType && !modelType) return null
    return { provider, model, ...(copilotId ? { copilotId } : {}), ...(modelType ? { modelType } : {}) }
  } catch {
    return null
  }
}

export function selectionValues(value: string | number | Array<string | number>) {
  return (Array.isArray(value) ? value : [value]).map(String)
}

export function addModelOption(
  options: Map<string, MembershipModelOption>,
  provider: string,
  model: string,
  available: boolean
) {
  const value = modelOptionValue(provider, model)
  if (!options.has(value)) {
    options.set(value, { value, provider, model, available })
  }
}

export function addAllowedModelOption(
  options: Map<string, MembershipModelOption>,
  provider: string,
  model: string,
  copilotId: string | undefined,
  copilotLabel: string | undefined,
  available: boolean,
  modelType?: AiModelTypeEnum
) {
  const value = allowedModelOptionValue(provider, model, copilotId, modelType)
  if (!options.has(value)) {
    options.set(value, { value, provider, model, copilotId, copilotLabel, available, modelType })
  }
}

export function sortModelOptions(options: MembershipModelOption[]) {
  return options.sort(
    (left, right) =>
      left.provider.localeCompare(right.provider) ||
      (left.model === '*' ? -1 : right.model === '*' ? 1 : left.model.localeCompare(right.model))
  )
}

export function modelRuleSpecificity(rule: IMembershipModelMultiplier) {
  return (rule.provider ? 1 : 0) + (rule.model && rule.model !== '*' ? 2 : 0)
}
