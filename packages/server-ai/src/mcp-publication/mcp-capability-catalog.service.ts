import {
    JSONValue,
    MCP_CAPABILITY_DESCRIPTOR_VERSION,
    XpertToolsetCategoryEnum,
    type IMcpConsumerServerCapabilities,
    type McpCapabilityDeclaration,
    type McpCapabilityDescriptor,
    type McpJsonSchema,
    type McpRequiredContext
} from '@xpert-ai/contracts'
import type {
    AnyXpertToolDefinition,
    McpCapabilityDefinitions,
    McpCapabilityRuntimeProvider
} from '@xpert-ai/plugin-sdk'
import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { createHash } from 'node:crypto'
import { Repository } from 'typeorm'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { assertValidMcpCapabilityDescriptor, hashMcpCapabilityDescriptor } from '../tool-runtime/capability-descriptor'
import { ToolRuntimeService } from '../tool-runtime'
import { McpCapabilityCatalog } from './entities/mcp-capability-catalog.entity'
import { McpPublicationCapability } from './entities/mcp-publication-capability.entity'
import { McpSubscriptionService } from './mcp-subscription.service'
import { McpConsumerCapabilitiesService } from '../mcp-consumer'
import { XpertToolsetService } from '../xpert-toolset'

export interface ReplaceMcpCapabilityCatalogInput {
    tenantId: string
    organizationId?: string | null
    toolsetId: string
    pluginName?: string
    pluginVersion?: string
    capabilities: McpCapabilityDeclaration[]
}

@Injectable()
export class McpCapabilityCatalogService {
    constructor(
        @InjectRepository(McpCapabilityCatalog)
        private readonly repository: Repository<McpCapabilityCatalog>,
        @InjectRepository(McpPublicationCapability)
        private readonly bindingRepository: Repository<McpPublicationCapability>,
        private readonly subscriptions: McpSubscriptionService,
        private readonly consumerCapabilities: McpConsumerCapabilitiesService,
        private readonly toolsets: XpertToolsetService,
        private readonly toolRuntime: ToolRuntimeService
    ) {}

    async discoverAndReplaceMcpToolset(toolsetId: string) {
        const entities = await this.discoverMcpToolsetCapabilities(toolsetId)
        return this.replacePreparedToolsetCapabilities(toolsetId, entities)
    }

    async getToolsetCapabilitySnapshot(toolsetId: string) {
        await this.assertToolsetInCurrentScope(toolsetId)
        return this.repository.find({ where: { toolsetId }, order: { capabilityType: 'ASC', capabilityKey: 'ASC' } })
    }

    async restoreToolsetCapabilitySnapshot(toolsetId: string, snapshot: McpCapabilityCatalog[]) {
        await this.assertToolsetInCurrentScope(toolsetId)
        if (snapshot.some((item) => item.toolsetId !== toolsetId)) {
            throw new BadRequestException('MCP capability snapshot does not belong to the target toolset.')
        }
        return this.replacePreparedToolsetCapabilities(
            toolsetId,
            snapshot.map((item) => this.repository.create({ ...item }))
        )
    }

    /** Discovers and validates native/external capabilities without changing the current catalog. */
    async discoverMcpToolsetCapabilities(toolsetId: string) {
        const toolset = await this.assertToolsetInCurrentScope(toolsetId)
        if (!toolset.category || toolset.category === XpertToolsetCategoryEnum.MCP) {
            if (!toolset.workspaceId) {
                throw new BadRequestException(
                    t('server-ai:Error.McpConsumerWorkspaceRequired', {
                        defaultValue: 'An external MCP connection must belong to a workspace.'
                    })
                )
            }
            const servers = await this.consumerCapabilities.discover(toolset.workspaceId, toolsetId)
            return this.prepareToolsetCapabilities({
                tenantId: toolset.tenantId,
                organizationId: toolset.organizationId,
                toolsetId,
                capabilities: externalMcpDeclarations(servers)
            })
        }
        const declared = await this.discoverDeclaredCapabilities(
            toolset.tenantId,
            toolset.organizationId,
            toolset.workspaceId,
            toolsetId
        )
        return this.prepareToolsetCapabilities({
            tenantId: toolset.tenantId,
            organizationId: toolset.organizationId,
            toolsetId,
            pluginName: declared.source.pluginName,
            pluginVersion: declared.source.pluginVersion,
            capabilities: nativeMcpDeclarations(declared.definitions)
        })
    }

