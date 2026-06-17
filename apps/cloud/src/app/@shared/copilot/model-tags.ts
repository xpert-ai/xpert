import {
  AiModelTypeEnum,
  ICopilotProviderModel,
  ModelFeature,
  ModelPropertyKey,
  ProviderModel
} from '@xpert-ai/contracts'

export type ModelTag = {
  id: string
  defaultText: string
  iconClass?: string
  value?: string
}

export type ModelFilterKind = 'model-type' | 'model-mode' | 'context-size' | 'feature'

export type ModelFilterTag = ModelTag & {
  kind: ModelFilterKind
}

const HIDDEN_MODEL_FEATURE_TAGS = new Set<string>([
  ModelFeature.TOOL_CALL,
  ModelFeature.MULTI_TOOL_CALL,
  ModelFeature.AGENT_THOUGHT,
  ModelFeature.STREAM_TOOL_CALL
])

const MULTIMODAL_FEATURE_ICON_CLASSES: Record<string, string> = {
  [ModelFeature.VISION]: 'ri-eye-line',
  [ModelFeature.VIDEO]: 'ri-video-line',
  audio: 'ri-volume-up-line',
  document: 'ri-file-text-line'
}

export function providerModelDisplayTags(model: ProviderModel | null | undefined): ModelTag[] {
  return modelTags(
    model?.model_type,
    model?.model_properties?.[ModelPropertyKey.MODE],
    model?.model_properties?.[ModelPropertyKey.CONTEXT_SIZE],
    model?.features
  )
}

export function customProviderModelDisplayTags(model: ICopilotProviderModel | null | undefined): ModelTag[] {
  return modelTags(
    model?.modelType,
    model?.modelProperties?.[ModelPropertyKey.MODE],
    model?.modelProperties?.[ModelPropertyKey.CONTEXT_SIZE],
    customModelFeatures(model?.modelProperties)
  )
}

export function providerModelFilterTags(model: ProviderModel): ModelFilterTag[] {
  const tags: ModelFilterTag[] = []
  const modelTypeTag = textModelTag('model-type', model.model_type)
  if (modelTypeTag) {
    tags.push({
      ...modelTypeTag,
      kind: 'model-type'
    })
  }

  const modeTag = textModelTag('model-mode', model.model_properties?.[ModelPropertyKey.MODE])
  if (modeTag) {
    tags.push({
      ...modeTag,
      kind: 'model-mode'
    })
  }

  const contextTag = contextModelTag(model.model_properties?.[ModelPropertyKey.CONTEXT_SIZE])
  if (contextTag) {
    tags.push({
      ...contextTag,
      id: `context-size:${contextTag.value ?? contextTag.defaultText}`,
      kind: 'context-size'
    })
  }

  for (const featureTag of modelFeatureTags(model.features)) {
    tags.push({
      ...featureTag,
      id: `feature:${featureTag.id}`,
      kind: 'feature'
    })
  }

  return tags
}

function modelTags(
  modelType: AiModelTypeEnum | string | null | undefined,
  mode: unknown,
  contextSize: unknown,
  features: readonly string[] | null | undefined
): ModelTag[] {
  return [
    textModelTag('model-type', modelType),
    textModelTag('model-mode', mode),
    contextModelTag(contextSize),
    ...modelFeatureTags(features)
  ].filter((tag): tag is ModelTag => !!tag)
}

function modelFeatureTags(features: readonly string[] | null | undefined): ModelTag[] {
  const tags: ModelTag[] = []
  const seen = new Set<string>()
  for (const feature of features ?? []) {
    if (HIDDEN_MODEL_FEATURE_TAGS.has(feature)) {
      continue
    }
    if (seen.has(feature)) {
      continue
    }
    seen.add(feature)
    tags.push({
      id: feature,
      defaultText: formatTagText(feature),
      iconClass: MULTIMODAL_FEATURE_ICON_CLASSES[feature]
    })
  }
  return tags
}

function customModelFeatures(modelProperties: ICopilotProviderModel['modelProperties'] | null | undefined): string[] {
  const features: string[] = []
  if (modelProperties?.vision_support === 'support') {
    features.push(ModelFeature.VISION)
  }
  if (modelProperties?.function_calling_type === 'tool_call') {
    features.push(ModelFeature.TOOL_CALL)
  }
  if (modelProperties?.function_calling_type === 'multi_tool_call') {
    features.push(ModelFeature.TOOL_CALL)
    features.push(ModelFeature.MULTI_TOOL_CALL)
  }
  if (modelProperties?.agent_though_support === 'supported') {
    features.push(ModelFeature.AGENT_THOUGHT)
  }
  return features
}

function textModelTag(id: string, value: unknown): ModelTag | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null
  }

  const text = `${value}`.trim()
  if (!text) {
    return null
  }

  const defaultText = formatTagText(text)
  return { id: `${id}:${defaultText}`, defaultText }
}

function contextModelTag(value: unknown): ModelTag | null {
  const contextSize = parseContextSize(value)
  if (typeof contextSize !== 'number') {
    return null
  }

  const text = formatContextSize(contextSize)
  return {
    id: ModelPropertyKey.CONTEXT_SIZE,
    defaultText: text,
    value: text
  }
}

function parseContextSize(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return undefined
}

function formatContextSize(value: number): string {
  return `${Math.max(1, Math.round(value / 1000)).toLocaleString('en-US')}K`
}

function formatTagText(value: string): string {
  return value.replace(/_/g, '-').toUpperCase()
}
