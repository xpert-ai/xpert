import { BaseLanguageModel } from '@langchain/core/language_models/base'
import { ICopilotModel, ModelPropertyKey } from '@xpert-ai/contracts'

export function getModelContextSize(input: BaseLanguageModel | ICopilotModel): number | undefined {
  if (isCopilotModel(input)) {
    return normalizeContextSize(input.options?.[ModelPropertyKey.CONTEXT_SIZE])
  }

  return getClientContextSize(input)
}

/** Bind the effective window to the runtime configuration and client without guessing from model names. */
export function applyModelContextSize<T extends object>(model: T, configuration: ICopilotModel): T {
  const configuredLimit = normalizeContextSize(configuration.options?.[ModelPropertyKey.CONTEXT_SIZE])
  const providerLimit = getClientContextSize(model)
  const limits = [configuredLimit, providerLimit].filter((value): value is number => value !== undefined)
  if (!limits.length) return model

  const contextSize = Math.min(...limits)
  configuration.options = { ...configuration.options, [ModelPropertyKey.CONTEXT_SIZE]: contextSize }

  const metadata =
    'metadata' in model && typeof model.metadata === 'object' && model.metadata !== null ? model.metadata : {}
  const legacyProfile =
    'profile' in metadata && typeof metadata.profile === 'object' && metadata.profile !== null ? metadata.profile : {}
  const profile = 'profile' in model && typeof model.profile === 'object' && model.profile !== null ? model.profile : {}

  Object.assign(model, { metadata: { ...metadata, profile: { ...legacyProfile, maxInputTokens: contextSize } } })
  Object.defineProperty(model, 'profile', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: { ...legacyProfile, ...profile, maxInputTokens: contextSize }
  })
  return model
}

function getClientContextSize(model: object): number | undefined {
  const metadata = 'metadata' in model ? model.metadata : undefined
  const legacyProfile = metadata && typeof metadata === 'object' && 'profile' in metadata ? metadata.profile : undefined
  const limits = [
    readProfileContextSize(legacyProfile),
    readProfileContextSize('profile' in model ? model.profile : undefined)
  ].filter((value): value is number => value !== undefined)
  return limits.length ? Math.min(...limits) : undefined
}

function readProfileContextSize(profile: unknown): number | undefined {
  return profile && typeof profile === 'object' && 'maxInputTokens' in profile
    ? normalizeContextSize(profile.maxInputTokens)
    : undefined
}

function isCopilotModel(input: BaseLanguageModel | ICopilotModel): input is ICopilotModel {
  return typeof input === 'object' && input !== null && !('invoke' in input)
}

export function normalizeContextSize(value: unknown): number | undefined {
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
