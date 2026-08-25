import type { IMcpConsumerServerCapabilities, McpJsonSchema, McpToolAnnotations } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { Injectable, NotFoundException } from '@nestjs/common'
import { ToolRuntimeService } from '../tool-runtime'
import { MCPToolset } from '../xpert-toolset/provider/mcp/mcp-toolset'

@Injectable()
export class McpConsumerCapabilitiesService {
    constructor(private readonly toolRuntime: ToolRuntimeService) {}

    async discover(workspaceId: string, toolsetId: string): Promise<IMcpConsumerServerCapabilities[]> {
        const userId = RequestContext.currentUserId()
        const runtimes = await this.toolRuntime.loadToolsets({
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId(),
            workspaceId,
            principal: userId
                ? { type: 'user', id: userId, userId }
                : { type: 'service_account', id: 'mcp-consumer-discovery' },
            toolsetIds: [toolsetId],
            env: { workspaceId }
        })
        const runtime = runtimes[0]
        if (!(runtime instanceof MCPToolset)) {
            await Promise.all(runtimes.map((item) => item.close()))
            throw new NotFoundException('MCP toolset was not found')
        }
        try {
            const consumer = await runtime.getMcpConsumer()
            return Promise.all(
                consumer.connection.serverNames().map((serverName) => this.describeServer(consumer, serverName))
            )
        } finally {
            await runtime.close()
        }
    }

    private async describeServer(
        consumer: Awaited<ReturnType<MCPToolset['getMcpConsumer']>>,
        serverName: string
    ): Promise<IMcpConsumerServerCapabilities> {
        const [server, tools, resources, templates, prompts, apps] = await Promise.all([
            consumer.connection.describeServer(serverName),
            capture(() => consumer.tools.list(serverName)),
            capture(() => consumer.resources.list(serverName)),
            capture(() => consumer.resources.listTemplates(serverName)),
            capture(() => consumer.prompts.list(serverName)),
            capture(() => consumer.apps.list(serverName))
        ])
        const errors = {
            ...(tools.error ? { tools: tools.error } : {}),
            ...(resources.error ? { resources: resources.error } : {}),
            ...(templates.error ? { resourceTemplates: templates.error } : {}),
            ...(prompts.error ? { prompts: prompts.error } : {}),
            ...(apps.error ? { apps: apps.error } : {})
        }
        return {
            serverName,
            ...(server.serverInfo ? { serverInfo: server.serverInfo } : {}),
            ...(server.instructions ? { instructions: server.instructions } : {}),
            tools: (tools.value ?? []).map((tool) => ({
                name: tool.name,
                ...(typeof tool.title === 'string' ? { title: tool.title } : {}),
                ...(tool.description ? { description: tool.description } : {}),
                inputSchema: jsonSchema(tool.inputSchema),
                ...(jsonSchemaProperty(tool, 'outputSchema')
                    ? { outputSchema: jsonSchemaProperty(tool, 'outputSchema') }
                    : {}),
                ...(toolAnnotations(tool.annotations) ? { annotations: toolAnnotations(tool.annotations) } : {}),
                ...(taskSupport(tool) ? { taskSupport: taskSupport(tool) } : {}),
                visibility: normalizeMcpConsumerToolVisibility(tool)
            })),
            resources: (resources.value ?? []).map((resource) => ({
                uri: resource.uri,
                name: resource.name,
                ...(typeof resource.title === 'string' ? { title: resource.title } : {}),
                ...(resource.description ? { description: resource.description } : {}),
                ...(resource.mimeType ? { mimeType: resource.mimeType } : {})
            })),
            resourceTemplates: (templates.value ?? []).map((template) => ({
                uriTemplate: template.uriTemplate,
                name: template.name,
                ...(typeof template.title === 'string' ? { title: template.title } : {}),
                ...(template.description ? { description: template.description } : {}),
                ...(template.mimeType ? { mimeType: template.mimeType } : {}),
                argumentSchema: resourceTemplateArgumentSchema(template.uriTemplate)
            })),
            prompts: (prompts.value ?? []).map((prompt) => ({
                name: prompt.name,
                ...(typeof prompt.title === 'string' ? { title: prompt.title } : {}),
                ...(prompt.description ? { description: prompt.description } : {}),
                argumentSchema: promptArgumentSchema(prompt.arguments)
            })),
            apps: (apps.value ?? []).map((app) => ({
                toolName: app.toolName,
                ...(app.title ? { title: app.title } : {}),
                resourceUri: app.resourceUri
            })),
            ...(Reflect.get(server.capabilities, 'completions') ? { supportsCompletion: true } : {}),
            ...(Object.keys(errors).length ? { errors } : {})
        }
    }
}

