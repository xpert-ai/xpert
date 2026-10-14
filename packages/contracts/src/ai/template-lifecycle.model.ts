import { z } from 'zod'

export const templatePublicationInputSchema = z
  .object({
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    visibility: z.enum(['team', 'public']),
    version: z
      .string()
      .trim()
      .regex(/^\d+\.\d+\.\d+$/),
    releaseNotes: z.string().trim().max(4000).default('')
  })
  .strict()
export type TemplatePublicationInput = z.output<typeof templatePublicationInputSchema>

export interface TemplatePublicationPreview {
  revision: string
  contentHash: string
  content: string
  omitted: string[]
  blocked: string[]
  publication?: { id: string; version: string; visibility: 'team' | 'public'; revoked: boolean }
}

export const templateUpgradeSectionSchema = z.enum(['presentation', 'instructions', 'runtime', 'definition'])
export type TemplateUpgradeSection = z.output<typeof templateUpgradeSectionSchema>
export const templateUpgradeInputSchema = z
  .object({
    targetTemplateId: z.string().trim().min(1).max(500).optional(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    choices: z.record(templateUpgradeSectionSchema, z.enum(['keep', 'replace']))
  })
  .strict()
export type TemplateUpgradeInput = z.output<typeof templateUpgradeInputSchema>
export interface TemplateUpgradeSource {
  id: string
  title: string
  source?: string
}
export interface TemplateUpgradePreview {
  previousTemplateId?: string
  revision: string
  sourceHash: string
  templateId: string
  version: string
  releaseNotes: string
  baselineAvailable: boolean
  blocked: string[]
  changes: { section: TemplateUpgradeSection; conflict: boolean; before: string; after: string }[]
  operation?: TemplateUpgradeOperation
}
export interface TemplateUpgradeOperation {
  id: string
  state: 'draft' | 'published' | 'failed' | 'rolled-back'
  canResume: boolean
  canRollback: boolean
}

export const templateUpgradeActionSchema = z.object({ operationId: z.string().uuid() }).strict()
export type TemplateUpgradeAction = z.output<typeof templateUpgradeActionSchema>
