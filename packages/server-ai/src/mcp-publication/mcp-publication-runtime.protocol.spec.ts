jest.mock('../tool-runtime', () => ({ ToolRuntimeService: class ToolRuntimeService {} }))

import { InMemoryServerEventBus, SERVER_INFO_META_KEY } from '@modelcontextprotocol/server'
import { MCP_PROTOCOL_VERSION, MCP_TASK_EXTENSION_ID, MCP_EXECUTION_CONTROL_EXTENSION_ID } from '@xpert-ai/contracts'
import { UnauthorizedException } from '@nestjs/common'
import type { Request, Response } from 'express'
import { applicationMetrics } from '../metrics'
import { applicationTracing } from '../tracing/application-tracing'
import { ToolRuntimeService } from '../tool-runtime'
import { McpPublicationRuntimeService } from './mcp-publication-runtime.service'

import {
    createRuntimeFixture,
    waitUntil,
    createProtocolClient,
    LEGACY_MCP_PROTOCOL_VERSION,
    MemoryResponse,
    modernRequestBody,
    modernNodeRequest,
    publication,
    taskClientCapabilities,
    authenticatedPrincipal,
    toolCapability,
    organizationRequiredToolCapability,
    writeToolCapability,
    appToolCapability,
    appOnlyToolCapability,
    appCapability,
    dangerousToolCapability,
    resourceCapability,
    promptCapability
} from './testing/runtime-protocol-fixture'