async function capture<TValue>(operation: () => Promise<TValue>) {
    try {
        return { value: await operation(), error: undefined }
    } catch (error) {
        return { value: undefined, error: error instanceof Error ? error.message : 'MCP capability discovery failed' }
    }
}

function taskSupport(tool: object) {
    const execution = Reflect.get(tool, 'execution')
    if (typeof execution !== 'object' || execution === null || Array.isArray(execution)) return undefined
    const support = Reflect.get(execution, 'taskSupport')
    return support === 'required' || support === 'optional' || support === 'forbidden' ? support : undefined
}

export function normalizeMcpConsumerToolVisibility(tool: object): Array<'model' | 'app'> {
    const meta = Reflect.get(tool, '_meta')
    const ui = typeof meta === 'object' && meta !== null && !Array.isArray(meta) ? Reflect.get(meta, 'ui') : undefined
    const visibility =
        typeof ui === 'object' && ui !== null && !Array.isArray(ui) ? Reflect.get(ui, 'visibility') : undefined
    if (!Array.isArray(visibility)) return ['model', 'app']
    const normalized = visibility.filter((item): item is 'model' | 'app' => item === 'model' || item === 'app')
    return normalized.length ? [...new Set(normalized)] : ['model', 'app']
}

function jsonSchemaProperty(value: object, property: string): McpJsonSchema | undefined {
    const schema = Reflect.get(value, property)
    return typeof schema === 'object' && schema !== null && !Array.isArray(schema) ? jsonSchema(schema) : undefined
}

function jsonSchema(value: object): McpJsonSchema {
    return JSON.parse(JSON.stringify(value)) as McpJsonSchema
}

function toolAnnotations(value: unknown): McpToolAnnotations | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    const annotations: McpToolAnnotations = {}
    const title = Reflect.get(value, 'title')
    const readOnlyHint = Reflect.get(value, 'readOnlyHint')
    const destructiveHint = Reflect.get(value, 'destructiveHint')
    const idempotentHint = Reflect.get(value, 'idempotentHint')
    const openWorldHint = Reflect.get(value, 'openWorldHint')
    if (typeof title === 'string') annotations.title = title
    if (typeof readOnlyHint === 'boolean') annotations.readOnlyHint = readOnlyHint
    if (typeof destructiveHint === 'boolean') annotations.destructiveHint = destructiveHint
    if (typeof idempotentHint === 'boolean') annotations.idempotentHint = idempotentHint
    if (typeof openWorldHint === 'boolean') annotations.openWorldHint = openWorldHint
    return Object.keys(annotations).length ? annotations : undefined
}

function promptArgumentSchema(arguments_: Array<{ name: string; description?: string; required?: boolean }> = []) {
    const properties: Record<string, { type: 'string'; description?: string }> = {}
    const required: string[] = []
    for (const argument of arguments_) {
        properties[argument.name] = {
            type: 'string',
            ...(argument.description ? { description: argument.description } : {})
        }
        if (argument.required) required.push(argument.name)
    }
    return {
        type: 'object',
        properties,
        ...(required.length ? { required } : {})
    } satisfies McpJsonSchema
}

function resourceTemplateArgumentSchema(uriTemplate: string) {
    const names = [...uriTemplate.matchAll(/\{([^{}]+)\}/g)]
        .flatMap((match) => match[1].split(',').map((name) => name.replace(/^[+#./;?&]/, '').replace(/\*$/, '')))
        .filter(Boolean)
    const uniqueNames = [...new Set(names)]
    return {
        type: 'object',
        properties: Object.fromEntries(uniqueNames.map((name) => [name, { type: 'string' }])),
        required: uniqueNames
    } satisfies McpJsonSchema
}
