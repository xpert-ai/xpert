import { z } from 'zod/v3'
import type { ProjectPipelineDefinition } from './definition.schema'

/** Explicit application/type identities; plugin availability alone never implies applicability. */
export const projectPipelineProjectTypesSchema = z
  .array(
    z
      .object({
        applicationKey: z.string().trim().min(1).max(300),
        projectTypeKey: z.string().regex(/^[a-z][a-z0-9_-]{0,99}$/)
      })
      .strict()
  )
  .min(1)
  .max(100)
  .superRefine((types, context) => {
    if (new Set(types.map((type) => JSON.stringify([type.applicationKey, type.projectTypeKey]))).size !== types.length)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'DUPLICATE_PIPELINE_PROJECT_TYPE' })
  })

export function isProjectPipelineApplicable(
  definition: Pick<ProjectPipelineDefinition, 'projectTypes'>,
  project: { applicationKey?: string | null; projectTypeKey?: string | null }
): boolean {
  return (
    definition.projectTypes?.some(
      (type) => type.applicationKey === project.applicationKey && type.projectTypeKey === project.projectTypeKey
    ) ?? false
  )
}
