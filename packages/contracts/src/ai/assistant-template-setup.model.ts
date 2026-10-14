import { z } from 'zod'
import type { TemplateManifest } from './assistant-template-manifest.model'

const key = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/)
export const templatePreferenceValuesSchema = z
  .record(key, z.string().trim().max(2000))
  .refine((values) => Object.keys(values).length <= 50)
export const assistantTemplateSetupStateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    preferences: templatePreferenceValuesSchema,
    completedAt: z.string().datetime().optional(),
    firstResult: z.string().trim().min(1).max(4000).optional(),
    connectors: z.record(
      key,
      z.discriminatedUnion('choice', [
        z.object({ choice: z.literal('binding'), bindingId: z.string().uuid() }).strict(),
        z.object({ choice: z.literal('skip') }).strict()
      ])
    )
  })
  .strict()
export type AssistantTemplateSetupState = z.output<typeof assistantTemplateSetupStateSchema>

export const templateSetupUpdateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    preferences: templatePreferenceValuesSchema.optional(),
    firstResult: z.string().trim().min(1).max(4000).optional(),
    connector: z
      .object({
        key,
        selection: z.discriminatedUnion('choice', [
          z.object({ choice: z.literal('binding'), bindingId: z.string().uuid() }).strict(),
          z.object({ choice: z.literal('skip') }).strict()
        ])
      })
      .strict()
      .optional()
  })
  .strict()
export type TemplateSetupUpdate = z.output<typeof templateSetupUpdateSchema>

export interface AssistantTemplateSetup {
  assistantId: string
  state: AssistantTemplateSetupState
  onboarding?: TemplateManifest['onboarding']
  connectors: {
    key: string
    provider: string
    required: boolean
    purpose: string
    permissions: string[]
    status: 'ready' | 'skipped' | 'requires_auth' | 'expired' | 'unavailable'
    options: { bindingId: string; label: string; status: string; runtimeUsage?: 'middleware' | 'credential' }[]
  }[]
  managementUrl?: string
  routines: TemplateRoutineStatus[]
}

export interface TemplateRoutineStatus {
  key: string
  supported: boolean
  skill: string
  output: string
  taskId?: string
  enabled: boolean
  expression: string
  timeZone?: string
  nextRunAt?: string
}

/** Assistant execution policy, independent of template delivery metadata. Exact tool names only. */
export const assistantOperationPolicySchema = z
  .object({
    default: z.enum(['allow', 'approve', 'deny']),
    rules: z
      .array(
        z
          .object({
            tool: key,
            decision: z.enum(['allow', 'approve', 'deny']),
            reason: z.string().trim().min(1).max(500)
          })
          .strict()
      )
      .max(300)
  })
  .strict()
  .refine((policy) => new Set(policy.rules.map((rule) => rule.tool)).size === policy.rules.length)
export type AssistantOperationPolicy = z.output<typeof assistantOperationPolicySchema>
