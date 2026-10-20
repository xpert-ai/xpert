import { z } from 'zod/v3'
import { projectPipelineAnalyticsInputSchema, projectPipelineAnalyticsSchema } from './analytics'

export const projectPipelinePortfolioInputSchema = z
  .object({
    projectIds: z
      .array(z.string().uuid())
      .min(1)
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length, 'DUPLICATE_PROJECT'),
    window: projectPipelineAnalyticsInputSchema
  })
  .strict()
export const projectPipelinePortfolioSchema = z
  .object({
    snapshotAt: z.string().datetime(),
    window: projectPipelineAnalyticsInputSchema,
    selectionScope: z.literal('explicit_authorized_projects'),
    totals: projectPipelineAnalyticsSchema.omit({ projectId: true, byInstance: true, queue: true, humanWait: true }),
    byProject: z.array(projectPipelineAnalyticsSchema).max(50),
    sharedAcrossProjects: z.number().int().nonnegative()
  })
  .strict()
export type ProjectPipelinePortfolioInput = z.output<typeof projectPipelinePortfolioInputSchema>
export type ProjectPipelinePortfolio = z.output<typeof projectPipelinePortfolioSchema>
