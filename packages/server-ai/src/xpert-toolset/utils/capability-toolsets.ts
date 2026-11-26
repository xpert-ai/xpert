import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import {
    getEnabledTools,
    type AssistantCapabilityToolsetBinding,
    type AssistantCapabilityToolsetRequirement,
    type IXpertToolset
} from '@xpert-ai/contracts'

/** Explicit binding identity only: labels, endpoints and tool-name resemblance never select a connection. */
export function resolveCapabilityToolsets(
    requirements: readonly AssistantCapabilityToolsetRequirement[],
    candidates: readonly IXpertToolset[]
): AssistantCapabilityToolsetBinding[] {
    return requirements.map((requirement) => {
        const matches = candidates.filter((item) => item.options?.capabilityBindingKey === requirement.bindingKey)
        const toolset = matches[0]
        if (matches.length !== 1 || !toolset?.id)
            throw new BadRequestException({
                code: matches.length
                    ? 'assistant.capability_binding_ambiguous'
                    : 'assistant.capability_binding_missing',
                bindingKey: requirement.bindingKey,
                message: t(
                    matches.length
                        ? 'server-ai:Error.CapabilityBindingAmbiguous'
                        : 'server-ai:Error.CapabilityBindingMissing',
                    { binding: requirement.bindingKey }
                )
            })
        if (toolset.category !== requirement.category)
            throw new BadRequestException({
                code: 'assistant.capability_binding_category',
                bindingKey: requirement.bindingKey,
                message: t('server-ai:Error.CapabilityBindingCategory', { binding: requirement.bindingKey })
            })
        const names = new Set((getEnabledTools(toolset) ?? []).map((tool) => tool.name))
        const missing = requirement.requiredTools.filter((name) => !names.has(name))
        if (missing.length)
            throw new BadRequestException({
                code: 'assistant.capability_binding_tools',
                bindingKey: requirement.bindingKey,
                tools: missing,
                message: t('server-ai:Error.CapabilityBindingTools', {
                    binding: requirement.bindingKey,
                    tools: missing.join(', ')
                })
            })
        return {
            requirement,
            toolset: {
                id: toolset.id,
                name: toolset.name,
                type: toolset.type,
                category: requirement.category,
                options: { capabilityBindingKey: requirement.bindingKey }
            }
        }
    })
}
