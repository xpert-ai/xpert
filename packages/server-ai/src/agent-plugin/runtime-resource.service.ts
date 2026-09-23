import { dirname, join } from 'node:path'
import { connectorMcpAuth, matchesPortableMcpSchema } from './agent-plugin-mcp'
import { AgentPluginConnectorService } from './agent-plugin-connector.service'
import { publishedResourceVersion } from './published-resource-version'
import { XpertToolsetCategoryEnum, XpertTypeEnum } from '@xpert-ai/contracts'
import type { RuntimeResourceSkillSource } from './runtime-resource-context'
// A reference is not an authorization grant. Resolve the actor and scope again on every run/call.
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import type {
    IWFNMiddleware,
    IXpert,
    RuntimeResourceCatalog,
    RuntimeResourceCatalogItem,
    RuntimeResourceKind,
    RuntimeResourcesSelection
} from '@xpert-ai/contracts'
import { t } from 'i18next'
import { isEqual } from 'lodash'
import { normalizeMiddlewareProvider } from '@xpert-ai/contracts'
import { AgentPluginService, resourceScope } from './agent-plugin.service'
import type { AgentResourceBinding } from './agent-plugin.entity'
import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { applyRuntimeResourceGraph } from './runtime-resource-graph'
import { discoverRuntimeResources, isResourceInGraph, type RuntimeResourceBinding } from './runtime-resource-discovery'
import { isSameXpertFamily } from '../xpert/xpert-family'
import { assertAssistantAudience } from '../ai/assistant-audience'

import { parseRuntimeResources, sameRuntimeResources } from './runtime-resource-selection'
export { runtimeResourcesSchema } from './runtime-resource-selection'

export interface ResolvedRuntimeResources {
    selection: RuntimeResourcesSelection
    skillIds: string[]
    skillSources?: RuntimeResourceSkillSource[]
    toolsetIds: string[]
    middlewares: Array<{ key: string; entity: IWFNMiddleware }>
    experts: IXpert[]
}
export const emptyRuntimeResources = (): ResolvedRuntimeResources => ({
    selection: { revision: 0, resources: [] },
    skillIds: [],
    toolsetIds: [],
    middlewares: [],
    experts: []
})

@Injectable()
export class RuntimeResourceService {
    constructor(
        private readonly plugins: AgentPluginService,
        private readonly modules: ModuleRef
    ) {}

    private async assistant(id: string, projectId?: string | null) {
        assertAssistantAudience(id)
        const assistant = await this.modules
            .get((await import('../xpert/published-xpert-access.service')).PublishedXpertAccessService, {
                strict: false
            })
            .getAccessiblePublishedXpert(id, { relations: ['agent'] })
        if (projectId)
            await this.modules
                .get((await import('../xpert-project/services/project-access.service')).XpertProjectAccessService, {
                    strict: false
                })
                .assertCanUseXpert(projectId, id)
        return assistant
    }

    async catalog(
        assistantId: string,
        query: { projectId?: string; search?: string; kind?: RuntimeResourceKind; offset?: number; limit?: number }
    ): Promise<RuntimeResourceCatalog> {
        const assistant = await this.assistant(assistantId, query.projectId)
        const bindings = await this.plugins.bindings.find({
            where: resourceScope(),
            order: { title: 'ASC', id: 'ASC' }
        })
        const items: RuntimeResourceCatalogItem[] = []
        for (const binding of bindings) {
            if (
                !binding.enabled ||
                binding.supersededById ||
                isResourceInGraph(binding, assistant) ||
                !binding.workspaceIds.includes(assistant.workspaceId) ||
                (query.kind && binding.definition.kind !== query.kind)
            )
                continue
            if (
                query.search &&
                !`${binding.title} ${binding.description ?? ''}`.toLowerCase().includes(query.search.toLowerCase())
            )
                continue
            const item = await this.describe(binding, assistant.workspaceId, assistantId)
            try {
                const resolved = await this.resolve(
                    assistantId,
                    { revision: 0, resources: [{ bindingId: binding.id, version: binding.version }] },
                    query.projectId
                )
                if (binding.definition.kind === 'external_xpert') item.avatar = resolved.experts[0]?.avatar
            } catch {
                item.status = 'unavailable'
                item.diagnostics.push({
                    component: binding.id,
                    code: 'unavailable',
                    message: t('server-ai:Error.AgentResourceUnavailable', {
                        defaultValue: 'This resource is no longer available.'
                    })
                })
            }
            items.push(item)
        }
        const discovered = await this.discover(assistant, bindings, query.kind, true)
        for (const binding of discovered) {
            if (
                query.search &&
                !`${binding.title} ${binding.description ?? ''}`.toLowerCase().includes(query.search.toLowerCase())
            )
                continue
            items.push(await this.describe(binding, assistant.workspaceId, assistantId))
        }
        items.sort((a, b) => a.title.localeCompare(b.title) || a.bindingId.localeCompare(b.bindingId))
        const offset = query.offset ?? 0
        const page = items.slice(offset, offset + (query.limit ?? 50))
        await this.describeMiddlewareViews(page, [...bindings, ...discovered], assistantId, query.projectId)
        return { items: page, total: items.length }
    }

