import { z } from 'zod'

const runtimeRequirementSchema = z
  .object({
    scopeKey: z.string(),
    pluginName: z.string(),
    version: z.string().optional(),
    runtimeRevision: z.string().optional(),
    state: z.enum(['loaded', 'absent'])
  })
  .transform((value) => ({
    ...value,
    scopeKey: value.scopeKey,
    pluginName: value.pluginName,
    state: value.state
  }))

const commonFields = {
  pluginNames: z.array(z.string()),
  requestedAt: z.string(),
  awaitingRestart: z.boolean().optional()
}
const generationSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

const pendingRestartSchema = z
  .object({
    ...commonFields,
    restartId: z.string().optional(),
    generation: generationSchema.optional(),
    status: z.enum(['in_progress', 'completed', 'failed', 'awaiting_restart', 'unknown']).optional(),
    runtimeRequirements: z.array(runtimeRequirementSchema).optional(),
    // Unpublished changes require exact matches before a completed manifest can clear them.
    unpublishedRequirements: z.array(runtimeRequirementSchema).optional(),
    error: z.string().optional()
  })
  .transform((value) => ({
    ...value,
    pluginNames: value.pluginNames,
    requestedAt: value.requestedAt
  }))

const convergenceSchema = z
  .object({
    ...commonFields,
    generation: generationSchema,
    runtimeRequirements: z.array(runtimeRequirementSchema).default([])
  })
  .transform((value) => ({
    ...value,
    pluginNames: value.pluginNames,
    requestedAt: value.requestedAt,
    generation: value.generation,
    runtimeRequirements: value.runtimeRequirements
  }))

// Explicit projections retain required output properties under the workspace's strictNullChecks: false.
export type PendingPluginRuntimeRestart = z.output<typeof pendingRestartSchema>
export type PendingPluginRuntimeConvergence = z.output<typeof convergenceSchema>
export type RestartStateDecodeResult<T> = { kind: 'found'; value: T } | { kind: 'invalid'; reason: 'json' | 'schema' }

function decode<T>(raw: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): RestartStateDecodeResult<T> {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { kind: 'invalid', reason: 'json' }
  }
  const parsed = schema.safeParse(value)
  return parsed.success === true ? { kind: 'found', value: parsed.data } : { kind: 'invalid', reason: 'schema' }
}

export function decodePendingRestart(raw: string): RestartStateDecodeResult<PendingPluginRuntimeRestart> {
  return decode(raw, pendingRestartSchema)
}

export function decodeConvergence(raw: string): RestartStateDecodeResult<PendingPluginRuntimeConvergence> {
  return decode(raw, convergenceSchema)
}

export function decodeLegacyPendingRestart(raw: string): RestartStateDecodeResult<PendingPluginRuntimeRestart> {
  const result = decodePendingRestart(raw)
  if (result.kind === 'invalid') return result
  const value = result.value
  return {
    kind: 'found',
    value: {
      ...value,
      ...(!value.restartId && !value.generation && !value.error
        ? { unpublishedRequirements: value.runtimeRequirements ?? [] }
        : {})
    }
  }
}
