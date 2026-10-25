import { BadRequestException } from '@nestjs/common'
import type {
    AssistantTemplateDefinition,
    RuntimeResourceReference,
    TemplateAgentSource,
    TXpertParameter
} from '@xpert-ai/contracts'
import { t } from 'i18next'
import { AgentPluginPackage } from '../agent-plugin.entity'
import { readVerifiedAgentPluginFile } from '../agent-plugin-storage-error'
import { normalizeAssistantTemplate } from '../../xpert-template/definition/normalize-assistant-template'
import { resolveDraftAgentNode } from '../../xpert/draft-agent.utils'
import { AgentStateAnnotation } from '../../shared/agent/state'

/** Pinned server-side declaration. It is not a grant and contains no host paths or credentials. */
export interface RuntimeTemplateDescriptor extends TemplateAgentSource {
    title: string
    description: string
    parameters: TXpertParameter[]
}

export async function loadRuntimeTemplate(pkg: AgentPluginPackage, key: string) {
    const entry = pkg.descriptor.templates?.find((item) => item.key === key)
    if (!entry || pkg.descriptor.extension?.role === 'assistant')
        throw new BadRequestException(t('server-ai:Error.TemplateDependencyChanged'))
    const normalized = normalizeAssistantTemplate({
        export_data: await readVerifiedAgentPluginFile(pkg, entry.path)
    })
    templateInputParameters(normalized.definition)
    for (const dependency of [
        ...(normalized.dependencies.skills ?? []),
        ...(normalized.dependencies.mcpServers ?? [])
    ]) {
        if (dependency.source?.name === pkg.descriptor.name && !dependency.source.digest)
            dependency.source.digest = pkg.digest
    }
    return normalized
}

export function templateInputParameters(definition: AssistantTemplateDefinition): TXpertParameter[] {
    const root = resolveDraftAgentNode(definition, definition.nodes)
    if (!root) throw new BadRequestException(t('server-ai:Error.TemplateCapabilityDraftInvalid'))
    const parameters = [...(definition.team.agentConfig?.parameters ?? []), ...(root?.entity.parameters ?? [])]
    const reserved = new Set([
        ...Object.keys(AgentStateAnnotation.spec),
        'env',
        '__proto__',
        'constructor',
        'prototype',
        'selectedSkillIds',
        'runtimeResources',
        'runtimeCapabilities',
        'attachments',
        'threadReferences'
    ])
    for (const parameter of parameters) {
        if (parameter.name !== 'input' && (reserved.has(parameter.name) || parameter.name.startsWith('_')))
            throw new BadRequestException(
                t('server-ai:Error.TemplateSubagentParameterInvalid', { name: parameter.name })
            )
    }
    return [...new Map(parameters.map((parameter) => [parameter.name, parameter])).values()]
}

export async function runtimeTemplateDescriptors(pkg: AgentPluginPackage, reference: RuntimeResourceReference) {
    if (pkg.descriptor.extension?.role === 'assistant') return []
    return Promise.all(
        (pkg.descriptor.templates ?? []).map(async ({ key }) => {
            const { definition } = await loadRuntimeTemplate(pkg, key)
            const { team } = definition
            return {
                ...reference,
                kind: 'agent_plugin_template',
                packageName: pkg.descriptor.name,
                digest: pkg.digest,
                templateKey: key,
                title: team.title || team.name || key,
                description: team.description || '',
                parameters: templateInputParameters(definition)
            } satisfies RuntimeTemplateDescriptor
        })
    )
}
