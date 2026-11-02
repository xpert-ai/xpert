import { z } from 'zod'
import { AiModelTypeEnum } from '../agent'
import { modelIdentitySchema, ModelIdentity, ModelParameterChange } from './model-management.model'

const llmIdentity = modelIdentitySchema.extend({ modelType: z.literal(AiModelTypeEnum.LLM) })
export const modelReplacementScopeSchema = z.object({ workspaceId: z.string().uuid().optional() }).strict()
export type ModelReplacementScope = z.output<typeof modelReplacementScopeSchema>
export interface ModelReplacementSource {
  identity: ModelIdentity
  references: number
}
export const modelReplacementSchema = z
  .object({
    source: llmIdentity,
    target: llmIdentity,
    policy: z.enum(['reset', 'compatible']),
    workspaceId: z.string().uuid().optional()
  })
  .strict()
  .refine((value) => value.source.copilotId !== value.target.copilotId || value.source.model !== value.target.model)
export type ModelReplacementInput = z.output<typeof modelReplacementSchema>
export const executeModelReplacementSchema = z
  .object({
    input: modelReplacementSchema,
    selections: z
      .array(z.object({ id: z.string().uuid(), revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict())
      .min(1)
      .max(100)
  })
  .strict()
  .refine((value) => new Set(value.selections.map((item) => item.id)).size === value.selections.length)
export type ExecuteModelReplacementInput = z.output<typeof executeModelReplacementSchema>
export interface ModelReplacementPreview {
  id: string
  name: string
  workspaceId: string
  revision: string
  count: number
  changes: { path: string; parameters: ModelParameterChange[] }[]
  missing: string[]
}
export interface ModelReplacementResult {
  id: string
  status: 'updated' | 'conflict' | 'failed' | 'skipped' | 'restored'
  operationId?: string
  message?: string
}
