import { z } from 'zod'
import { AiModelTypeEnum } from '../agent/ai-model'
import type { DiscoveredModel } from './model-discovery.model'

export const providerCredentialValidationTargetSchema = z
  .object({
    modelType: z.nativeEnum(AiModelTypeEnum),
    model: z.string().trim().min(1).max(512)
  })
  .strict()

export type ProviderCredentialValidationTarget = z.infer<typeof providerCredentialValidationTargetSchema>

export const providerCredentialCheckSchema = z
  .object({
    credentials: z.record(z.unknown()),
    validationTarget: providerCredentialValidationTargetSchema.optional()
  })
  .strict()

export type ProviderCredentialCheckInput = z.infer<typeof providerCredentialCheckSchema>

/** Providers opt in when credential checks require a user-selected inference target. */
export interface ProviderCredentialValidationPolicy {
  mode: 'model'
  modelTypes: AiModelTypeEnum[]
}

export type ProviderCredentialValidationCapabilities =
  | { method: 'discovery' }
  | { method: 'model'; modelTypes: AiModelTypeEnum[]; models: ProviderCredentialValidationTarget[] }
  | { method: 'provider' }

export type ProviderCredentialValidationResult =
  | { method: 'discovery'; models: DiscoveredModel[] }
  | { method: 'model'; target: ProviderCredentialValidationTarget }
  | { method: 'provider' }
