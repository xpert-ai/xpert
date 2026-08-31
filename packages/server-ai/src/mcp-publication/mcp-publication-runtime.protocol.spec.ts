import {
    BAGGAGE_META_KEY,
    CLIENT_CAPABILITIES_META_KEY,
    CLIENT_INFO_META_KEY,
    InMemoryServerEventBus,
    PROTOCOL_VERSION_META_KEY,
    SERVER_INFO_META_KEY,
    TRACEPARENT_META_KEY,
    TRACESTATE_META_KEY
} from '@modelcontextprotocol/server'
import { MCP_CAPABILITY_DESCRIPTOR_VERSION, MCP_PROTOCOL_VERSION, MCP_TASK_EXTENSION_ID } from '@xpert-ai/contracts'
import { UnauthorizedException } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import type { Request, Response } from 'express'
import { EventEmitter } from 'node:events'
import type { RedisClientType } from 'redis'
import { applicationMetrics } from '../metrics'
import { applicationTracing } from '../tracing/application-tracing'
import { ToolRuntimeService } from '../tool-runtime'
import { McpPublication, McpPublicationCapability } from './entities'
import { McpAppBundleService } from './mcp-app-bundle.service'
import { McpAuthenticationService } from './mcp-authentication.service'
import { McpElicitationService } from './mcp-elicitation.service'
import { McpInvocationAuditService } from './mcp-invocation-audit.service'
import {
    McpPublicationRuntimeService,
    authorizedSubscriptionNotifications,
    mcpCapabilityProviderInstructions,
    mcpPublicationInstructions
} from './mcp-publication-runtime.service'
import { McpPublicationService } from './mcp-publication.service'
import { McpRateLimitService } from './mcp-rate-limit.service'
import { McpSubscriptionService } from './mcp-subscription.service'
import { McpTaskService } from './mcp-task.service'
import { McpPublicationAuthorizationService } from './mcp-publication-authorization.service'

const WORKBUDDY_PROTOCOL_VERSION = '2025-03-26'

