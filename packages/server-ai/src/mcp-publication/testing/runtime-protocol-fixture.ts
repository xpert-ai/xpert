import {
    BAGGAGE_META_KEY,
    CLIENT_CAPABILITIES_META_KEY,
    CLIENT_INFO_META_KEY,
    InMemoryServerEventBus,
    PROTOCOL_VERSION_META_KEY,
    TRACEPARENT_META_KEY,
    TRACESTATE_META_KEY
} from '@modelcontextprotocol/server'
import { MCP_CAPABILITY_DESCRIPTOR_VERSION, MCP_PROTOCOL_VERSION, MCP_TASK_EXTENSION_ID } from '@xpert-ai/contracts'
import { Test, type TestingModule } from '@nestjs/testing'
import type { Request, Response } from 'express'
import { EventEmitter } from 'node:events'
import type { RedisClientType } from 'redis'
import { ToolRuntimeService } from '../../tool-runtime'
import { McpPublication, McpPublicationCapability } from '../entities'
import { McpAppBundleService } from '../mcp-app-bundle.service'
import { McpAuthenticationService } from '../mcp-authentication.service'
import { McpElicitationService } from '../mcp-elicitation.service'
import { McpInvocationAuditService } from '../mcp-invocation-audit.service'
import { McpPublicationRuntimeService } from '../mcp-publication-runtime.service'
import { McpPublicationService } from '../mcp-publication.service'
import { McpRateLimitService } from '../mcp-rate-limit.service'
import { McpSubscriptionService } from '../mcp-subscription.service'
import { McpTaskService } from '../mcp-task.service'
import { McpPublicationAuthorizationService } from '../mcp-publication-authorization.service'

export const LEGACY_MCP_PROTOCOL_VERSION = '2025-03-26'

export async function createRuntimeFixture() {
    const executeTool = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'generic MCP result' }],
        structuredContent: { source: 'third-party' },
        meta: { trace: 'preserved' }
    })
    const executeMcpResource = jest.fn()
    const executeMcpPrompt = jest.fn()
    const completeMcpCapability = jest.fn()
    const resolveRuntimeCapabilities = jest
        .fn()
        .mockResolvedValue([toolCapability(), writeToolCapability(), dangerousToolCapability()])
    const authenticate = jest.fn().mockResolvedValue(authenticatedPrincipal())
    const assertWithinLimit = jest.fn()
    const auditStart = jest.fn().mockResolvedValue({ id: 'audit-1' })
    const auditSucceeded = jest.fn()
    const auditFailed = jest.fn()
    const readAppBundle = jest.fn()
    const getTask = jest.fn()
    const subscribeTasks = jest.fn()
    const bus = new InMemoryServerEventBus()
    const elicitationState = new Map<string, string>()
    const elicitationRedis = {
        get: async (key: string) => elicitationState.get(key) ?? null,
        set: async (key: string, value: string) => {
            elicitationState.set(key, value)
            return 'OK'
        },
        del: async (key: string) => (elicitationState.delete(key) ? 1 : 0)
    } as RedisClientType
    const module: TestingModule = await Test.createTestingModule({
        providers: [
            McpPublicationRuntimeService,
            {
                provide: McpPublicationService,
                useValue: {
                    findActiveBySlug: jest.fn().mockResolvedValue(publication()),
                    resolveRuntimeCapabilities
                }
            },
            {
                provide: McpAuthenticationService,
                useValue: {
                    authenticate,
                    challenge: jest.fn().mockResolvedValue('Bearer')
                }
            },
            {
                provide: McpPublicationAuthorizationService,
                useValue: { assertCanRun: jest.fn().mockResolvedValue(undefined) }
            },
            { provide: McpRateLimitService, useValue: { assertWithinLimit } },
            {
                provide: McpInvocationAuditService,
                useValue: {
                    start: auditStart,
                    succeeded: auditSucceeded,
                    failed: auditFailed
                }
            },
            {
                provide: ToolRuntimeService,
                useValue: { executeTool, executeMcpResource, executeMcpPrompt, completeMcpCapability }
            },
            {
                provide: McpAppBundleService,
                useValue: {
                    resourceUri: jest.fn().mockReturnValue('ui://xpert/publication-1/plugin/catalog-app'),
                    read: readAppBundle
                }
            },
            { provide: McpElicitationService, useValue: new McpElicitationService(elicitationRedis) },
            {
                provide: McpTaskService,
                useValue: {
                    create: jest.fn().mockResolvedValue({
                        resultType: 'task',
                        taskId: 'task-started',
                        status: 'working',
                        createdAt: '2026-10-24T00:00:00Z',
                        lastUpdatedAt: '2026-10-24T00:00:00Z',
                        ttlMs: 300000,
                        content: []
                    }),
                    get: getTask,
                    update: jest.fn(),
                    cancel: jest.fn()
                }
            },
            {
                provide: McpSubscriptionService,
                useValue: {
                    bus: jest.fn().mockReturnValue(bus),
                    eventsApi: jest.fn().mockReturnValue({ publish: jest.fn() }),
                    subscribeTasks,
                    subscribeAccessInvalidations: jest.fn().mockReturnValue(jest.fn())
                }
            }
        ]
    }).compile()
    const runtime = module.get(McpPublicationRuntimeService)

    return {
        runtime,
        executeTool,
        executeMcpResource,
        executeMcpPrompt,
        completeMcpCapability,
        resolveRuntimeCapabilities,
        authenticate,
        assertWithinLimit,
        auditStart,
        auditSucceeded,
        auditFailed,
        readAppBundle,
        getTask,
        subscribeTasks,
        bus,
        elicitationState
    }
}

