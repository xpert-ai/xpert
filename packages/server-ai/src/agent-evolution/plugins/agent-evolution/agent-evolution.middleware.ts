import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
    AgentMiddleware,
    AgentMiddlewareStrategy,
    IAgentMiddlewareContext,
    IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import {
    AGENT_EVOLUTION_FEATURE,
    AGENT_EVOLUTION_ICON,
    AGENT_EVOLUTION_OPEN_TOOL,
    AGENT_EVOLUTION_PROVIDER_KEY,
    AGENT_EVOLUTION_STATUS_TOOL,
    AGENT_EVOLUTION_VIEW_KEY
} from './constants'
import { AgentEvolutionAppService } from './agent-evolution-app.service'
import { getAgentEvolutionStatusSchema, openAgentEvolutionSchema } from './schemas'

@Injectable()
@AgentMiddlewareStrategy(AGENT_EVOLUTION_PROVIDER_KEY)
export class AgentEvolutionMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
    readonly meta: TAgentMiddlewareMeta = {
        name: AGENT_EVOLUTION_PROVIDER_KEY,
        label: { en_US: 'Agent Evolution', zh_Hans: '智能体进化' },
        description: {
            en_US: 'Observe governed learning, candidate evaluation, and release activity without bypassing human approval.',
            zh_Hans: '观察受治理的学习、候选评测与发布活动，不绕过人工审批。'
        },
        icon: { type: 'svg', value: AGENT_EVOLUTION_ICON, color: '#315EFB' },
        features: [AGENT_EVOLUTION_FEATURE],
        configSchema: { type: 'object', properties: {}, required: [] }
    }

    constructor(private readonly app: AgentEvolutionAppService) {}

    createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): AgentMiddleware {
        return {
            name: AGENT_EVOLUTION_PROVIDER_KEY,
            tools: [
                tool(
                    async (input) =>
                        JSON.stringify({
                            message: 'Agent Evolution Center is ready for human review.',
                            viewKey: AGENT_EVOLUTION_VIEW_KEY,
                            tab: input.tab ?? 'overview',
                            _meta: {
                                'xpertai/visualization': {
                                    type: 'xpert.extension_view',
                                    title: '智能体进化',
                                    slotKey: 'agent-evolution-center',
                                    parameterKey: `agent-evolution:${input.tab ?? 'overview'}`,
                                    renderMode: 'replace',
                                    payload: {
                                        version: 1,
                                        viewKey: AGENT_EVOLUTION_VIEW_KEY,
                                        parameters: { tab: input.tab ?? 'overview' }
                                    },
                                    metadata: { source: 'agent-middleware', sourceId: AGENT_EVOLUTION_OPEN_TOOL }
                                }
                            }
                        }),
                    {
                        name: AGENT_EVOLUTION_OPEN_TOOL,
                        description:
                            'Open the governed Agent Evolution Center for human review. This tool never approves or releases a candidate.',
                        schema: openAgentEvolutionSchema,
                        verboseParsingErrors: true
                    }
                ),
                tool(
                    async (input) =>
                        JSON.stringify(
                            await this.app.getStatus(
                                { tenantId: context.tenantId, organizationId: context.organizationId },
                                input.targetId
                            )
                        ),
                    {
                        name: AGENT_EVOLUTION_STATUS_TOOL,
                        description:
                            'Read Agent Evolution status, immutable pointers, and governed workflow counts. This is an observation-only tool.',
                        schema: getAgentEvolutionStatusSchema,
                        verboseParsingErrors: true
                    }
                )
            ]
        }
    }
}