describe('McpPublicationRuntimeService protocol', () => {
    let runtime: McpPublicationRuntimeService
    let executeTool: jest.Mock
    let executeMcpResource: jest.Mock
    let executeMcpPrompt: jest.Mock
    let completeMcpCapability: jest.Mock
    let resolveRuntimeCapabilities: jest.Mock
    let authenticate: jest.Mock
    let assertWithinLimit: jest.Mock
    let auditStart: jest.Mock
    let auditSucceeded: jest.Mock
    let auditFailed: jest.Mock
    let readAppBundle: jest.Mock
    let getTask: jest.Mock
    let subscribeTasks: jest.Mock
    let bus: InMemoryServerEventBus
    let elicitationState: Map<string, string>

    beforeAll(async () => {
        executeTool = jest.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'generic MCP result' }],
            structuredContent: { source: 'third-party' },
            meta: { trace: 'preserved' }
        })
        executeMcpResource = jest.fn()
        executeMcpPrompt = jest.fn()
        completeMcpCapability = jest.fn()
        resolveRuntimeCapabilities = jest
            .fn()
            .mockResolvedValue([toolCapability(), writeToolCapability(), dangerousToolCapability()])
        authenticate = jest.fn().mockResolvedValue(authenticatedPrincipal())
        assertWithinLimit = jest.fn()
        auditStart = jest.fn().mockResolvedValue({ id: 'audit-1' })
        auditSucceeded = jest.fn()
        auditFailed = jest.fn()
        readAppBundle = jest.fn()
        getTask = jest.fn()
        subscribeTasks = jest.fn()
        bus = new InMemoryServerEventBus()
        elicitationState = new Map<string, string>()
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
        runtime = module.get(McpPublicationRuntimeService)
    })

    beforeEach(() => {
        applicationMetrics.reset()
        executeTool.mockClear()
        executeMcpResource.mockReset()
        executeMcpPrompt.mockReset()
        completeMcpCapability.mockReset()
        authenticate.mockReset().mockResolvedValue(authenticatedPrincipal())
        assertWithinLimit.mockReset().mockResolvedValue(undefined)
        auditStart.mockClear()
        auditSucceeded.mockClear()
        auditFailed.mockClear()
        readAppBundle.mockReset()
        getTask.mockReset()
        subscribeTasks.mockReset()
        elicitationState.clear()
        resolveRuntimeCapabilities.mockResolvedValue([
            toolCapability(),
            writeToolCapability(),
            dangerousToolCapability()
        ])
    })

    it('composes platform safety guidance before publication-specific instructions', () => {
        const instructions = mcpPublicationInstructions('Use the published capabilities.')

        expect(instructions).toContain('Xpert-managed MCP publication')
        expect(instructions).toContain('Never request, expose, or forward credentials or tokens')
        expect(instructions).toMatch(/Publication instructions:\nUse the published capabilities\.$/)
    })

    it('deduplicates provider guidance after higher-priority platform and Publication instructions', () => {
        const capability = toolCapability()
        capability.descriptorSnapshot.providerInstructions = 'Use indexed resources before search.'
        const duplicate = toolCapability()
        duplicate.descriptorSnapshot.providerInstructions = 'Use indexed resources before search.'
        const providerInstructions = mcpCapabilityProviderInstructions([capability, duplicate])
        const instructions = mcpPublicationInstructions('Only expose approved workspace data.', providerInstructions)

        expect(providerInstructions).toEqual([
            { label: 'third-party', instructions: 'Use indexed resources before search.' }
        ])
        expect(instructions.indexOf('Xpert-managed MCP publication')).toBeLessThan(
            instructions.indexOf('Publication instructions:')
        )
        expect(instructions.indexOf('Publication instructions:')).toBeLessThan(
            instructions.indexOf('Capability provider guidance')
        )
        expect(instructions.match(/Use indexed resources before search\./g)).toHaveLength(1)
    })

    it('caps aggregate provider guidance without truncating higher-priority instructions first', () => {
        const instructions = mcpPublicationInstructions('Administrator guidance.', [
            { label: 'provider-a', instructions: 'a'.repeat(8_000) },
            { label: 'provider-b', instructions: 'b'.repeat(8_000) }
        ])

        expect([...instructions]).toHaveLength(16_000)
        expect(instructions).toContain('Publication instructions:\nAdministrator guidance.')
        expect(instructions).toContain('[provider-a]')
        expect(instructions).toContain('[Provider guidance truncated by Xpert.]')
    })

    it('limits change subscriptions to capabilities visible to the authenticated principal', () => {
        expect(
            authorizedSubscriptionNotifications(
                {
                    toolsListChanged: true,
                    promptsListChanged: true,
                    resourcesListChanged: true,
                    resourceSubscriptions: [
                        'https://resources.example/report',
                        'https://resources.example/private',
                        'file:///etc/passwd'
                    ],
                    taskIds: ['task-1']
                },
                [toolCapability(), resourceCapability()]
            )
        ).toEqual({
            toolsListChanged: true,
            resourcesListChanged: true,
            resourceSubscriptions: ['https://resources.example/report'],
            taskIds: ['task-1']
        })
    })

    it('serves modern discovery and lists only bound generic capabilities', async () => {
        const discovery = await request('server/discover', {}, 1)
        expect(discovery.status).toBe(200)
        expect(discovery.body.result).toEqual(
            expect.objectContaining({
                resultType: 'complete',
                supportedVersions: expect.arrayContaining([MCP_PROTOCOL_VERSION])
            })
        )

        const listed = await request('tools/list', {}, 2)
        expect(listed.status).toBe(200)
        expect(listed.body.result.tools).toEqual([
            expect.objectContaining({ name: 'generic_search', description: 'Generic remote search' }),
            expect.objectContaining({ name: 'generic_write', description: 'Generic remote search' })
        ])
    })

    it('serves WorkBuddy-compatible 2025-era initialize, tool listing, and tool calls', async () => {
        const initialized = await legacyRequest(
            'initialize',
            {
                protocolVersion: WORKBUDDY_PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: { name: 'workbuddy', version: '1.0.0' }
            },
            101
        )

        expect(initialized.status).toBe(200)
        expect(initialized.body.result).toEqual(
            expect.objectContaining({
                protocolVersion: WORKBUDDY_PROTOCOL_VERSION,
                serverInfo: expect.objectContaining({ name: 'generic' })
            })
        )

        const listed = await legacyRequest('tools/list', {}, 102)
        expect(listed.status).toBe(200)
        expect(listed.body.result?.tools).toEqual([
            expect.objectContaining({ name: 'generic_search' }),
            expect.objectContaining({ name: 'generic_write' })
        ])

        const called = await legacyRequest('tools/call', { name: 'generic_search', arguments: { query: 'MCP' } }, 103)
        expect(called.status).toBe(200)
        expect(called.body.result?.content).toEqual([{ type: 'text', text: 'generic MCP result' }])
        expect(executeTool).toHaveBeenCalledWith(
            expect.objectContaining({ source: 'mcp', toolName: 'catalog-generic-search', arguments: { query: 'MCP' } })
        )
    })

    it('validates the modern Tasks extension envelope and stamps server identity on task results', async () => {
        const task = {
            resultType: 'complete' as const,
            taskId: 'task-1',
            status: 'completed' as const,
            createdAt: '2026-08-21T00:00:00.000Z',
            lastUpdatedAt: '2026-08-21T00:00:01.000Z',
            ttlMs: 60_000,
            result: { content: [{ type: 'text', text: 'done' }] }
        }
        getTask.mockResolvedValue(task)

        const missingCapability = await request('tasks/get', { taskId: 'task-1' }, 19, { name: 'task-1' })
        expect(missingCapability.body.error).toEqual(
            expect.objectContaining({ code: -32003, message: 'Missing required client capability' })
        )
        expect(getTask).not.toHaveBeenCalled()

        const wrongVersion = await request('tasks/get', { taskId: 'task-1' }, 20, {
            name: 'task-1',
            clientCapabilities: taskClientCapabilities(),
            metaProtocolVersion: '2025-11-25'
        })
        expect(wrongVersion.body.error).toEqual(expect.objectContaining({ code: -32602 }))
        expect(getTask).not.toHaveBeenCalled()

        const wrongHeaderVersion = await request('tasks/get', { taskId: 'task-1' }, 21, {
            name: 'task-1',
            clientCapabilities: taskClientCapabilities(),
            headerProtocolVersion: '2025-11-25'
        })
        expect(wrongHeaderVersion.body.error).toEqual(expect.objectContaining({ code: -32602 }))
        expect(getTask).not.toHaveBeenCalled()

        const accepted = await request('tasks/get', { taskId: 'task-1' }, 22, {
            name: 'task-1',
            clientCapabilities: taskClientCapabilities()
        })
        expect(accepted.body.result).toEqual(
            expect.objectContaining({
                ...task,
                _meta: {
                    [SERVER_INFO_META_KEY]: { name: 'generic', version: '1.0.0' }
                }
            })
        )
        expect(getTask).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'publication-1' }),
            expect.objectContaining({ subjectId: 'user-1' }),
            'task-1'
        )
    })

    it('streams authorized task status notifications and releases the subscription on disconnect', async () => {
        const task = {
            resultType: 'complete' as const,
            taskId: 'task-1',
            status: 'working' as const,
            createdAt: '2026-08-21T00:00:00.000Z',
            lastUpdatedAt: '2026-08-21T00:00:01.000Z',
            ttlMs: 60_000
        }
        getTask.mockResolvedValue(task)
        let notifyTask: ((taskId: string) => void) | undefined
        const unsubscribe = jest.fn()
        subscribeTasks.mockImplementation((_publicationId: string, listener: (taskId: string) => void) => {
            notifyTask = listener
            return unsubscribe
        })
        const body = modernRequestBody(
            'subscriptions/listen',
            {
                notifications: {
                    taskIds: ['task-1']
                }
            },
            24,
            taskClientCapabilities()
        )
        const nodeRequest = modernNodeRequest('subscriptions/listen')
        const nodeResponse = new MemoryResponse()

        const handling = runtime.handle(
            'generic',
            nodeRequest as unknown as Request,
            nodeResponse as unknown as Response,
            body
        )
        await waitUntil(() => nodeResponse.textBody().includes('notifications/subscriptions/acknowledged'))

        notifyTask?.('task-1')
        await waitUntil(() => nodeResponse.textBody().includes('notifications/tasks'))
        nodeResponse.emit('close')
        await handling

        expect(nodeResponse.textBody()).toContain('"method":"notifications/tasks"')
        expect(nodeResponse.textBody()).toContain('"taskId":"task-1"')
        expect(getTask).toHaveBeenCalledTimes(2)
        expect(subscribeTasks).toHaveBeenCalledWith('publication-1', expect.any(Function))
        expect(unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('reauthenticates a live subscription and closes it before emitting after credential revocation', async () => {
        getTask.mockResolvedValue({
            resultType: 'complete',
            taskId: 'task-1',
            status: 'working',
            createdAt: '2026-08-21T00:00:00.000Z',
            lastUpdatedAt: '2026-08-21T00:00:01.000Z',
            ttlMs: 60_000
        })
        subscribeTasks.mockReturnValue(jest.fn())
        authenticate.mockResolvedValueOnce(authenticatedPrincipal()).mockRejectedValueOnce(new UnauthorizedException())
        const body = modernRequestBody(
            'subscriptions/listen',
            {
                notifications: {
                    toolsListChanged: true,
                    taskIds: ['task-1']
                }
            },
            25,
            taskClientCapabilities()
        )
        const nodeResponse = new MemoryResponse()
        const handling = runtime.handle(
            'generic',
            modernNodeRequest('subscriptions/listen') as unknown as Request,
            nodeResponse as unknown as Response,
            body
        )
        await waitUntil(() => nodeResponse.textBody().includes('notifications/subscriptions/acknowledged'))

        bus.publish({ kind: 'tools_list_changed' })
        await handling

        expect(nodeResponse.writableEnded).toBe(true)
        expect(nodeResponse.textBody()).not.toContain('notifications/tools/list_changed')
        expect(nodeResponse.textBody()).toContain('"resultType":"complete"')
    })

    it('withholds a capability whose required organization context is unavailable', async () => {
        authenticate.mockResolvedValueOnce({ ...authenticatedPrincipal(), organizationId: undefined })
        resolveRuntimeCapabilities.mockResolvedValueOnce([toolCapability(), organizationRequiredToolCapability()])

        const listed = await request('tools/list', {}, 17)

        expect(listed.status).toBe(200)
        expect(listed.body.result.tools).toEqual([expect.objectContaining({ name: 'generic_search' })])
    })

    it('executes a published generic remote tool through the shared runtime and preserves rich results', async () => {
        const trace = jest.spyOn(applicationTracing, 'traceAsync')
        const called = await request('tools/call', { name: 'generic_search', arguments: { query: 'MCP' } }, 3, {
            name: 'generic_search'
        })

        expect(called.status).toBe(200)
        expect(called.body.result).toEqual(
            expect.objectContaining({
                content: [{ type: 'text', text: 'generic MCP result' }],
                structuredContent: { source: 'third-party' },
                resultType: 'complete',
                _meta: expect.objectContaining({ trace: 'preserved' })
            })
        )
        expect(executeTool).toHaveBeenCalledWith(
            expect.objectContaining({
                source: 'mcp',
                toolsetId: 'toolset-1',
                toolName: 'catalog-generic-search',
                serverName: 'third-party',
                remoteName: 'search',
                arguments: { query: 'MCP' },
                traceId: expect.stringMatching(/^[0-9a-f]{32}$/)
            })
        )
        expect(trace).toHaveBeenCalledWith(
            'mcp.request',
            expect.objectContaining({
                'mcp.method': 'tools/call',
                'mcp.publication.id': 'publication-1'
            }),
            expect.any(Function)
        )
        expect(trace).toHaveBeenCalledWith(
            'mcp.tool.call',
            expect.objectContaining({
                'mcp.publication.id': 'publication-1',
                'mcp.tool.name': 'generic_search'
            }),
            expect.any(Function)
        )
        expect(applicationMetrics.render()).toContain(
            'xpert_mcp_requests_total{auth_method="api_key",method="tools/call",publication_id="publication-1",status="success"} 1'
        )
        expect(applicationMetrics.render()).toContain(
            'xpert_mcp_tool_calls_total{auth_method="api_key",publication_id="publication-1",status="success",tool_name="generic_search"} 1'
        )
        trace.mockRestore()
    })

    it('requires signed multi-round-trip approval before executing confirm-mode tools', async () => {
        resolveRuntimeCapabilities.mockResolvedValue([writeToolCapability()])
        const clientCapabilities = { elicitation: { form: {} } }

        const requested = await request('tools/call', { name: 'generic_write', arguments: { query: 'MCP' } }, 28, {
            name: 'generic_write',
            clientCapabilities
        })

        expect(requested.body.result).toEqual(
            expect.objectContaining({
                resultType: 'input_required',
                inputRequests: {
                    input: expect.objectContaining({ method: 'elicitation/create' })
                },
                requestState: expect.any(String)
            })
        )
        expect(executeTool).not.toHaveBeenCalled()

        const requestState = requested.body.result?.requestState
        expect(typeof requestState).toBe('string')
        const tampered = await request(
            'tools/call',
            {
                name: 'generic_write',
                arguments: { query: 'MCP' },
                requestState: `${requestState}tampered`,
                inputResponses: { input: { action: 'accept', content: { approved: true } } }
            },
            29,
            { name: 'generic_write', clientCapabilities }
        )
        expect(tampered.body.error).toEqual(expect.objectContaining({ code: -32602 }))
        expect(executeTool).not.toHaveBeenCalled()

        const rejected = await request(
            'tools/call',
            {
                name: 'generic_write',
                arguments: { query: 'MCP' },
                requestState,
                inputResponses: { input: { action: 'accept', content: { approved: false } } }
            },
            30,
            { name: 'generic_write', clientCapabilities }
        )
        expect(rejected.body.result).toEqual(expect.objectContaining({ isError: true }))
        expect(executeTool).not.toHaveBeenCalled()

        const requestedAgain = await request('tools/call', { name: 'generic_write', arguments: { query: 'MCP' } }, 31, {
            name: 'generic_write',
            clientCapabilities
        })
        const approved = await request(
            'tools/call',
            {
                name: 'generic_write',
                arguments: { query: 'MCP' },
                requestState: requestedAgain.body.result?.requestState,
                inputResponses: { input: { action: 'accept', content: { approved: true } } }
            },
            32,
            { name: 'generic_write', clientCapabilities }
        )
        expect(approved.body.result).toEqual(expect.objectContaining({ resultType: 'complete' }))
        expect(executeTool).toHaveBeenCalledTimes(1)
        expect(executeTool).toHaveBeenCalledWith(
            expect.objectContaining({ toolName: 'catalog-generic-write', remoteName: 'write' })
        )
    })

    it('continues a valid incoming W3C trace context through the shared tool runtime', async () => {
        const traceId = '4bf92f3577b34da6a3ce929d0e0e4736'
        const traceparent = `00-${traceId}-00f067aa0ba902b7-01`
        const remoteContext = jest.spyOn(applicationTracing, 'withRemoteContext')

        const called = await request('tools/call', { name: 'generic_search', arguments: { query: 'MCP' } }, 18, {
            name: 'generic_search',
            traceparent,
            tracestate: 'vendor=value'
        })

        expect(called.status).toBe(200)
        expect(remoteContext).toHaveBeenCalledWith({ traceparent, tracestate: 'vendor=value' }, expect.any(Function))
        expect(executeTool).toHaveBeenCalledWith(expect.objectContaining({ traceId }))
        expect(auditStart).toHaveBeenCalledWith(expect.objectContaining({ traceId }))
        remoteContext.mockRestore()
    })

    it('continues W3C trace context from the modern MCP request metadata envelope', async () => {
        const traceId = '80f198ee56343ba864fe8b2a57d3eff7'
        const traceparent = `00-${traceId}-e457b5a2e4d86bd1-01`
        const remoteContext = jest.spyOn(applicationTracing, 'withRemoteContext')

        const called = await request('tools/call', { name: 'generic_search', arguments: { query: 'MCP' } }, 23, {
            name: 'generic_search',
            metaTraceparent: traceparent,
            metaTracestate: 'vendor=remote',
            metaBaggage: 'workspace.id=workspace-1'
        })

        expect(called.status).toBe(200)
        expect(remoteContext).toHaveBeenCalledWith(
            {
                traceparent,
                tracestate: 'vendor=remote',
                baggage: 'workspace.id=workspace-1'
            },
            expect.any(Function)
        )
        expect(executeTool).toHaveBeenCalledWith(expect.objectContaining({ traceId }))
        expect(auditStart).toHaveBeenCalledWith(expect.objectContaining({ traceId }))
        remoteContext.mockRestore()
    })

    it('requires App-linked tools to return both text fallback and structured content', async () => {
        resolveRuntimeCapabilities.mockResolvedValue([appToolCapability(), appCapability()])

        executeTool.mockResolvedValueOnce({ content: [{ type: 'text', text: 'Model fallback' }] })
        const missingStructured = await request(
            'tools/call',
            { name: 'generic_app_tool', arguments: { query: 'MCP' } },
            14,
            { name: 'generic_app_tool' }
        )
        expect(missingStructured.body.result).toEqual(
            expect.objectContaining({
                isError: true,
                content: [expect.objectContaining({ text: expect.stringContaining('structuredContent') })]
            })
        )

        executeTool.mockResolvedValueOnce({ structuredContent: { source: 'third-party' } })
        const missingFallback = await request(
            'tools/call',
            { name: 'generic_app_tool', arguments: { query: 'MCP' } },
            15,
            { name: 'generic_app_tool' }
        )
        expect(missingFallback.body.result).toEqual(
            expect.objectContaining({
                isError: true,
                content: [expect.objectContaining({ text: expect.stringContaining('non-empty text content') })]
            })
        )

        executeTool.mockResolvedValueOnce({
            content: [{ type: 'text', text: 'Model fallback' }],
            structuredContent: { source: 'third-party' }
        })
        const valid = await request('tools/call', { name: 'generic_app_tool', arguments: { query: 'MCP' } }, 16, {
            name: 'generic_app_tool'
        })
        expect(valid.body.result).toEqual(
            expect.objectContaining({
                content: [{ type: 'text', text: 'Model fallback' }],
                structuredContent: { source: 'third-party' },
                _meta: expect.objectContaining({
                    ui: { resourceUri: 'ui://xpert/publication-1/plugin/catalog-app' }
                })
            })
        )
    })

    it('publishes app-only tools with visibility metadata while keeping them callable by the App host', async () => {
        resolveRuntimeCapabilities.mockResolvedValue([appOnlyToolCapability(), appCapability()])
        executeTool.mockResolvedValueOnce({
            content: [{ type: 'text', text: 'App refresh complete' }],
            structuredContent: { refreshed: true }
        })

        const listed = await request('tools/list', {}, 26)
        expect(listed.body.result?.tools).toEqual([
            expect.objectContaining({
                name: 'generic_app_refresh',
                _meta: {
                    ui: {
                        resourceUri: 'ui://xpert/publication-1/plugin/catalog-app',
                        visibility: ['app']
                    }
                }
            })
        ])

        const called = await request(
            'tools/call',
            { name: 'generic_app_refresh', arguments: { query: 'refresh' } },
            27,
            { name: 'generic_app_refresh' }
        )
        expect(called.body.result).toEqual(
            expect.objectContaining({
                content: [{ type: 'text', text: 'App refresh complete' }],
                structuredContent: { refreshed: true }
            })
        )
        expect(executeTool).toHaveBeenCalledWith(
            expect.objectContaining({ toolName: 'catalog-app-refresh', remoteName: 'app_refresh' })
        )
    })

    it('rejects oversized tool arguments before execution and oversized results before serialization', async () => {
        const oversized = 'x'.repeat(2 * 1024 * 1024)
        const input = await request('tools/call', { name: 'generic_search', arguments: { query: oversized } }, 4, {
            name: 'generic_search'
        })
        expect(input.body.result).toEqual(
            expect.objectContaining({
                isError: true,
                content: [expect.objectContaining({ text: expect.stringContaining('exceeds the 2 MiB limit') })]
            })
        )
        expect(executeTool).not.toHaveBeenCalled()

        executeTool.mockResolvedValueOnce({ content: [{ type: 'text', text: oversized }] })
        const output = await request('tools/call', { name: 'generic_search', arguments: { query: 'MCP' } }, 5, {
            name: 'generic_search'
        })
        expect(output.body.result).toEqual(
            expect.objectContaining({
                isError: true,
                content: [expect.objectContaining({ text: expect.stringContaining('exceeds the 2 MiB limit') })]
            })
        )
    })

    it('publishes resources, prompts, and completion through the shared runtime', async () => {
        resolveRuntimeCapabilities.mockResolvedValue([resourceCapability(), promptCapability()])
        executeMcpResource.mockResolvedValue({
            contents: [{ uri: 'https://resources.example/report', mimeType: 'text/plain', text: 'report body' }]
        })
        executeMcpPrompt.mockResolvedValue({
            description: 'Prepared summary',
            messages: [{ role: 'user', content: { type: 'text', text: 'Summarize MCP' } }]
        })
        completeMcpCapability.mockResolvedValue({ values: ['MCP', 'MCP Apps'], total: 2 })

        const resources = await request('resources/list', {}, 6)
        expect(resources.body.result.resources).toEqual([
            expect.objectContaining({ uri: 'https://resources.example/report', name: 'report' })
        ])
        const resource = await request('resources/read', { uri: 'https://resources.example/report' }, 7, {
            name: 'https://resources.example/report'
        })
        expect(resource.body.result.contents).toEqual([
            expect.objectContaining({ uri: 'https://resources.example/report', text: 'report body' })
        ])
        expect(executeMcpResource).toHaveBeenCalledWith(
            expect.objectContaining({
                source: 'mcp',
                toolsetId: 'toolset-1',
                capabilityKey: 'catalog-report',
                remoteName: 'report'
            })
        )

        const prompts = await request('prompts/list', {}, 8)
        expect(prompts.body.result.prompts).toEqual([
            expect.objectContaining({ name: 'summary_prompt', description: 'Prepare a summary' })
        ])
        const prompt = await request('prompts/get', { name: 'summary_prompt', arguments: { topic: 'MCP' } }, 9, {
            name: 'summary_prompt'
        })
        expect(prompt.body.result.messages).toEqual([
            { role: 'user', content: { type: 'text', text: 'Summarize MCP' } }
        ])
        expect(executeMcpPrompt).toHaveBeenCalledWith(
            expect.objectContaining({ capabilityKey: 'catalog-summary', arguments: { topic: 'MCP' } })
        )

        auditStart.mockClear()
        auditSucceeded.mockClear()
        const completion = await request(
            'completion/complete',
            {
                ref: { type: 'ref/prompt', name: 'summary_prompt' },
                argument: { name: 'topic', value: 'MC' }
            },
            10
        )
        expect(completion.body.result.completion).toEqual({ values: ['MCP', 'MCP Apps'], total: 2, hasMore: false })
        expect(auditStart).toHaveBeenCalledWith(
            expect.objectContaining({
                capability: expect.objectContaining({ capabilityKey: 'catalog-summary' }),
                arguments: {
                    referenceType: 'prompt',
                    argumentName: 'topic',
                    contextArgumentNames: []
                }
            })
        )
        expect(auditSucceeded).toHaveBeenCalledWith(expect.objectContaining({ id: 'audit-1' }), expect.any(Number))
    })

    it('applies capability rate limiting and invocation audit to local App bundle reads', async () => {
        resolveRuntimeCapabilities.mockResolvedValue([appCapability()])
        readAppBundle.mockResolvedValue({
            uri: 'ui://xpert/publication-1/plugin/catalog-app',
            mimeType: 'text/html;profile=mcp-app',
            text: '<main>App</main>'
        })

        const response = await request('resources/read', { uri: 'ui://xpert/publication-1/plugin/catalog-app' }, 18, {
            name: 'ui://xpert/publication-1/plugin/catalog-app'
        })

        expect(response.body.result.contents).toEqual([
            expect.objectContaining({ uri: 'ui://xpert/publication-1/plugin/catalog-app', text: '<main>App</main>' })
        ])
        expect(assertWithinLimit).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'publication-1' }),
            expect.objectContaining({ subjectId: 'user-1' }),
            expect.objectContaining({ id: 'capability-app' })
        )
        expect(auditStart).toHaveBeenCalledWith(
            expect.objectContaining({
                capability: expect.objectContaining({ id: 'capability-app' }),
                arguments: { uri: 'ui://xpert/publication-1/plugin/catalog-app' }
            })
        )
        expect(auditSucceeded).toHaveBeenCalled()
    })

    it('audits a capability invocation rejected by its rate limit', async () => {
        assertWithinLimit.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('rate limit exceeded'))

        const called = await request('tools/call', { name: 'generic_search', arguments: { query: 'MCP' } }, 27, {
            name: 'generic_search'
        })

        expect(called.body.result).toEqual(expect.objectContaining({ isError: true }))
        expect(auditStart).toHaveBeenCalledWith(
            expect.objectContaining({
                capability: expect.objectContaining({ capabilityKey: 'catalog-generic-search' })
            })
        )
        expect(auditFailed).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'audit-1' }),
            expect.any(Number),
            expect.objectContaining({ message: 'rate limit exceeded' })
        )
    })

    it('rejects unsafe resource links and oversized prompt or completion results', async () => {
        resolveRuntimeCapabilities.mockResolvedValue([toolCapability(), promptCapability()])
        executeTool.mockResolvedValueOnce({
            content: [{ type: 'resource_link', uri: 'javascript:alert(1)', name: 'unsafe' }]
        })
        const unsafe = await request('tools/call', { name: 'generic_search', arguments: { query: 'MCP' } }, 11, {
            name: 'generic_search'
        })
        expect(unsafe.body.result).toEqual(
            expect.objectContaining({
                isError: true,
                content: [
                    expect.objectContaining({ text: expect.stringContaining("scheme 'javascript:' is not allowed") })
                ]
            })
        )

        executeTool.mockResolvedValueOnce({
            content: [
                {
                    type: 'resource_link',
                    uri: 'https://resources.example/%252e%252e/secrets',
                    name: 'double-encoded-traversal'
                }
            ]
        })
        const traversal = await request('tools/call', { name: 'generic_search', arguments: { query: 'MCP' } }, 111, {
            name: 'generic_search'
        })
        expect(traversal.body.result).toEqual(
            expect.objectContaining({
                isError: true,
                content: [expect.objectContaining({ text: expect.stringContaining('directory traversal') })]
            })
        )

        executeMcpPrompt.mockResolvedValueOnce({
            messages: [{ role: 'assistant', content: { type: 'text', text: 'x'.repeat(2 * 1024 * 1024) } }]
        })
        const prompt = await request('prompts/get', { name: 'summary_prompt', arguments: {} }, 12, {
            name: 'summary_prompt'
        })
        expect(prompt.body.error).toEqual(expect.objectContaining({ code: expect.any(Number) }))

        completeMcpCapability.mockResolvedValueOnce({ values: ['x'.repeat(2 * 1024 * 1024)] })
        const completion = await request(
            'completion/complete',
            {
                ref: { type: 'ref/prompt', name: 'summary_prompt' },
                argument: { name: 'topic', value: 'MCP' }
            },
            13
        )
        expect(completion.body.error).toEqual(expect.objectContaining({ code: expect.any(Number) }))
    })

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
        await runtime.handle('generic', nodeRequest as unknown as Request, nodeResponse as unknown as Response, body)
        return { status: nodeResponse.statusCode, body: nodeResponse.jsonBody() }
    }

    async function legacyRequest(method: string, params: object, id: number) {
        const body = { jsonrpc: '2.0', id, method, params }
        const nodeRequest = legacyNodeRequest(method)
        const nodeResponse = new MemoryResponse()
        await runtime.handle('generic', nodeRequest as unknown as Request, nodeResponse as unknown as Response, body)
        return { status: nodeResponse.statusCode, body: nodeResponse.mcpBody() }
    }
})