export function createProtocolClient(getRuntime: () => McpPublicationRuntimeService) {
    async function request(
        method: string,
        params: object,
        id: number,
        headers?: {
            name?: string
            traceparent?: string
            tracestate?: string
            clientCapabilities?: object
            metaProtocolVersion?: string
            headerProtocolVersion?: string
            metaTraceparent?: string
            metaTracestate?: string
            metaBaggage?: string
        }
    ) {
        const body = modernRequestBody(method, params, id, headers?.clientCapabilities, {
            protocolVersion: headers?.metaProtocolVersion,
            traceparent: headers?.metaTraceparent,
            tracestate: headers?.metaTracestate,
            baggage: headers?.metaBaggage
        })
        const nodeRequest = modernNodeRequest(method, {
            name: headers?.name,
            protocolVersion: headers?.headerProtocolVersion,
            traceparent: headers?.traceparent,
            tracestate: headers?.tracestate
        })
        const nodeResponse = new MemoryResponse()
        await getRuntime().handle(
            'generic',
            nodeRequest as unknown as Request,
            nodeResponse as unknown as Response,
            body
        )
        return { status: nodeResponse.statusCode, body: nodeResponse.jsonBody() }
    }

    async function legacyRequest(method: string, params: object, id: number) {
        const body = { jsonrpc: '2.0', id, method, params }
        const nodeRequest = legacyNodeRequest(method)
        const nodeResponse = new MemoryResponse()
        await getRuntime().handle(
            'generic',
            nodeRequest as unknown as Request,
            nodeResponse as unknown as Response,
            body
        )
        return { status: nodeResponse.statusCode, body: nodeResponse.mcpBody() }
    }
    return { request, legacyRequest }
}

export class MemoryResponse extends EventEmitter {
    statusCode = 200
    writableEnded = false
    destroyed = false
    readonly #chunks: Buffer[] = []
    readonly #headers = new Map<string, string>()

    setHeader(name: string, value: string | number | readonly string[]) {
        this.#headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(', ') : String(value))
        return this
    }

    writeHead(statusCode: number, headers?: Record<string, string>) {
        this.statusCode = statusCode
        for (const [name, value] of Object.entries(headers ?? {})) this.setHeader(name, value)
        return this
    }