    private async assertToolsetInCurrentScope(toolsetId: string) {
        const scope = RequestContext.getScope()
        const toolset = await this.toolsets.findOne(toolsetId)
        if (
            !scope.tenantId ||
            toolset.tenantId !== scope.tenantId ||
            (toolset.organizationId ?? null) !== (scope.organizationId ?? null)
        ) {
            throw new BadRequestException(
                t('server-ai:Error.McpToolsetOutsideManagementScope', {
                    defaultValue: 'The MCP toolset is outside the current management scope.'
                })
            )
        }
        return toolset
    }

    private async discoverDeclaredCapabilities(
        tenantId: string,
        organizationId: string | null | undefined,
        workspaceId: string | null | undefined,
        toolsetId: string
    ) {
        const userId = RequestContext.currentUserId()
        const runtimes = await this.toolRuntime.loadToolsets({
            tenantId,
            organizationId: organizationId ?? undefined,
            ...(workspaceId ? { workspaceId } : {}),
            principal: userId
                ? { type: 'user', id: userId, userId }
                : { type: 'service_account', id: 'mcp-capability-discovery' },
            toolsetIds: [toolsetId],
            env: workspaceId ? { workspaceId } : {}
        })
        const runtime = runtimes[0]
        try {
            if (!runtime || !isCapabilityRuntimeProvider(runtime)) {
                throw new BadRequestException(
                    t('server-ai:Error.McpToolsetNoCapabilities', {
                        defaultValue: 'The toolset does not declare MCP-publishable capabilities.'
                    })
                )
            }
            return {
                definitions: runtime.getMcpCapabilityDefinitions(),
                source: runtime.getMcpCapabilitySource?.() ?? {}
            }
        } finally {
            await Promise.all(runtimes.map((item) => item.close()))
        }
    }

    async replaceToolsetCapabilities(input: ReplaceMcpCapabilityCatalogInput) {
        const entities = this.prepareToolsetCapabilities(input)
        return this.replacePreparedToolsetCapabilities(input.toolsetId, entities)
    }

    private prepareToolsetCapabilities(input: ReplaceMcpCapabilityCatalogInput) {
        if (input.capabilities.length > 1_000) {
            throw new BadRequestException('An MCP toolset cannot declare more than 1000 capabilities')
        }
        const descriptors = input.capabilities.map((capability) => bindCapability(capability, input))
        const descriptorKeys = new Set<string>()
        try {
            for (const descriptor of descriptors) {
                assertValidMcpCapabilityDescriptor(descriptor)
                const key = `${descriptor.capabilityType}:${descriptor.capabilityKey}`
                if (descriptorKeys.has(key)) throw new Error(`duplicate capability '${key}'`)
                descriptorKeys.add(key)
            }
            for (const descriptor of descriptors) {
                if (
                    descriptor.capabilityType === 'tool' &&
                    descriptor.appResourceKey &&
                    !descriptorKeys.has(`app:${descriptor.appResourceKey}`)
                ) {
                    throw new Error(
                        `tool '${descriptor.capabilityKey}' references missing app '${descriptor.appResourceKey}'`
                    )
                }
            }
        } catch (error) {
            throw new BadRequestException(error instanceof Error ? error.message : String(error))
        }
        return descriptors.map((descriptor) =>
            this.repository.create({
                tenantId: input.tenantId,
                organizationId: input.organizationId ?? null,
                toolsetId: input.toolsetId,
                capabilityType: descriptor.capabilityType,
                capabilityKey: descriptor.capabilityKey,
                descriptorHash: hashMcpCapabilityDescriptor(descriptor),
                descriptor,
                enabled: true
            })
        )
    }