class MemoryResponse extends EventEmitter {
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

function modernRequestBody(
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

function modernNodeRequest(
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

function legacyNodeRequest(method: string) {
    const requestHeaders: Record<string, string> = {
        authorization: 'Bearer xpert_mcp_test',
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-method': method
    }
    if (method !== 'initialize') requestHeaders['mcp-protocol-version'] = WORKBUDDY_PROTOCOL_VERSION
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

async function waitUntil(predicate: () => boolean) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (predicate()) return
        await new Promise<void>((resolve) => setImmediate(resolve))
    }
    throw new Error('Timed out waiting for MCP stream output')
}

function publication(): McpPublication {
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

function taskClientCapabilities() {
    return { extensions: { [MCP_TASK_EXTENSION_ID]: {} } }
}

function authenticatedPrincipal() {
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

function toolCapability(): McpPublicationCapability {
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

function organizationRequiredToolCapability(): McpPublicationCapability {
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

function writeToolCapability(): McpPublicationCapability {
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

function appToolCapability(): McpPublicationCapability {
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

function appOnlyToolCapability(): McpPublicationCapability {
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

function appCapability(): McpPublicationCapability {
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

function dangerousToolCapability(): McpPublicationCapability {
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

function resourceCapability(): McpPublicationCapability {
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

function promptCapability(): McpPublicationCapability {
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