    write(chunk: string | Uint8Array) {
        this.#chunks.push(Buffer.from(chunk))
        return true
    }

    end(chunk?: string | Uint8Array) {
        if (chunk !== undefined) this.write(chunk)
        this.writableEnded = true
        this.emit('finish')
        return this
    }

    status(statusCode: number) {
        this.statusCode = statusCode
        return this
    }

    json(value: unknown) {
        this.setHeader('content-type', 'application/json')
        return this.end(JSON.stringify(value))
    }

    jsonBody(): {
        result?: {
            supportedVersions?: string[]
            tools?: object[]
            resources?: object[]
            contents?: object[]
            prompts?: object[]
            messages?: object[]
            completion?: object
            isError?: boolean
            content?: object[]
            taskId?: string
            status?: string
            resultType?: string
            inputRequests?: object
            requestState?: string
            _meta?: object
        }
        error?: object
    } {
        const text = this.textBody()
        if (!text) throw new Error('Expected MCP response body')
        return JSON.parse(text)
    }

    mcpBody(): ReturnType<MemoryResponse['jsonBody']> {
        const text = this.textBody()
        if (!text.startsWith('event:')) return this.jsonBody()
        const data = text
            .split(/\r?\n/)
            .find((line) => line.startsWith('data:'))
            ?.slice('data:'.length)
            .trim()
        if (!data) throw new Error('Expected MCP SSE data frame')
        return JSON.parse(data)
    }

    textBody() {
        return Buffer.concat(this.#chunks).toString('utf8')
    }
}

export function modernRequestBody(
    method: string,
    params: object,
    id: number,
    clientCapabilities: object = {},
    meta?: {
        protocolVersion?: string
        traceparent?: string
        tracestate?: string
        baggage?: string
    }
) {
    return {
        jsonrpc: '2.0',
        id,
        method,
        params: {
            ...params,
            _meta: {
                [PROTOCOL_VERSION_META_KEY]: meta?.protocolVersion ?? MCP_PROTOCOL_VERSION,
                [CLIENT_INFO_META_KEY]: { name: 'xpert-test', version: '1.0.0' },
                [CLIENT_CAPABILITIES_META_KEY]: clientCapabilities,
                ...(meta?.traceparent ? { [TRACEPARENT_META_KEY]: meta.traceparent } : {}),
                ...(meta?.tracestate ? { [TRACESTATE_META_KEY]: meta.tracestate } : {}),
                ...(meta?.baggage ? { [BAGGAGE_META_KEY]: meta.baggage } : {})
            }
        }
    }
}

export function modernNodeRequest(
    method: string,
    options?: { name?: string; protocolVersion?: string; traceparent?: string; tracestate?: string }
) {
    const requestHeaders = {
        authorization: 'Bearer xpert_mcp_test',
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': options?.protocolVersion ?? MCP_PROTOCOL_VERSION,
        'mcp-method': method,
        ...(options?.name ? { 'mcp-name': options.name } : {}),
        ...(options?.traceparent ? { traceparent: options.traceparent } : {}),
        ...(options?.tracestate ? { tracestate: options.tracestate } : {})
    }
    return {
        method: 'POST',
        url: '/api/mcp/p/generic',
        headers: requestHeaders,
        protocol: 'http',
        get(name: string) {
            return requestHeaders[name.toLowerCase() as keyof typeof requestHeaders]
        },
        [Symbol.asyncIterator]() {
            return {
                next: async () => ({ done: true as const, value: undefined })
            }
        }
    }
}

export function legacyNodeRequest(method: string) {
    const requestHeaders: Record<string, string> = {
        authorization: 'Bearer xpert_mcp_test',
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-method': method
    }
    if (method !== 'initialize') requestHeaders['mcp-protocol-version'] = LEGACY_MCP_PROTOCOL_VERSION
    return {
        method: 'POST',
        url: '/api/mcp/p/generic',
        headers: requestHeaders,
        protocol: 'http',
        get(name: string) {
            return requestHeaders[name.toLowerCase()]
        },
        [Symbol.asyncIterator]() {
            return {
                next: async () => ({ done: true as const, value: undefined })
            }
        }
    }
}

export async function waitUntil(predicate: () => boolean) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (predicate()) return
        await new Promise<void>((resolve) => setImmediate(resolve))
    }
    throw new Error('Timed out waiting for MCP stream output')
}