    private async replacePreparedToolsetCapabilities(toolsetId: string, entities: McpCapabilityCatalog[]) {
        const publications = await this.bindingRepository.find({ where: { toolsetId } })
        await this.repository.manager.transaction(async (manager) => {
            await manager.delete(McpCapabilityCatalog, { toolsetId })
            if (entities.length) {
                await manager.save(McpCapabilityCatalog, entities)
            }
        })
        const changes = new Map<string, string[]>()
        for (const binding of publications) {
            const types = changes.get(binding.publicationId) ?? []
            types.push(binding.capabilityType)
            changes.set(binding.publicationId, types)
        }
        for (const [publicationId, types] of changes) {
            this.subscriptions.publishCatalogChanged(publicationId, types)
        }
        return entities
    }
}

function nativeMcpDeclarations(definitions: Readonly<McpCapabilityDefinitions>): McpCapabilityDeclaration[] {
    const providerInstructions = normalizedProviderInstructions(definitions.instructions)
    return [
        ...(definitions.tools ?? [])
            .filter((tool) => tool.exposure.mcp.eligible)
            .map((tool) => nativeToolDeclaration(tool, providerInstructions)),
        ...(definitions.resources ?? []).map((resource) => ({
            descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
            capabilityType: 'resource' as const,
            capabilityKey: resource.key,
            title: resource.title,
            description: resource.description,
            ...(providerInstructions ? { providerInstructions } : {}),
            uri: resource.uri,
            mimeType: resource.mimeType,
            requiredContext: requiredContexts(resource.requiredContext),
            visibility: ['model' as const],
            ...(resource.cacheTtlMs ? { cacheTtlMs: resource.cacheTtlMs } : {})
        })),
        ...(definitions.resourceTemplates ?? []).map((template) => ({
            descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
            capabilityType: 'resource_template' as const,
            capabilityKey: template.key,
            title: template.title,
            description: template.description,
            ...(providerInstructions ? { providerInstructions } : {}),
            uriTemplate: template.uriTemplate,
            ...(template.mimeType ? { mimeType: template.mimeType } : {}),
            argumentSchema: stringArgumentSchema(template.arguments),
            supportsCompletion: Boolean(template.complete),
            requiredContext: requiredContexts(template.requiredContext),
            visibility: ['model' as const],
            ...(template.cacheTtlMs ? { cacheTtlMs: template.cacheTtlMs } : {})
        })),
        ...(definitions.prompts ?? []).map((prompt) => ({
            descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
            capabilityType: 'prompt' as const,
            capabilityKey: prompt.key,
            title: prompt.title,
            description: prompt.description,
            ...(providerInstructions ? { providerInstructions } : {}),
            name: prompt.name,
            argumentSchema: stringArgumentSchema(prompt.arguments ?? {}),
            supportsCompletion: prompt.supportsCompletion === true || Boolean(prompt.complete),
            requiredContext: requiredContexts(prompt.requiredContext),
            visibility: ['model' as const]
        })),
        ...(definitions.apps ?? []).map((app) => ({
            descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
            capabilityType: 'app' as const,
            capabilityKey: app.key,
            title: app.title,
            description: app.description,
            ...(providerInstructions ? { providerInstructions } : {}),
            entry: app.entry,
            csp: app.csp,
            permissions: app.permissions,
            requiredContext: requiredContexts(),
            visibility: ['app' as const]
        }))
    ]
}

