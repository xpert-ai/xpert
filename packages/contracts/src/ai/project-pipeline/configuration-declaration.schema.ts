import { z } from 'zod/v3'
import { projectPipelineNativeModelBudgetSchema } from './budget.schema'
import { projectPipelineConfigurationSchema } from './configuration.schema'

/** Catalog-only policy. The host resolves it before exposing or persisting a concrete configuration. */
export const projectPipelineConfigurationDeclarationSchema = projectPipelineConfigurationSchema
  .innerType()
  .extend({
    nativeModelBudgetPolicy: z
      .object({
        /** Only maxTokens may inherit a host default; other defaults remain in binding.limits. */
        maxTokensDefaultSource: z.enum(['configuration', 'host']),
        /** Independent ceilings for new configurations, unaffected by changes to host defaults. */
        maximum: projectPipelineNativeModelBudgetSchema
      })
      .strict()
      .optional()
  })
  .superRefine(({ nativeModelBudgetPolicy, ...configuration }, context) => {
    const parsed = projectPipelineConfigurationSchema.safeParse(configuration)
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => context.addIssue(issue))
      return
    }
    if (!nativeModelBudgetPolicy) return
    const budget = configuration.binding.limits?.nativeModelBudget
    if (!budget) {
      context.addIssue({ code: 'custom', message: 'MODEL_BUDGET_REQUIRED', path: ['nativeModelBudgetPolicy'] })
      return
    }
    // A valid concrete fallback is required even when maxTokens normally inherits the host value.
    for (const key of ['maxCalls', 'maxTokens', 'reservationTokens'] as const) {
      if (budget[key] > nativeModelBudgetPolicy.maximum[key])
        context.addIssue({
          code: 'custom',
          message: 'MODEL_BUDGET_DEFAULT_EXCEEDS_MAXIMUM',
          path: ['nativeModelBudgetPolicy', 'maximum', key]
        })
    }
  })

export type ProjectPipelineConfigurationDeclaration = z.output<typeof projectPipelineConfigurationDeclarationSchema>