export function publication(): McpPublication {
    return Object.assign(new McpPublication(), {
        id: 'publication-1',
        slug: 'generic',
        name: 'Generic MCP',
        status: 'active',
        instructions: 'Generic MCP service',
        protocolVersion: MCP_PROTOCOL_VERSION,
        authMethods: ['api_key'],
        tenantId: 'tenant-1',
        organizationId: 'organization-1'
    })
}

export function taskClientCapabilities() {
    return { extensions: { [MCP_TASK_EXTENSION_ID]: {} } }
}

export function authenticatedPrincipal() {
    return {
        authMethod: 'api_key' as const,
        subjectType: 'user' as const,
        subjectId: 'user-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        publicationId: 'publication-1',
        scopes: ['*']
    }
}

export function toolCapability(): McpPublicationCapability {
    return Object.assign(new McpPublicationCapability(), {
        id: 'capability-1',
        publicationId: 'publication-1',
        toolsetId: 'toolset-1',
        capabilityType: 'tool',
        capabilityKey: 'catalog-generic-search',
        publicName: 'generic_search',
        enabled: true,
        policy: { approvalMode: 'allow' },
        descriptorHash: 'hash',
        descriptorSnapshot: {
            descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
            capabilityType: 'tool',
            capabilityKey: 'catalog-generic-search',
            title: 'Generic search',
            description: 'Generic remote search',
            inputSchema: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query']
            },
            behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' },
            requiredContext: ['tenant', 'principal', 'execution'],
            visibility: ['model'],
            source: { toolsetId: 'toolset-1', serverName: 'third-party', remoteName: 'search' }
        }
    })
}

export function organizationRequiredToolCapability(): McpPublicationCapability {
    const capability = toolCapability()
    return Object.assign(new McpPublicationCapability(), {
        ...capability,
        id: 'capability-organization',
        capabilityKey: 'catalog-organization-search',
        publicName: 'organization_search',
        descriptorSnapshot: {
            ...capability.descriptorSnapshot,
            capabilityKey: 'catalog-organization-search',
            requiredContext: ['organization', 'tenant', 'principal', 'execution'],
            source: { toolsetId: 'toolset-1', serverName: 'third-party', remoteName: 'organization_search' }
        }
    })
}

export function writeToolCapability(): McpPublicationCapability {
    const base = toolCapability()
    return Object.assign(new McpPublicationCapability(), {
        ...base,
        id: 'capability-2',
        capabilityKey: 'catalog-generic-write',
        publicName: 'generic_write',
        policy: { approvalMode: 'confirm' },
        descriptorSnapshot: {
            ...base.descriptorSnapshot,
            capabilityKey: 'catalog-generic-write',
            behavior: { risk: 'write', sideEffect: 'reversible', idempotency: 'idempotent' },
            source: { toolsetId: 'toolset-1', serverName: 'third-party', remoteName: 'write' }
        }
    })
}

export function appToolCapability(): McpPublicationCapability {
    const base = toolCapability()
    return Object.assign(new McpPublicationCapability(), {
        ...base,
        id: 'capability-app-tool',
        capabilityKey: 'catalog-app-tool',
        publicName: 'generic_app_tool',
        descriptorSnapshot: {
            ...base.descriptorSnapshot,
            capabilityKey: 'catalog-app-tool',
            appResourceKey: 'catalog-app',
            source: { toolsetId: 'toolset-1', serverName: 'third-party', remoteName: 'app_tool' }
        }
    })
}