function nativeToolDeclaration(tool: AnyXpertToolDefinition, providerInstructions?: string): McpCapabilityDeclaration {
    return {
        descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
        capabilityType: 'tool',
        capabilityKey: tool.name,
        title: tool.title,
        description: tool.description,
        ...(providerInstructions ? { providerInstructions } : {}),
        inputSchema: zodMcpSchema(tool.inputSchema),
        ...(tool.outputSchema ? { outputSchema: zodMcpSchema(tool.outputSchema) } : {}),
        behavior: tool.behavior,
        annotations: {
            ...(tool.title ? { title: tool.title } : {}),
            readOnlyHint: tool.behavior.risk === 'read',
            destructiveHint: tool.behavior.risk === 'dangerous' || tool.behavior.sideEffect === 'irreversible',
            idempotentHint: tool.behavior.idempotency !== 'non_idempotent'
        },
        ...(tool.app ? { appResourceKey: tool.app.resourceKey } : {}),
        ...(tool.task
            ? {
                  taskMode: tool.task.mode,
                  ...(tool.task.maxLifetimeMs ? { taskMaxLifetimeMs: tool.task.maxLifetimeMs } : {})
              }
            : {}),
        requiredContext: requiredContexts(tool.requiredContext),
        visibility: tool.visibility?.length ? [...tool.visibility] : ['model']
    }
}

function requiredContexts(contexts?: readonly McpRequiredContext[]) {
    return contexts?.length ? [...contexts] : (['tenant', 'principal', 'execution'] as McpRequiredContext[])
}

function stringArgumentSchema(arguments_: Record<string, { required: boolean; description?: string }>): McpJsonSchema {
    const required: string[] = []
    const properties: McpJsonSchema = {}
    for (const [name, argument] of Object.entries(arguments_)) {
        properties[name] = {
            type: 'string',
            ...(argument.description ? { description: argument.description } : {})
        }
        if (argument.required) required.push(name)
    }
    return {
        type: 'object',
        properties,
        ...(required.length ? { required } : {})
    }
}

function zodMcpSchema(schema: AnyXpertToolDefinition['inputSchema']): McpJsonSchema {
    const value: unknown = JSON.parse(JSON.stringify(zodToJsonSchema(schema)))
    if (!isObject(value)) throw new BadRequestException('Declared tool schema is not a JSON object')
    const result: McpJsonSchema = {}
    for (const [key, item] of Object.entries(value)) {
        if (!isJsonValue(item)) throw new BadRequestException('Declared tool schema is not JSON serializable')
        result[key] = item
    }
    return result
}

function isCapabilityRuntimeProvider(value: object): value is object & McpCapabilityRuntimeProvider {
    return typeof Reflect.get(value, 'getMcpCapabilityDefinitions') === 'function'
}

function isJsonValue(value: unknown): value is JSONValue {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return true
    }
    if (Array.isArray(value)) return value.every(isJsonValue)
    return isObject(value) && Object.values(value).every(isJsonValue)
}