    private async describeMiddlewareViews(
        items: RuntimeResourceCatalogItem[],
        bindings: RuntimeResourceBinding[],
        assistantId: string,
        projectId?: string
    ) {
        const registry = this.modules.get(AgentMiddlewareRegistry, { strict: false })
        const strategies = registry.list(resourceScope().organizationId)
        const features = new Map<string, string[]>()
        for (const item of items) {
            if (item.kind !== 'middleware') continue
            item.views = []
            const definition = bindings.find((binding) => binding.id === item.bindingId)?.definition
            if (definition?.kind !== 'middleware') continue
            const meta = strategies.find(
                (strategy) =>
                    normalizeMiddlewareProvider(strategy.meta.name) === normalizeMiddlewareProvider(definition.provider)
            )?.meta
            features.set(item.bindingId, meta?.features ?? [])
        }
        const keys = [...new Set([...features.values()].flat())]
        if (!keys.length) return
        const views = await this.modules
            .get((await import('@xpert-ai/server-core')).ViewExtensionService, { strict: false })
            .listFeatureViewSummaries(
                'agent',
                assistantId,
                keys,
                projectId ? { runtimeScope: { projectId } } : undefined
            )
        for (const item of items) {
            const required = features.get(item.bindingId)
            if (required)
                item.views = views.filter((view) => view.requiredFeatures.some((key) => required.includes(key)))
        }
    }

    private async discover(
        assistant: IXpert,
        bindings: RuntimeResourceBinding[],
        kind?: RuntimeResourceKind,
        catalog = false
    ) {
        if (kind === 'agent_plugin') return []
        const experts =
            !kind || kind === 'external_xpert'
                ? await this.modules
                      .get((await import('../xpert/published-xpert-access.service')).PublishedXpertAccessService, {
                          strict: false
                      })
                      .findAccessiblePublishedResources(assistant.id, {
                          where: { type: XpertTypeEnum.Agent },
                          relations: ['agent']
                      })
                : []
        return discoverRuntimeResources({
            scope: resourceScope(),
            assistant,
            bindings,
            experts,
            kind,
            catalog,
            registry: this.modules.get(AgentMiddlewareRegistry, { strict: false })
        })
    }

    private async describe(
        binding: RuntimeResourceBinding,
        workspaceId: string,
        assistantId: string
    ): Promise<RuntimeResourceCatalogItem> {
        const base: RuntimeResourceCatalogItem = {
            bindingId: binding.id,
            version: binding.version,
            kind: binding.definition.kind,
            title: binding.title,
            description: binding.description,
            icon: binding.icon,
            avatar: binding.avatar,
            iconDefinition: binding.iconDefinition,
            status: 'ready',
            diagnostics: [],
            components: []
        }
        const definition = binding.definition
        if (definition.kind === 'middleware') {
            const registry = this.modules.get(AgentMiddlewareRegistry, { strict: false })
            base.iconDefinition = registry
                .list(resourceScope().organizationId)
                .find(
                    (strategy) =>
                        normalizeMiddlewareProvider(strategy.meta.name) ===
                        normalizeMiddlewareProvider(definition.provider)
                )?.meta.icon
        }
        if (binding.definition.kind === 'agent_plugin') {
            const pkg = await this.plugins.packages.findOneByOrFail({
                ...resourceScope(),
                id: binding.definition.packageId
            })
            base.diagnostics = [...pkg.descriptor.diagnostics]
            base.icon = pkg.descriptor.extension?.interface?.icon
            base.status = base.diagnostics.length ? 'partial' : 'ready'
            base.components = [
                ...pkg.descriptor.skills.map(({ key }) => ({ key, kind: 'skill' as const, status: 'ready' as const })),
                ...pkg.descriptor.servers.map(({ key }) => ({ key, kind: 'mcp' as const, status: 'ready' as const })),
                ...(pkg.descriptor.extension?.middlewares ?? []).map(({ key }) => ({
                    key,
                    kind: 'middleware' as const,
                    status: 'ready' as const
                })),
                ...(pkg.descriptor.extension?.experts ?? []).map(({ key }) => ({
                    key,
                    kind: 'external_xpert' as const,
                    status: 'ready' as const
                }))
            ]
            if (!base.components.length) base.status = 'unavailable'
            for (const key of Object.keys(binding.definition.connectorServers ?? {})) {
                const reference = binding.installations[workspaceId]?.connectors?.[key]
                const status = reference
                    ? await this.modules
                          .get(AgentPluginConnectorService, { strict: false })
                          .status(reference, assistantId)
                          .catch(() => 'configuration_required' as const)
                    : 'configuration_required'
                const component = base.components.find((item) => item.kind === 'mcp' && item.key === key)
                if (component) component.status = status
                if (status !== 'ready') base.status = status
            }
            // Older user-scoped OAuth installations require an explicit workspace reconfiguration.
            for (const key of binding.definition.oauthServers ?? []) {
                base.status = 'configuration_required'
                base.diagnostics.push({
                    component: key,
                    code: 'workspace_connection_required',
                    message: t('server-ai:Error.ConnectorWorkspaceConnectionRequired')
                })
                const component = base.components.find((item) => item.kind === 'mcp' && item.key === key)
                if (component) component.status = 'configuration_required'
            }
        }

        return base
    }

