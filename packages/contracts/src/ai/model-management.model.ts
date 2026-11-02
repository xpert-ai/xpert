import { z } from 'zod'
import { AiModelTypeEnum } from '../agent'
import { DefaultModelRole, defaultModelRoleSchema, DEFAULT_MODEL_DEFINITIONS } from './default-model-role'
import { normalizeModelParameterValue, ParameterRule, ParameterType } from './ai-model.model'
import type { ICopilotProvider } from './copilot-provider.model'

export const modelIdentitySchema = z
  .object({
    copilotId: z.string().uuid(),
    modelType: z.nativeEnum(AiModelTypeEnum),
    model: z.string().trim().min(1).max(512)
  })
  .strict()
export type ModelIdentity = z.output<typeof modelIdentitySchema>
export const modelBindingSchema = modelIdentitySchema.extend({
  options: z.record(z.union([z.string(), z.number().finite(), z.boolean(), z.null()])).optional()
})
export type ModelBinding = z.output<typeof modelBindingSchema>
export const roleDefaultInputSchema = z.discriminatedUnion('mode', [
  z.object({ role: defaultModelRoleSchema, mode: z.literal('fixed'), binding: modelBindingSchema }).strict(),
  z.object({ role: defaultModelRoleSchema, mode: z.literal('inherit') }).strict(),
  z.object({ role: defaultModelRoleSchema, mode: z.literal('disabled') }).strict()
])
export const saveRoleDefaultsSchema = z
  .object({
    defaults: z.array(roleDefaultInputSchema).max(DEFAULT_MODEL_DEFINITIONS.length)
  })
  .strict()
  .refine((value) => new Set(value.defaults.map((item) => item.role)).size === value.defaults.length)
export type RoleDefaultInput = z.output<typeof roleDefaultInputSchema>
export interface RoleDefaultSetting {
  role: DefaultModelRole
  mode: 'fixed' | 'inherit' | 'disabled' | 'legacy'
  binding: ModelBinding | null
  sourceOrganizationId: string | null
  connectionName?: string
  inheritedBinding?: ModelBinding | null
  inheritedAvailable?: boolean
  available: boolean
}

export function modelIdentityKey(model: Pick<ModelIdentity, 'modelType' | 'model'>): string {
  return JSON.stringify([model.modelType, model.model])
}
export function sameModelIdentity(
  left?: Partial<ModelIdentity> | null,
  right?: Partial<ModelIdentity> | null
): boolean {
  return (
    !!left &&
    !!right &&
    left.copilotId === right.copilotId &&
    left.modelType === right.modelType &&
    left.model === right.model
  )
}

export type ModelParameterPolicy = 'reset' | 'compatible'
export interface ModelParameterChange {
  name: string
  before: unknown
  after: unknown
  action: 'retained' | 'reset' | 'removed'
}

/** Switching uses the target schema only; missing rules never preserve arbitrary old keys. */
export function transitionModelParameters(
  previous: Record<string, unknown> | undefined,
  rules: ParameterRule[],
  policy: ModelParameterPolicy
) {
  const options: Record<string, string | number | boolean | null> = {}
  const missing: string[] = []
  const changes: ModelParameterChange[] = []
  const names = new Set(rules.map((rule) => rule.name).filter(Boolean))
  for (const [name, before] of Object.entries(previous ?? {})) {
    if (!names.has(name)) changes.push({ name, before, after: undefined, action: 'removed' })
  }
  for (const rule of rules) {
    if (!rule.name) continue
    const before = previous?.[rule.name]
    // A cleared optional field must remain unset through JSON save/reopen.
    if (policy === 'compatible' && before === null && !rule.required) {
      options[rule.name] = null
      changes.push({ name: rule.name, before, after: null, action: 'retained' })
      continue
    }
    const compatible = policy === 'compatible' && isValidParameter(before, rule)
    const candidate = compatible ? before : normalizeModelParameterValue(rule.default, rule)
    if (isValidParameter(candidate, rule)) options[rule.name] = candidate
    else if (rule.required) missing.push(rule.name)
    if (before !== undefined || options[rule.name] !== undefined) {
      changes.push({ name: rule.name, before, after: options[rule.name], action: compatible ? 'retained' : 'reset' })
    }
  }
  return { options, missing, changes }
}

function isValidParameter(value: unknown, rule: ParameterRule): value is string | number | boolean {
  if (rule.type === ParameterType.INT || rule.type === ParameterType.FLOAT) {
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      (rule.type !== ParameterType.INT || Number.isInteger(value)) &&
      (rule.min === undefined || value >= rule.min) &&
      (rule.max === undefined || value <= rule.max)
    )
  }
  if (rule.type === ParameterType.BOOLEAN) return typeof value === 'boolean'
  return typeof value === 'string' && (!rule.options?.length || rule.options.includes(value))
}

export interface EnabledModelSelection {
  model: string
  modelType: AiModelTypeEnum
}
/** Undefined is a legacy catalog; an empty array deliberately enables nothing. */
export function isProviderModelEnabled(
  provider: Pick<ICopilotProvider, 'options'>,
  model: EnabledModelSelection
): boolean {
  const enabled = provider.options?.enabledModels
  return (
    enabled === undefined || enabled.some((item) => item.model === model.model && item.modelType === model.modelType)
  )
}
export const enabledModelsSchema = z
  .object({
    models: z.array(modelIdentitySchema.omit({ copilotId: true })).max(2000)
  })
  .strict()
  .refine((value) => new Set(value.models.map(modelIdentityKey)).size === value.models.length)
