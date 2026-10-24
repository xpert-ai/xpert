// Resolve configuration and connector grants from one freshly authorized graph.
// The returned runtime is server-only and must never become part of a View response.
import { ForbiddenException, Injectable } from '@nestjs/common'
import { normalizeMiddlewareOptions } from '@xpert-ai/contracts'
import {
    AgentMiddlewareRegistry,
    RequestContext,
    RuntimeCapabilityProvider,
    ViewMiddlewareRuntimeCapability,
    type AgentMiddlewareRuntimeScope,
    type ViewMiddlewareRuntimeInput,
    type ViewMiddlewareRuntimeResolver,
    type ViewMiddlewareRuntimeResult
} from '@xpert-ai/plugin-sdk'
import { requireAssistantMiddleware } from '../xpert/middleware-access/assistant-middleware'
import { getConnectorMiddlewareScope } from '../shared/agent/connector-runtime'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime/middleware-runtime.service'
import { AgentViewHostDefinition } from './hosts/agent-view-host.definition'

@Injectable()
@RuntimeCapabilityProvider(ViewMiddlewareRuntimeCapability)
export class ViewMiddlewareRuntimeService implements ViewMiddlewareRuntimeResolver {
    constructor(
        private readonly host: AgentViewHostDefinition,
        private readonly middlewareRegistry: AgentMiddlewareRegistry,
        private readonly middlewareRuntime: AgentMiddlewareRuntimeService
    ) {}

    async resolve(input: ViewMiddlewareRuntimeInput): Promise<ViewMiddlewareRuntimeResult> {
        const { context, provider, requiredFeature } = input
        if (
            context.hostType !== 'agent' ||
            !context.tenantId ||
            !context.userId ||
            context.tenantId !== RequestContext.currentTenantId() ||
            context.userId !== RequestContext.currentUserId() ||
            (context.organizationId ?? null) !== (RequestContext.getOrganizationId() ?? null) ||
            !provider.trim() ||
            !requiredFeature.trim()
        )
            throw new ForbiddenException()

        const { xpert, resolution } = await this.host.resolveAuthorizedAssistant(context, {
            isDraft: input.isDraft === true,
            runtimeScope: {
                projectId: context.runtimeScope?.projectId,
                conversationId: context.runtimeScope?.conversationId
            }
        })
        if (
            xpert.tenantId !== context.tenantId ||
            (xpert.organizationId ?? null) !== (context.organizationId ?? null) ||
            (xpert.workspaceId ?? null) !== (context.workspaceId ?? null) ||
            !resolution.context.capabilities.features?.includes(requiredFeature)
        )
            throw new ForbiddenException()

        const {
            agent,
            nodes,
            node,
            provider: resolvedProvider
        } = requireAssistantMiddleware(xpert, this.middlewareRegistry, input)

        const { connectorBindingIds, connectorProviders } = getConnectorMiddlewareScope(nodes, [])
        const runtimeScope = resolution.context.runtimeScope
        const scope: AgentMiddlewareRuntimeScope = {
            tenantId: context.tenantId,
            organizationId: context.organizationId,
            userId: context.userId,
            workspaceId: xpert.workspaceId,
            xpertId: xpert.id,
            viewHost: { type: 'agent', id: xpert.id },
            xpertName: xpert.name,
            agentKey: agent.key,
            projectId: runtimeScope.projectId,
            conversationId: runtimeScope.conversationId,
            catalog: runtimeScope.workspaceFiles.catalog,
            scopeId: runtimeScope.workspaceFiles.scopeId,
            isolateByUser: runtimeScope.workspaceFiles.isolateByUser,
            connectorBindingIds,
            connectorProviders
        }
        const options = normalizeMiddlewareOptions(node.options)
        return {
            options,
            context: {
                tenantId: context.tenantId,
                organizationId: context.organizationId,
                userId: context.userId,
                workspaceId: xpert.workspaceId,
                xpertId: xpert.id,
                workspaceDataScope: xpert.workspaceDataScope,
                xpertFeatures: xpert.features ?? null,
                projectId: runtimeScope.projectId ?? undefined,
                conversationId: runtimeScope.conversationId ?? undefined,
                agentKey: agent.key,
                knowledgebaseIds: agent.knowledgebaseIds,
                node: { ...node, provider: resolvedProvider, options },
                tools: new Map(),
                runtime: this.middlewareRuntime.createScopedApi(scope)
            }
        }
    }
}
