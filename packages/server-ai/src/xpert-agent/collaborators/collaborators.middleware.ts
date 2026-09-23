import { tool } from '@langchain/core/tools'
import type { IXpert, IXpertAgent, TXpertGraph } from '@xpert-ai/contracts'
import { t } from 'i18next'
import z from 'zod'
import type { ResolvedRuntimeResources } from '../../agent-plugin/runtime-resource.service'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import { createParameters } from '../../shared/agent/parameter'
import { isRuntimeCapabilitiesAllowlist, TRuntimeCapabilitiesSelection } from '../../shared/agent/runtime-capabilities'
import { getRuntimeEnabledSubAgentConnections, getSubAgentConnectionTargetKey } from '../../shared/agent/sub-agent'

export const COLLABORATORS_MIDDLEWARE_NAME = '__collaborators_middleware__'

export interface CollaboratorsMiddlewareOptions {
    agent: IXpertAgent
    graph: TXpertGraph
    isStart: boolean
    leaderKey?: string
    runtimeCapabilities?: TRuntimeCapabilitiesSelection
    runtimeResources?: ResolvedRuntimeResources
}

/** Built in automatically; users select experts, not a second middleware switch. */
export function resolveCollaborators(options: CollaboratorsMiddlewareOptions): IXpert[] {
    const { agent, graph, runtimeCapabilities } = options
    let configured = agent.collaborators ?? []
    if (isRuntimeCapabilitiesAllowlist(runtimeCapabilities)) {
        const enabledIds = new Set(
            getRuntimeEnabledSubAgentConnections(graph, agent, { runtimeCapabilities })
                .filter((connection) => connection.type === 'xpert')
                .map(getSubAgentConnectionTargetKey)
        )
        configured = configured.filter((expert) => expert.id && enabledIds.has(expert.id))
    }
    const dynamic = options.isStart && !options.leaderKey ? (options.runtimeResources?.experts ?? []) : []
    const experts = new Map<string, IXpert>()
    for (const expert of [...configured, ...dynamic]) {
        if (!experts.has(expert.id)) experts.set(expert.id, expert)
    }

    return Array.from(experts.values())
}

export async function createCollaboratorsMiddleware(
    options: CollaboratorsMiddlewareOptions,
    compile: (experts: IXpert[]) => Promise<DynamicStructuredTool[]>
): Promise<AgentMiddleware> {
    const experts = resolveCollaborators(options)
    return { name: COLLABORATORS_MIDDLEWARE_NAME, tools: experts.length ? await compile(experts) : [] }
}

export function collaboratorToolDeclaration(expert: IXpert) {
    return tool(
        async () => {
            throw new Error(t('server-ai:Error.AgentInvocationInvalidScope'))
        },
        {
            name: expert.slug,
            description: expert.description || expert.title || expert.name,
            schema: z.object({
                ...(createParameters(expert.agentConfig?.parameters ?? expert.agent?.parameters) ?? {}),
                input: z.string().describe('The task to delegate to this expert')
            })
        }
    )
}