export function appOnlyToolCapability(): McpPublicationCapability {
    const base = appToolCapability()
    return Object.assign(new McpPublicationCapability(), {
        ...base,
        id: 'capability-app-refresh',
        capabilityKey: 'catalog-app-refresh',
        publicName: 'generic_app_refresh',
        descriptorSnapshot: {
            ...base.descriptorSnapshot,
            capabilityKey: 'catalog-app-refresh',
            visibility: ['app'],
            source: { toolsetId: 'toolset-1', serverName: 'third-party', remoteName: 'app_refresh' }
        }
    })
}

export function appCapability(): McpPublicationCapability {
    return Object.assign(new McpPublicationCapability(), {
        id: 'capability-app',
        publicationId: 'publication-1',
        toolsetId: 'toolset-1',
        capabilityType: 'app',
        capabilityKey: 'catalog-app',
        publicName: 'generic_app',
        enabled: true,
        descriptorHash: 'app-hash',
        descriptorSnapshot: {
            descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
            capabilityType: 'app',
            capabilityKey: 'catalog-app',
            title: 'Generic App',
            description: 'Generic MCP App',
            entry: 'app.html',
            requiredContext: ['tenant', 'principal', 'execution'],
            visibility: ['app'],
            source: { toolsetId: 'toolset-1', pluginName: '@xpert-ai/plugin-generic' }
        }
    })
}

export function dangerousToolCapability(): McpPublicationCapability {
    const base = toolCapability()
    return Object.assign(new McpPublicationCapability(), {
        ...base,
        id: 'capability-3',
        capabilityKey: 'catalog-generic-delete',
        publicName: 'generic_delete',
        policy: { approvalMode: 'allow' },
        descriptorSnapshot: {
            ...base.descriptorSnapshot,
            capabilityKey: 'catalog-generic-delete',
            behavior: { risk: 'dangerous', sideEffect: 'irreversible', idempotency: 'non_idempotent' },
            source: { toolsetId: 'toolset-1', serverName: 'third-party', remoteName: 'delete' }
        }
    })
}

export function resourceCapability(): McpPublicationCapability {
    return Object.assign(new McpPublicationCapability(), {
        id: 'capability-resource',
        publicationId: 'publication-1',
        toolsetId: 'toolset-1',
        capabilityType: 'resource',
        capabilityKey: 'catalog-report',
        publicName: 'report',
        enabled: true,
        descriptorHash: 'resource-hash',
        descriptorSnapshot: {
            descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
            capabilityType: 'resource',
            capabilityKey: 'catalog-report',
            title: 'Report',
            description: 'Published report',
            uri: 'https://resources.example/report',
            mimeType: 'text/plain',
            requiredContext: ['tenant', 'principal', 'execution'],
            visibility: ['model'],
            source: { toolsetId: 'toolset-1', serverName: 'third-party', remoteName: 'report' }
        }
    })
}

export function promptCapability(): McpPublicationCapability {
    return Object.assign(new McpPublicationCapability(), {
        id: 'capability-prompt',
        publicationId: 'publication-1',
        toolsetId: 'toolset-1',
        capabilityType: 'prompt',
        capabilityKey: 'catalog-summary',
        publicName: 'summary_prompt',
        enabled: true,
        descriptorHash: 'prompt-hash',
        descriptorSnapshot: {
            descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
            capabilityType: 'prompt',
            capabilityKey: 'catalog-summary',
            name: 'summary',
            description: 'Prepare a summary',
            argumentSchema: {
                type: 'object',
                properties: { topic: { type: 'string' } }
            },
            supportsCompletion: true,
            requiredContext: ['tenant', 'principal', 'execution'],
            visibility: ['model'],
            source: { toolsetId: 'toolset-1', serverName: 'third-party', remoteName: 'summary' }
        }
    })
}
