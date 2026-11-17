import { getConfig } from '@xpert-ai/server-config'
import {
    projectPipelineNativeModelBudgetSchema,
    type ProjectPipelineConfiguration,
    type ProjectPipelineConfigurationDeclaration,
    type ProjectPipelineConfigurationForm
} from '@xpert-ai/contracts'

/** Resolve opted-in catalog defaults; never apply this projection to persisted bindings or instances. */
export function pipelineConfigurationDefaults(
    declaration: ProjectPipelineConfigurationDeclaration,
    form?: ProjectPipelineConfigurationForm
): { configuration: ProjectPipelineConfiguration; form?: ProjectPipelineConfigurationForm } {
    const { nativeModelBudgetPolicy: policy, ...configuration } = declaration
    if (!policy) return { configuration, form }
    const limits = configuration.binding.limits!
    const budget = limits.nativeModelBudget!
    const hostMaxTokens = getConfig().projectExecutionOptions?.pipelineMaxTokens ?? 100000000
    // A host default is a suggestion, not permission to exceed the declaration's ceiling or
    // reduce the total below its per-call reservation. Registration validates all other bounds.
    const maxTokens =
        policy.maxTokensDefaultSource === 'host'
            ? Math.max(budget.reservationTokens, Math.min(hostMaxTokens, policy.maximum.maxTokens))
            : budget.maxTokens
    return {
        configuration: {
            ...configuration,
            binding: {
                ...configuration.binding,
                limits: {
                    ...limits,
                    nativeModelBudget: projectPipelineNativeModelBudgetSchema.parse({
                        ...budget,
                        maxTokens
                    })
                }
            }
        },
        form: form ? { ...form, nativeModelBudget: { ...policy.maximum } } : undefined
    }
}
