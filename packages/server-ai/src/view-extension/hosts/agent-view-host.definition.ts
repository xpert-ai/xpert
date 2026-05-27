import {
    AIPermissionsEnum,
    figureOutXpert,
    getAgentMiddlewareNodes,
    IWFNMiddleware,
    IXpert,
    normalizeMiddlewareProvider,
    TXpertFeatures,
    XpertTypeEnum,
    XpertViewHostCapabilities,
    XpertViewSlot
} from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import { RequestContext, ViewHostDefinition, XpertViewHostDefinition } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { XpertService } from '../../xpert/xpert.service'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'

export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

@Injectable()
@ViewHostDefinition('agent')
export class AgentViewHostDefinition implements XpertViewHostDefinition {
    readonly hostType = 'agent'
    readonly slots: XpertViewSlot[] = [
        { key: 'detail.sidebar', mode: 'sidebar', order: 0 },
        { key: AGENT_WORKBENCH_MAIN_SLOT, mode: 'sections', order: 10 },
        { key: AGENT_WORKBENCH_FIXED_SLOT, mode: 'sections', order: 20 }
    ]

    constructor(
        private readonly xpertService: XpertService,
        private readonly publishedXpertAccessService: PublishedXpertAccessService,
        private readonly agentMiddlewareRegistry: AgentMiddlewareRegistry
    ) {}

    async resolve(hostId: string) {
        const xpert = await this.xpertService.findOneByIdWithinTenant(hostId, {
            relations: ['agent']
        })
        if (xpert.type !== XpertTypeEnum.Agent) {
            return null
        }

        const capabilities = this.resolveCapabilities(xpert as IXpert)

        return {
            workspaceId: xpert.workspaceId ?? null,
            hostSnapshot: {
                id: xpert.id,
                name: xpert.name,
                title: xpert.title ?? null,
                type: xpert.type,
                active: xpert.active ?? true,
                environmentId: xpert.environmentId ?? null,
                workspaceId: xpert.workspaceId ?? null,
                capabilities
            },
            capabilities
        }
    }

    async canRead(context: Parameters<XpertViewHostDefinition['canRead']>[0]) {
        if (RequestContext.hasPermission(AIPermissionsEnum.XPERT_EDIT, false)) {
            return true
        }

        try {
            await this.publishedXpertAccessService.getAccessiblePublishedXpert(context.hostId)
            return true
        } catch {
            return false
        }
    }

    private resolveCapabilities(xpert: IXpert): XpertViewHostCapabilities {
        const runtimeXpert = figureOutXpert(xpert, false) as IXpert
        const features = new Set<string>(this.getEnabledXpertFeatures(runtimeXpert.features))
        const middlewareProviders = new Set<string>()
        const middlewareNodeKeys = new Set<string>()
        const graph = runtimeXpert.graph
        const agentKey = runtimeXpert.agent?.key ?? this.findPrimaryAgentKey(graph)

        if (graph && agentKey) {
            for (const node of getAgentMiddlewareNodes(graph, agentKey)) {
                const entity = node?.entity as unknown as IWFNMiddleware | undefined
                const provider = normalizeMiddlewareProvider(entity?.provider)
                if (!provider) {
                    continue
                }

                middlewareProviders.add(provider)
                if (node.key) {
                    middlewareNodeKeys.add(node.key)
                }

                try {
                    const strategy = this.agentMiddlewareRegistry.get(provider, xpert.organizationId ?? undefined)
                    for (const feature of strategy.meta.features ?? []) {
                        if (typeof feature === 'string' && feature.trim()) {
                            features.add(feature.trim())
                        }
                    }
                } catch {
                    // A missing strategy should not make the host unavailable. The
                    // provider name is still exposed so manifests may gate on it.
                }
            }
        }

        return {
            features: Array.from(features).sort(),
            middlewareProviders: Array.from(middlewareProviders).sort(),
            middlewareNodeKeys: Array.from(middlewareNodeKeys).sort()
        }
    }

    private getEnabledXpertFeatures(features?: TXpertFeatures | null): string[] {
        if (!features) {
            return []
        }

        return Object.entries(features)
            .filter(([, value]) => Boolean(value && typeof value === 'object' && 'enabled' in value && value.enabled))
            .map(([key]) => key)
    }

    private findPrimaryAgentKey(graph?: IXpert['graph'] | null): string | null {
        const agentNode = graph?.nodes?.find((node) => node.type === 'agent')
        return agentNode?.key ?? agentNode?.entity?.key ?? null
    }
}
