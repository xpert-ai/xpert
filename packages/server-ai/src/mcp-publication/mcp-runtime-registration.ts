import { McpResourceUriTemplate } from './mcp-resource-uri-template'
import type {
    McpPrincipal,
    McpToolCapabilityDescriptor,
    McpResourceCapabilityDescriptor,
    McpResourceTemplateCapabilityDescriptor,
    McpPromptCapabilityDescriptor,
    McpAppCapabilityDescriptor
} from '@xpert-ai/contracts'
import { McpServer, ResourceTemplate, fromJsonSchema } from '@modelcontextprotocol/server'
import type {
    JsonSchemaType,
    ServerContext,
    CallToolResult,
    InputRequiredResult,
    ReadResourceResult,
    GetPromptResult
} from '@modelcontextprotocol/server'
import { McpPublication, McpPublicationCapability } from './entities'
import { McpAppBundleService } from './mcp-app-bundle.service'
import { McpElicitationService } from './mcp-elicitation.service'
import { mcpInputSchema } from './mcp-input-schema'
import { appResourceUri, cacheHint, stringArguments, stringVariables } from './mcp-runtime-protocol'

export interface McpRegistrationRuntime {
    appBundles: McpAppBundleService
    invokeTool(
        publication: McpPublication,
        principal: McpPrincipal,
        capability: McpPublicationCapability,
        descriptor: McpToolCapabilityDescriptor,
        args: unknown,
        context: ServerContext,
        capabilities: McpPublicationCapability[],
        elicitationCodec: ReturnType<McpElicitationService['createCodec']>,
        requestId: string,
        traceId?: string,
        appMeta?: { ui: { resourceUri: string } }
    ): Promise<CallToolResult | InputRequiredResult>
    invokeResource(
        publication: McpPublication,
        principal: McpPrincipal,
        capability: McpPublicationCapability,
        descriptor:
            | McpResourceCapabilityDescriptor
            | McpResourceTemplateCapabilityDescriptor
            | McpAppCapabilityDescriptor,
        uri: string,
        arguments_: Record<string, string>,
        traceId?: string
    ): Promise<ReadResourceResult>
    invokePrompt(
        publication: McpPublication,
        principal: McpPrincipal,
        capability: McpPublicationCapability,
        descriptor: McpPromptCapabilityDescriptor,
        arguments_: Record<string, string>,
        traceId?: string
    ): Promise<GetPromptResult>
    invokeLocalApp(
        publication: McpPublication,
        principal: McpPrincipal,
        capability: McpPublicationCapability,
        descriptor: McpAppCapabilityDescriptor,
        uri: string,
        traceId?: string
    ): Promise<ReadResourceResult>
}

export function registerTool(
    runtime: McpRegistrationRuntime,
    server: McpServer,
    publication: McpPublication,
    principal: McpPrincipal,
    capability: McpPublicationCapability,
    descriptor: McpToolCapabilityDescriptor,
    apps: Map<string, McpPublicationCapability>,
    capabilities: McpPublicationCapability[],
    elicitationCodec: ReturnType<McpElicitationService['createCodec']>,
    requestId: string,
    traceId?: string
) {
    const inputSchema = mcpInputSchema(descriptor.inputSchema as JsonSchemaType)
    const outputSchema = descriptor.outputSchema ? fromJsonSchema(descriptor.outputSchema as JsonSchemaType) : undefined
    const app = descriptor.appResourceKey
        ? apps.get(`${descriptor.source.toolsetId}:${descriptor.appResourceKey}`)
        : undefined
    const appDescriptor = app?.descriptorSnapshot.capabilityType === 'app' ? app.descriptorSnapshot : undefined
    const appMeta = appDescriptor
        ? { ui: { resourceUri: appResourceUri(publication, appDescriptor, runtime.appBundles) } }
        : undefined
    const toolMeta = {
        ui: {
            ...(appMeta?.ui ?? {}),
            visibility: descriptor.visibility
        }
    }
    server.registerTool(
        capability.publicName,
        {
            title: descriptor.title,
            description: descriptor.description,
            inputSchema,
            outputSchema,
            annotations: descriptor.annotations,
            ...(descriptor.taskMode ? { execution: { taskSupport: descriptor.taskMode } } : {}),
            _meta: toolMeta
        },
        async (args, context) =>
            runtime.invokeTool(
                publication,
                principal,
                capability,
                descriptor,
                args,
                context,
                capabilities,
                elicitationCodec,
                requestId,
                traceId,
                appMeta
            )
    )
}

export function registerResource(
    runtime: McpRegistrationRuntime,
    server: McpServer,
    publication: McpPublication,
    principal: McpPrincipal,
    capability: McpPublicationCapability,
    descriptor: McpResourceCapabilityDescriptor,
    traceId?: string
) {
    server.registerResource(
        capability.publicName,
        descriptor.uri,
        {
            title: descriptor.title,
            description: descriptor.description,
            mimeType: descriptor.mimeType,
            cacheHint: cacheHint(descriptor.cacheTtlMs)
        },
        async (uri) => runtime.invokeResource(publication, principal, capability, descriptor, uri.href, {}, traceId)
    )
}

export function registerResourceTemplate(
    runtime: McpRegistrationRuntime,
    server: McpServer,
    publication: McpPublication,
    principal: McpPrincipal,
    capability: McpPublicationCapability,
    descriptor: McpResourceTemplateCapabilityDescriptor,
    traceId?: string
) {
    server.registerResource(
        capability.publicName,
        new ResourceTemplate(new McpResourceUriTemplate(descriptor.uriTemplate), { list: undefined }),
        {
            title: descriptor.title,
            description: descriptor.description,
            mimeType: descriptor.mimeType,
            cacheHint: cacheHint(descriptor.cacheTtlMs)
        },
        async (uri, variables) =>
            runtime.invokeResource(
                publication,
                principal,
                capability,
                descriptor,
                uri.href,
                stringVariables(variables),
                traceId
            )
    )
}

export function registerPrompt(
    runtime: McpRegistrationRuntime,
    server: McpServer,
    publication: McpPublication,
    principal: McpPrincipal,
    capability: McpPublicationCapability,
    descriptor: McpPromptCapabilityDescriptor,
    traceId?: string
) {
    server.registerPrompt(
        capability.publicName,
        {
            title: descriptor.title,
            description: descriptor.description,
            argsSchema: fromJsonSchema(descriptor.argumentSchema as JsonSchemaType)
        },
        async (args) =>
            runtime.invokePrompt(publication, principal, capability, descriptor, stringArguments(args), traceId)
    )
}

export function registerApp(
    runtime: McpRegistrationRuntime,
    server: McpServer,
    publication: McpPublication,
    principal: McpPrincipal,
    capability: McpPublicationCapability,
    descriptor: McpAppCapabilityDescriptor,
    traceId?: string
) {
    const isRemoteApp = Boolean(descriptor.source.serverName && descriptor.source.remoteName)
    const uri = appResourceUri(publication, descriptor, runtime.appBundles)
    server.registerResource(
        capability.publicName,
        uri,
        {
            title: descriptor.title,
            description: descriptor.description,
            mimeType: 'text/html;profile=mcp-app',
            _meta: { ui: { csp: descriptor.csp ?? {}, permissions: descriptor.permissions ?? {} } },
            cacheHint: { ttlMs: 60_000, cacheScope: 'private' }
        },
        async () =>
            isRemoteApp
                ? runtime.invokeResource(publication, principal, capability, descriptor, uri, {}, traceId)
                : runtime.invokeLocalApp(publication, principal, capability, descriptor, uri, traceId)
    )
}