describe('McpPublicationRuntimeService protocol', () => {
    const { request, legacyRequest } = createProtocolClient(() => runtime)
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
        ;({
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
        } = await createRuntimeFixture())
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

    it('preserves required-task discovery through the real 2026 SDK wire codec', async () => {
        const capability = toolCapability()
        if (capability.descriptorSnapshot.capabilityType !== 'tool') throw new Error('Expected tool')
        capability.descriptorSnapshot.taskMode = 'required'
        resolveRuntimeCapabilities.mockResolvedValueOnce([capability])
        const listed = await request('tools/list', {}, 27)
        expect(listed.status).toBe(200)
        // 2026 removed top-level execution; the negotiated Xpert extension remains on the wire.
        expect(Reflect.get(listed.body.result.tools[0], 'execution')).toBeUndefined()
        expect(Reflect.get(listed.body.result.tools[0], '_meta')?.[MCP_EXECUTION_CONTROL_EXTENSION_ID]).toEqual({
            version: 1,
            taskSupport: 'required'
        })
    })

    it('returns a task handle before validating the eventual tool output', async () => {
        const capability = toolCapability()
        if (capability.descriptorSnapshot.capabilityType !== 'tool') throw new Error('Expected tool')
        capability.descriptorSnapshot.taskMode = 'required'
        capability.descriptorSnapshot.outputSchema = {
            type: 'object',
            properties: { complete: { type: 'boolean' } },
            required: ['complete']
        }
        resolveRuntimeCapabilities.mockResolvedValue([capability])
        const started = await request('tools/call', { name: 'generic_search', arguments: { query: 'work' } }, 28, {
            name: 'generic_search',
            clientCapabilities: { extensions: { [MCP_TASK_EXTENSION_ID]: {} } }
        })
        expect(started.body.result).toMatchObject({ resultType: 'task', taskId: 'task-started' })
        expect(started.body.result.isError).not.toBe(true)
        expect(executeTool).not.toHaveBeenCalled()
    })

    it('keeps required-task discovery for legacy clients', async () => {
        const capability = toolCapability()
        if (capability.descriptorSnapshot.capabilityType !== 'tool') throw new Error('Expected tool')
        capability.descriptorSnapshot.taskMode = 'required'
        resolveRuntimeCapabilities.mockResolvedValueOnce([capability])
        const listed = await legacyRequest('tools/list', {}, 29)
        expect(Reflect.get(listed.body.result.tools[0], 'execution')).toEqual({ taskSupport: 'required' })
    })

    it('serves 2025-era MCP initialize, tool listing, and tool calls', async () => {
        const initialized = await legacyRequest(
            'initialize',
            {
                protocolVersion: LEGACY_MCP_PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: { name: 'generic-mcp-client', version: '1.0.0' }
            },
            101
        )

        expect(initialized.status).toBe(200)
        expect(initialized.body.result).toEqual(
            expect.objectContaining({
                protocolVersion: LEGACY_MCP_PROTOCOL_VERSION,
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

    it.each([writeToolCapability, dangerousToolCapability])(
        'executes application-authorized tools on a legacy connection without elicitation',
        async (factory) => {
            const capability = factory()
            if (capability.descriptorSnapshot.capabilityType !== 'tool') throw new Error('Expected tool')
            capability.policy = null
            capability.descriptorSnapshot.defaultApprovalMode = 'allow'
            resolveRuntimeCapabilities.mockResolvedValue([capability])
            const result = await legacyRequest(
                'tools/call',
                { name: capability.publicName, arguments: { query: 'MCP' } },
                104
            )
            expect(result.body.error).toBeUndefined()
            expect(result.body.result?.isError).not.toBe(true)
            expect(result.body.result).not.toHaveProperty('inputRequests')
            expect(executeTool).toHaveBeenCalledTimes(1)
        }
    )

    it.each(['confirm', 'deny'] as const)(
        'keeps an administrator %s override above the application default',
        async (approvalMode) => {
            const capability = writeToolCapability()
            if (capability.descriptorSnapshot.capabilityType !== 'tool') throw new Error('Expected tool')
            capability.descriptorSnapshot.defaultApprovalMode = 'allow'
            capability.policy = { approvalMode }
            resolveRuntimeCapabilities.mockResolvedValue([capability])
            const result = await request('tools/call', { name: 'generic_write', arguments: { query: 'MCP' } }, 105, {
                name: 'generic_write',
                clientCapabilities: { elicitation: { form: {} } }
            })
            expect(executeTool).not.toHaveBeenCalled()
            if (approvalMode === 'confirm') expect(result.body.result?.resultType).toBe('input_required')
            else expect(result.body.error ?? result.body.result?.isError).toBeTruthy()
        }
    )

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

    it('rejects an expired confirmation before executing the tool', async () => {
        resolveRuntimeCapabilities.mockResolvedValue([writeToolCapability()])
        const clientCapabilities = { elicitation: { form: {} } }
        const requested = await request('tools/call', { name: 'generic_write', arguments: { query: 'MCP' } }, 33, {
            name: 'generic_write',
            clientCapabilities
        })
        const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60 * 1000)
        try {
            const expired = await request(
                'tools/call',
                {
                    name: 'generic_write',
                    arguments: { query: 'MCP' },
                    requestState: requested.body.result?.requestState,
                    inputResponses: { input: { action: 'accept', content: { approved: true } } }
                },
                34,
                { name: 'generic_write', clientCapabilities }
            )
            expect(expired.body.error).toEqual(expect.objectContaining({ code: expect.any(Number) }))
            expect(executeTool).not.toHaveBeenCalled()
        } finally {
            clock.mockRestore()
        }
    })

    it('resumes a provider confirmation after the publication approval without accepting changed input', async () => {
        resolveRuntimeCapabilities.mockResolvedValue([writeToolCapability()])
        const clientCapabilities = { elicitation: { form: {} } }
        const args = { name: 'generic_write', arguments: { query: 'MCP' } }
        const options = { name: 'generic_write', clientCapabilities }
        const previousImplementation = executeTool.getMockImplementation()
        executeTool.mockImplementation(async (input) => {
            await input.host.input.request({
                type: 'form',
                title: 'Publish drawing at revision 4',
                schema: { type: 'object', properties: { confirmed: { type: 'boolean' } }, required: ['confirmed'] }
            })
            return { content: [{ type: 'text', text: 'Confirmed' }] }
        })
        const first = await request('tools/call', args, 101, options)
        const second = await request(
            'tools/call',
            {
                ...args,
                requestState: first.body.result?.requestState,
                inputResponses: { input: { action: 'accept', content: { approved: true } } }
            },
            102,
            options
        )
        expect(second.body.result?.resultType).toBe('input_required')
        expect(second.body.result?.inputRequests).toEqual(
            expect.objectContaining({
                input: expect.objectContaining({
                    params: expect.objectContaining({ message: 'Publish drawing at revision 4' })
                })
            })
        )
        const changed = await request(
            'tools/call',
            {
                ...args,
                arguments: { query: 'different drawing' },
                requestState: second.body.result?.requestState,
                inputResponses: { input: { action: 'accept', content: { confirmed: true } } }
            },
            103,
            options
        )
        expect(changed.body.result?.isError).toBe(true)
        const final = await request(
            'tools/call',
            {
                ...args,
                requestState: second.body.result?.requestState,
                inputResponses: { input: { action: 'accept', content: { confirmed: true } } }
            },
            104,
            options
        )
        expect(final.body.result?.resultType).toBe('complete')
        expect(final.body.result?.isError).not.toBe(true)
        executeTool.mockImplementation(previousImplementation)
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

    it('accepts declared minimal receipts and still rejects output outside the schema', async () => {
        const capability = toolCapability()
        if (capability.descriptorSnapshot.capabilityType !== 'tool') throw new Error('Invalid test fixture')
        capability.descriptorSnapshot.outputSchema = {
            type: 'object',
            anyOf: [
                {
                    type: 'object',
                    required: ['source'],
                    properties: { source: { type: 'string' } },
                    additionalProperties: false
                },
                {
                    type: 'object',
                    required: ['resultStatus', 'operationId'],
                    properties: { resultStatus: { const: 'unavailable' }, operationId: { type: 'string' } },
                    additionalProperties: false
                }
            ]
        }
        resolveRuntimeCapabilities.mockResolvedValue([capability])
        const receipt = { resultStatus: 'unavailable', operationId: 'op' }
        executeTool.mockResolvedValueOnce({
            content: [{ type: 'text', text: JSON.stringify(receipt) }],
            structuredContent: receipt
        })
        const result = await legacyRequest(
            'tools/call',
            { name: capability.publicName, arguments: { query: 'MCP' } },
            200
        )
        expect(result.body.result).toMatchObject({ structuredContent: receipt })
        expect(result.body.result.isError).not.toBe(true)
        executeTool.mockResolvedValueOnce({
            content: [{ type: 'text', text: '{}' }],
            structuredContent: { resultStatus: 'unavailable', privateData: 'secret' }
        })
        const rejected = await legacyRequest(
            'tools/call',
            { name: capability.publicName, arguments: { query: 'MCP' } },
            201
        )
        expect(rejected.body.result.isError).toBe(true)
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
})