    async authorize(
        assistantId: string,
        reference: { bindingId: string; version: string; serverName: string; projectId?: string }
    ) {
        const assistant = await this.assistant(assistantId, reference.projectId)
        await this.resolve(
            assistantId,
            { revision: 0, resources: [{ bindingId: reference.bindingId, version: reference.version }] },
            reference.projectId
        )
        const binding = await this.plugins.bindings.findOneByOrFail({
            ...resourceScope(),
            id: reference.bindingId,
            version: reference.version,
            enabled: true
        })
        if (binding.definition.kind === 'agent_plugin' && binding.definition.connectorServers?.[reference.serverName]) {
            const connector = binding.installations[assistant.workspaceId]?.connectors?.[reference.serverName]
            if (!connector) throw new BadRequestException(t('server-ai:Error.AgentPluginConnectorConfiguration'))
            return this.modules
                .get(AgentPluginConnectorService, { strict: false })
                .authorization(connector, assistantId)
        }
        if (
            binding.definition.kind !== 'agent_plugin' ||
            !binding.definition.oauthServers?.includes(reference.serverName)
        )
            throw new BadRequestException(t('server-ai:Error.AgentResourceOAuthInvalid'))
        throw new BadRequestException(t('server-ai:Error.ConnectorWorkspaceConnectionRequired'))
    }

