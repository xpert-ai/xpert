import {
    getAgentMiddlewareNodes,
    getEnabledTools,
    isMiddlewareToolEnabled,
    IWFNMiddleware,
    IXpert,
    IXpertAgent,
    normalizeMiddlewareProvider,
    WorkflowNodeTypeEnum,
    XpertAssistantProfileIndicators
} from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import { In, IsNull, MoreThanOrEqual, Not, Repository } from 'typeorm'
import { RuntimeCapabilitiesService, getRuntimePrimaryAgentKey } from '../ai/runtime-capabilities.service'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { getAgentSubAgentConnections, getSubAgentConnectionTargetKey } from '../shared/agent/sub-agent'
import { XpertProfileIdentityService } from './xpert-profile-identity.service'

const PROFILE_ACTIVITY_WINDOW_DAYS = 30

@Injectable()
export class XpertProfileIndicatorsService {
    private readonly logger = new Logger(XpertProfileIndicatorsService.name)

    constructor(
        @InjectRepository(ChatConversation)
        private readonly conversations: Repository<ChatConversation>,
        private readonly identity: XpertProfileIdentityService,
        private readonly runtimeCapabilities: RuntimeCapabilitiesService,
        private readonly middlewareRegistry: AgentMiddlewareRegistry
    ) {}

    async getIndicators(xpert: IXpert): Promise<XpertAssistantProfileIndicators> {
        const identity = await this.identity.resolve(xpert)
        const [skillCount, conversationCount30d] = await Promise.all([
            this.getSkillCount(xpert),
            this.getConversationCount(xpert, identity.versionIds)
        ])

        return {
            skillCount,
            toolCount: this.getToolCount(xpert),
            subAgentCount: this.getSubAgentCount(xpert),
            conversationCount30d
        }
    }

    private async getSkillCount(xpert: IXpert): Promise<number | null> {
        try {
            return await this.runtimeCapabilities.countAccessibleWorkspaceSkills(xpert, xpert.id)
        } catch {
            this.logger.warn(`Unable to resolve Profile skill count for Assistant '${xpert.id}'.`)
            return null
        }
    }

    private getToolCount(xpert: IXpert) {
        const graph = xpert.graph
        const agentKey = getRuntimePrimaryAgentKey(xpert)
        if (!graph || !agentKey) return 0

        const names = new Set<string>()
        const nodeByKey = new Map(graph.nodes.map((node) => [node.key, node]))
        const agentNode = graph.nodes.find((node) => node.type === 'agent' && node.key === agentKey)
        const agent: IXpertAgent | undefined = agentNode?.type === 'agent' ? agentNode.entity : undefined

        for (const connection of graph.connections.filter(
            (item) => item.from.split('/')[0] === agentKey && item.type === 'toolset'
        )) {
            const node = nodeByKey.get(connection.to.split('/')[0])
            if (node?.type !== 'toolset') continue
            const allowed = agent?.options?.availableTools?.[node.entity.name]
            for (const tool of getEnabledTools(node.entity) ?? []) {
                if (!allowed?.length || allowed.includes(tool.name)) names.add(tool.name)
            }
        }

        for (const node of getAgentMiddlewareNodes(graph, agentKey)) {
            const middleware = toMiddleware(node.entity)
            if (!middleware) continue
            const provider = normalizeMiddlewareProvider(middleware.provider)
            let strategyNames: readonly string[] = []
            try {
                strategyNames = this.middlewareRegistry.get(provider).getToolNames?.(middleware.options) ?? []
            } catch {
                // A removed plugin leaves the Profile usable; explicitly configured Tool names remain countable below.
            }
            for (const name of strategyNames) {
                const normalizedName = name.trim()
                if (normalizedName && isMiddlewareToolEnabled(middleware.tools?.[name])) names.add(normalizedName)
            }
            for (const [name, config] of Object.entries(middleware.tools ?? {})) {
                const normalizedName = name.trim()
                if (normalizedName && isMiddlewareToolEnabled(config)) names.add(normalizedName)
            }
        }

        return names.size
    }

    private getSubAgentCount(xpert: IXpert) {
        const graph = xpert.graph
        const agentKey = getRuntimePrimaryAgentKey(xpert)
        if (!graph || !agentKey) return 0
        return new Set(getAgentSubAgentConnections(graph, agentKey).map(getSubAgentConnectionTargetKey)).size
    }

    private async getConversationCount(xpert: IXpert, versionIds: string[]): Promise<number | null> {
        if (!xpert.tenantId || !versionIds.length) return 0
        const since = new Date(Date.now() - PROFILE_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000)
        try {
            return await this.conversations.count({
                where: {
                    tenantId: xpert.tenantId,
                    organizationId: xpert.organizationId ?? IsNull(),
                    xpertId: In(versionIds),
                    createdAt: MoreThanOrEqual(since),
                    from: Not('debugger')
                }
            })
        } catch {
            this.logger.warn(`Unable to resolve Profile conversation count for Assistant '${xpert.id}'.`)
            return null
        }
    }
}

function toMiddleware(entity: unknown): IWFNMiddleware | null {
    if (
        typeof entity !== 'object' ||
        entity === null ||
        Reflect.get(entity, 'type') !== WorkflowNodeTypeEnum.MIDDLEWARE ||
        typeof Reflect.get(entity, 'provider') !== 'string'
    ) {
        return null
    }
    return entity as IWFNMiddleware
}