function isObject(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function externalMcpDeclarations(servers: IMcpConsumerServerCapabilities[]): McpCapabilityDeclaration[] {
    const declarations: McpCapabilityDeclaration[] = []
    for (const server of servers) {
        const providerInstructions = normalizedProviderInstructions(server.instructions)
        const appsByTool = new Map(server.apps.map((app) => [app.toolName, app]))
        for (const tool of server.tools) {
            const app = appsByTool.get(tool.name)
            const appResourceKey = app ? externalCapabilityKey(server.serverName, 'app', tool.name) : undefined
            declarations.push({
                descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
                capabilityType: 'tool',
                capabilityKey: externalCapabilityKey(server.serverName, 'tool', tool.name),
                title: tool.title ?? tool.name,
                description: tool.description,
                ...(providerInstructions ? { providerInstructions } : {}),
                inputSchema: tool.inputSchema,
                ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
                behavior: {
                    risk: 'dangerous',
                    sideEffect: 'irreversible',
                    idempotency: 'non_idempotent'
                },
                ...(tool.annotations ? { annotations: tool.annotations } : {}),
                ...(appResourceKey ? { appResourceKey } : {}),
                ...(tool.taskSupport === 'required' || tool.taskSupport === 'optional'
                    ? { taskMode: tool.taskSupport }
                    : {}),
                requiredContext: ['workspace', 'principal', 'execution'],
                visibility: tool.visibility?.length ? [...tool.visibility] : ['model', 'app'],
                source: { serverName: server.serverName, remoteName: tool.name }
            })
            if (app && appResourceKey) {
                declarations.push({
                    descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
                    capabilityType: 'app',
                    capabilityKey: appResourceKey,
                    title: app.title ?? tool.title ?? tool.name,
                    ...(providerInstructions ? { providerInstructions } : {}),
                    entry: app.resourceUri,
                    requiredContext: ['workspace', 'principal', 'execution'],
                    visibility: ['app'],
                    source: { serverName: server.serverName, remoteName: app.resourceUri }
                })
            }
        }
        for (const resource of server.resources) {
            declarations.push({
                descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
                capabilityType: 'resource',
                capabilityKey: externalCapabilityKey(server.serverName, 'resource', resource.uri),
                title: resource.title ?? resource.name,
                description: resource.description,
                ...(providerInstructions ? { providerInstructions } : {}),
                uri: resource.uri,
                mimeType: resource.mimeType,
                requiredContext: ['workspace', 'principal', 'execution'],
                visibility: ['model'],
                source: { serverName: server.serverName, remoteName: resource.uri }
            })
        }
        for (const template of server.resourceTemplates) {
            declarations.push({
                descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
                capabilityType: 'resource_template',
                capabilityKey: externalCapabilityKey(server.serverName, 'resource_template', template.uriTemplate),
                title: template.title ?? template.name,
                description: template.description,
                ...(providerInstructions ? { providerInstructions } : {}),
                uriTemplate: template.uriTemplate,
                ...(template.mimeType ? { mimeType: template.mimeType } : {}),
                argumentSchema: template.argumentSchema,
                supportsCompletion: server.supportsCompletion === true,
                requiredContext: ['workspace', 'principal', 'execution'],
                visibility: ['model'],
                source: { serverName: server.serverName, remoteName: template.uriTemplate }
            })
        }
        for (const prompt of server.prompts) {
            declarations.push({
                descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
                capabilityType: 'prompt',
                capabilityKey: externalCapabilityKey(server.serverName, 'prompt', prompt.name),
                title: prompt.title ?? prompt.name,
                description: prompt.description,
                ...(providerInstructions ? { providerInstructions } : {}),
                name: prompt.name,
                argumentSchema: prompt.argumentSchema,
                supportsCompletion: server.supportsCompletion === true,
                requiredContext: ['workspace', 'principal', 'execution'],
                visibility: ['model'],
                source: { serverName: server.serverName, remoteName: prompt.name }
            })
        }
    }
    return declarations
}

function normalizedProviderInstructions(value?: string) {
    const normalized = value?.trim()
    return normalized || undefined
}

function externalCapabilityKey(serverName: string, type: string, remoteName: string) {
    const normalized = `${serverName}__${type}__${remoteName}`.replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '')
    const suffix = createHash('sha256').update(`${serverName}\0${type}\0${remoteName}`).digest('hex').slice(0, 12)
    return `${normalized.slice(0, 177)}__${suffix}`
}

function bindCapability(
    capability: McpCapabilityDeclaration,
    input: ReplaceMcpCapabilityCatalogInput
): McpCapabilityDescriptor {
    const source = {
        ...capability.source,
        toolsetId: input.toolsetId,
        ...(input.pluginName ? { pluginName: input.pluginName } : {}),
        ...(input.pluginVersion ? { pluginVersion: input.pluginVersion } : {})
    }
    switch (capability.capabilityType) {
        case 'tool':
            return { ...capability, source }
        case 'resource':
            return { ...capability, source }
        case 'resource_template':
            return { ...capability, source }
        case 'prompt':
            return { ...capability, source }
        case 'app':
            return { ...capability, source }
    }
}