    async resolve(
        assistantId: string,
        selection: RuntimeResourcesSelection,
        projectId?: string | null
    ): Promise<ResolvedRuntimeResources> {
        const validated = parseRuntimeResources(selection)
        const scope = resourceScope()
        const assistant = await this.assistant(assistantId, projectId)
        const result = emptyRuntimeResources()
        result.selection = validated
        const providers = new Map<string, IWFNMiddleware['options']>()
        const packages = new Map<string, AgentResourceBinding['definition']>()
        const registry = this.modules.get(AgentMiddlewareRegistry, { strict: false })
        const access = this.modules.get(
            (await import('../xpert/published-xpert-access.service')).PublishedXpertAccessService,
            { strict: false }
        )
        const addMiddleware = (key: string, provider: string, options: IWFNMiddleware['options']) => {
            this.plugins.validateMiddleware(registry, provider, options ?? {}, scope.organizationId)
            provider = normalizeMiddlewareProvider(provider)
            if (providers.has(provider)) {
                if (!isEqual(providers.get(provider), options ?? {}))
                    throw new BadRequestException(
                        t('server-ai:Error.AgentResourceConflict', {
                            defaultValue: 'Selected middleware configurations conflict.'
                        })
                    )
                return
            }
            providers.set(provider, options ?? {})
            result.middlewares.push({
                key,
                entity: { id: key, key, type: WorkflowNodeTypeEnum.MIDDLEWARE, provider, options: options ?? {} }
            })
        }
        const addExpert = async (id: string, version: string | undefined) => {
            if (id === assistantId) throw new BadRequestException(t('server-ai:Error.AgentResourceSelfReference'))
            const expert = await access.getAccessiblePublishedResource(id, assistantId)
            if (isSameXpertFamily(expert, assistant))
                throw new BadRequestException(t('server-ai:Error.AgentResourceSelfReference'))
            if (!version || publishedResourceVersion(expert.publishAt) !== version)
                throw new ForbiddenException(t('server-ai:Error.AgentResourceUnavailable'))
            if (!result.experts.some((item) => item.id === expert.id)) result.experts.push(expert)
        }
        let discovered: Map<string, RuntimeResourceBinding> | undefined
        for (const reference of validated.resources) {
            let binding: RuntimeResourceBinding = await this.plugins.bindings.findOneBy({
                ...scope,
                id: reference.bindingId,
                version: reference.version,
                enabled: true
            })
            if (!binding) {
                if (!discovered) {
                    const managed = await this.plugins.bindings.find({ where: scope })
                    discovered = new Map((await this.discover(assistant, managed)).map((item) => [item.id, item]))
                }
                const candidate = discovered.get(reference.bindingId)
                if (candidate?.version === reference.version) binding = candidate
            }
            if (!binding || !binding.workspaceIds.includes(assistant.workspaceId))
                throw new ForbiddenException(
                    t('server-ai:Error.AgentResourceUnavailable', {
                        defaultValue: 'This resource is no longer available.'
                    })
                )
            const definition = binding.definition
            if (definition.kind === 'middleware')
                addMiddleware(`resource_${binding.id}`, definition.provider, definition.options)
            else if (definition.kind === 'external_xpert')
                await addExpert(definition.xpertId, binding.expertVersions?.[definition.xpertId])
            else {
                if (packages.has(definition.packageId)) {
                    if (!isEqual(packages.get(definition.packageId), definition))
                        throw new BadRequestException(t('server-ai:Error.AgentResourceConflict'))
                    continue
                }
                if (definition.oauthServers?.length)
                    throw new BadRequestException(t('server-ai:Error.ConnectorWorkspaceConnectionRequired'))
                packages.set(definition.packageId, definition)
                const pkg = await this.plugins.packages.findOneByOrFail({ ...scope, id: definition.packageId })
                const installation = binding.installations[assistant.workspaceId]
                if (!installation) throw new ForbiddenException(t('server-ai:Error.AgentResourceNotInstalled'))
                result.skillIds.push(...installation.skills)
                result.skillSources ??= []
                pkg.descriptor.skills.forEach((skill, index) => {
                    const id = installation.skills[index]
                    if (id && !result.skillSources.some((source) => source.id === id))
                        result.skillSources.push({
                            id,
                            name: skill.key,
                            description: skill.description,
                            rootPath: join(pkg.rootPath, dirname(skill.path)),
                            runtimePath: `agent-plugins/${pkg.id}/${skill.key}`,
                            origin: { type: 'plugin', id: pkg.id },
                            version: pkg.digest
                        })
                })
                const toolsets = this.plugins.packages.manager.getRepository(
                    (await import('../xpert-toolset/xpert-toolset.entity')).XpertToolset
                )
                for (const [index, server] of pkg.descriptor.servers.entries()) {
                    const id = installation.toolsets[index]
                    const toolset = id
                        ? await toolsets.findOneBy({ ...scope, id, workspaceId: assistant.workspaceId })
                        : null
                    if (
                        !toolset ||
                        toolset.category !== XpertToolsetCategoryEnum.MCP ||
                        toolset.options?.needSandbox !== false ||
                        toolset.options?.pluginManaged !== false ||
                        !matchesPortableMcpSchema(
                            toolset.schema,
                            server,
                            !!definition.oauthServers?.includes(server.key),
                            connectorMcpAuth(
                                installation.connectors?.[server.key],
                                definition.connectorServers?.[server.key]
                            )
                        )
                    ) {
                        throw new ForbiddenException(t('server-ai:Error.AgentResourceUnavailable'))
                    }
                    result.toolsetIds.push(id)
                }
                for (const middleware of pkg.descriptor.extension?.middlewares ?? [])
                    addMiddleware(`resource_${binding.id}_${middleware.key}`, middleware.provider, middleware.options)
                for (const expert of pkg.descriptor.extension?.experts ?? [])
                    await addExpert(
                        definition.experts[expert.reference],
                        binding.expertVersions?.[definition.experts[expert.reference]]
                    )
            }
        }
        result.skillIds = [...new Set(result.skillIds)]
        result.toolsetIds = [...new Set(result.toolsetIds)]
        if (assistant.graph && assistant.agent) applyRuntimeResourceGraph(assistant.graph, assistant.agent, result)
        return result
    }

