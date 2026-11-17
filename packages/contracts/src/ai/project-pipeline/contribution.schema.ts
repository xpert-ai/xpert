import { z } from 'zod/v3'
import { projectPipelineConfigurationDeclarationSchema } from './configuration-declaration.schema'
import { projectPipelineExtensionDescriptorSchema } from './catalog.schema'
import { projectPipelineKeySchema } from './primitives.schema'
import { projectPipelineConfigurationFormSchema, validateProjectPipelineConfigurationForm } from './configuration-form'

export const projectPipelineContributionSchema = z
  .object({
    key: projectPipelineKeySchema,
    configurations: z.array(projectPipelineConfigurationDeclarationSchema).max(100),
    descriptors: z.array(projectPipelineExtensionDescriptorSchema).max(1000),
    forms: z.array(projectPipelineConfigurationFormSchema).max(100).optional()
  })
  .strict()
  .superRefine((value, context) => {
    const keys = value.configurations.map((item) => `${item.template.key}@${item.template.version}`)
    const refs = value.descriptors.map((descriptor) => `${descriptor.kind}:${descriptor.ref}`)
    if (new Set(keys).size !== keys.length || new Set(refs).size !== refs.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'DUPLICATE_PIPELINE_CONTRIBUTION' })
    }
    const forms = value.forms ?? []
    if (new Set(forms.map((form) => form.templateRef)).size !== forms.length)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'DUPLICATE_CONFIGURATION_FORM' })
    forms.forEach((form, index) => {
      const configuration = value.configurations.find((item) => item.binding.templateRef === form.templateRef)
      try {
        if (!configuration) throw new Error('CONFIGURATION_MISSING')
        const { nativeModelBudgetPolicy, ...concrete } = configuration
        // A policy owns the ceilings; the form receives them only after catalog resolution.
        if (nativeModelBudgetPolicy && form.nativeModelBudget) throw new Error('DUPLICATE_MODEL_BUDGET_MAXIMUM')
        validateProjectPipelineConfigurationForm(
          concrete,
          nativeModelBudgetPolicy ? { ...form, nativeModelBudget: nativeModelBudgetPolicy.maximum } : form
        )
      } catch {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_CONFIGURATION_FORM', path: ['forms', index] })
      }
    })
  })

/** Catalog metadata only. Runtime adapters are resolved separately and are never called during checking. */
export type ProjectPipelineContribution = z.output<typeof projectPipelineContributionSchema>