    /** MCP App RPCs outlive the originating run, so their signed token is not enough. */
    async assertToolsetAccess(toolset: {
        id?: string
        tenantId?: string
        organizationId?: string
        workspaceId?: string
    }) {
        if (!toolset.id || !toolset.tenantId || !toolset.organizationId) return
        const bindings = await this.plugins.bindings.find({
            where: { tenantId: toolset.tenantId, organizationId: toolset.organizationId }
        })
        const owners = bindings.filter((binding) =>
            Object.values(binding.installations).some((installation) => installation.toolsets.includes(toolset.id))
        )
        if (!owners.length) return
        const scope = resourceScope()
        const binding = owners.find((item) => item.enabled && item.workspaceIds.includes(toolset.workspaceId))
        if (
            !binding ||
            scope.tenantId !== toolset.tenantId ||
            scope.organizationId !== toolset.organizationId ||
            binding.definition.kind !== 'agent_plugin' ||
            !!binding.definition.oauthServers?.length
        )
            throw new ForbiddenException(t('server-ai:Error.AgentResourceUnavailable'))
        await this.modules
            .get((await import('../xpert-workspace/workspace-access.service')).XpertWorkspaceAccessService, {
                strict: false
            })
            .assertCanRun(toolset.workspaceId)
        const pkg = await this.plugins.packages.findOneByOrFail({ ...scope, id: binding.definition.packageId })
        const index = binding.installations[toolset.workspaceId]?.toolsets.indexOf(toolset.id) ?? -1
        const server = pkg.descriptor.servers[index]
        const current = await this.plugins.packages.manager
            .getRepository((await import('../xpert-toolset/xpert-toolset.entity')).XpertToolset)
            .findOneBy({ ...scope, id: toolset.id, workspaceId: toolset.workspaceId })
        if (
            !server ||
            !current ||
            !matchesPortableMcpSchema(
                current.schema,
                server,
                !!binding.definition.oauthServers?.includes(server.key),
                connectorMcpAuth(
                    binding.installations[toolset.workspaceId]?.connectors?.[server.key],
                    binding.definition.connectorServers?.[server.key]
                )
            )
        )
            throw new ForbiddenException(t('server-ai:Error.AgentResourceUnavailable'))
    }

    async read(conversationId: string) {
        const conversation = await this.modules
            .get((await import('../chat-conversation/conversation.service')).ChatConversationService, { strict: false })
            .assertAccess(conversationId)
        assertAssistantAudience(conversation.xpertId)
        return conversation.options?.runtimeResources ?? { revision: 0, resources: [] }
    }

    async update(conversationId: string, selection: RuntimeResourcesSelection) {
        const conversations = this.modules.get(
            (await import('../chat-conversation/conversation.service')).ChatConversationService,
            { strict: false }
        )
        const conversation = await conversations.assertAccess(conversationId, 'contribute')
        await this.resolve(conversation.xpertId, selection, conversation.projectId)
        return conversations.repository.manager.transaction(async (manager) => {
            const locked = await manager.findOneOrFail(
                (await import('../chat-conversation/conversation.entity')).ChatConversation,
                { where: { id: conversationId, ...resourceScope() }, lock: { mode: 'pessimistic_write' } }
            )
            const revision = locked.options?.runtimeResources?.revision ?? 0
            if (selection.revision !== revision)
                throw new ConflictException(
                    t('server-ai:Error.AgentResourceRevisionConflict', {
                        defaultValue: 'Resources changed in another session. Reload and try again.'
                    })
                )
            const next = { revision: revision + 1, resources: selection.resources }
            locked.options = { ...locked.options, runtimeResources: next }
            await manager.save(locked)
            return next
        })
    }

    async prepare(conversationId: string, input: unknown, restoreSnapshot: boolean) {
        const conversations = this.modules.get(
            (await import('../chat-conversation/conversation.service')).ChatConversationService,
            { strict: false }
        )
        const conversation = await conversations.assertAccess(conversationId, 'contribute')
        assertAssistantAudience(conversation.xpertId)
        let selection = conversation.options?.runtimeResources ?? { revision: 0, resources: [] }
        if (input !== undefined) {
            const requested = parseRuntimeResources(input)
            if (restoreSnapshot) selection = requested
            else if (!conversation.options?.runtimeResources) selection = await this.update(conversationId, requested)
            else if (!sameRuntimeResources(requested, selection))
                throw new ConflictException(t('server-ai:Error.AgentResourceRevisionConflict'))
        }
        if (!selection.resources.length) return { ...emptyRuntimeResources(), selection }
        return this.resolve(conversation.xpertId, selection, conversation.projectId)
    }
}
