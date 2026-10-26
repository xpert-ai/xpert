import express from 'express'
import { createServer } from 'node:http'
import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { InMemoryServerEventBus } from '@modelcontextprotocol/server'
import { Test } from '@nestjs/testing'
import type { RedisClientType } from 'redis'
import { DataSource } from 'typeorm'
import { McpConsumer } from '../../mcp-consumer'
import { LangChainMcpConnection } from '../../connection/langchain-mcp-connection'
import { until } from '../../../mcp-publication/testing/harness'
import { publisherHarness } from '../../../mcp-publication/testing/harness'
import { capability, publication, principal, createTaskSubscriptions } from '../../../mcp-publication/testing/fixtures'
import { McpPublicationRuntimeService } from '../../../mcp-publication/mcp-publication-runtime.service'
import { McpPublicationService } from '../../../mcp-publication/mcp-publication.service'
import { McpAuthenticationService } from '../../../mcp-publication/mcp-authentication.service'
import { McpPublicationAuthorizationService } from '../../../mcp-publication/mcp-publication-authorization.service'
import { McpRateLimitService } from '../../../mcp-publication/mcp-rate-limit.service'
import { McpInvocationAuditService } from '../../../mcp-publication/mcp-invocation-audit.service'
import { McpAppBundleService } from '../../../mcp-publication/mcp-app-bundle.service'
import { McpElicitationService } from '../../../mcp-publication/mcp-elicitation.service'
import { McpTaskService } from '../../../mcp-publication/mcp-task.service'
import { McpSubscriptionService } from '../../../mcp-publication/mcp-subscription.service'
import { ToolRuntimeService } from '../../../tool-runtime'
import { requestMcpControl } from '../mcp-control.client'
import { McpOperationStore } from '../mcp-operation.store'
import { McpOperationService } from '../mcp-operation.service'
import { McpOperationTransport } from '../mcp-operation.transport'
import { McpRemoteOperation } from '../mcp-operation.entity'

// Real HTTP and production protocol/client/store. Authentication and tool side effects are isolated fixtures.
export async function httpPair(db: DataSource) {
    const publisher = publisherHarness(db)
    const tool = capability()
    tool.enabled = true
    if (tool.descriptorSnapshot.capabilityType !== 'tool') throw new Error('Expected tool fixture')
    tool.descriptorSnapshot.defaultApprovalMode = 'allow'
    tool.descriptorSnapshot.requiredContext = ['principal', 'execution']
    const bus = new InMemoryServerEventBus()
    const module = await Test.createTestingModule({
        providers: [
            McpPublicationRuntimeService,
            {
                provide: McpPublicationService,
                useValue: {
                    findActiveBySlug: async () => publication(),
                    resolveRuntimeCapabilities: async () => [tool]
                }
            },
            {
                provide: McpAuthenticationService,
                useValue: { authenticate: async () => ({ ...principal(), scopes: ['tools:list', 'tools:call'] }) }
            },
            { provide: McpPublicationAuthorizationService, useValue: { assertCanRun: async () => undefined } },
            { provide: McpRateLimitService, useValue: { assertWithinLimit: async () => undefined } },
            {
                provide: McpInvocationAuditService,
                useValue: {
                    start: async () => ({ id: 'fixture' }),
                    succeeded: async () => undefined,
                    failed: async () => undefined
                }
            },
            { provide: ToolRuntimeService, useValue: publisher.runtime },
            { provide: McpAppBundleService, useValue: { resourceUri: () => undefined } },
            { provide: McpElicitationService, useValue: new McpElicitationService({} as RedisClientType) },
            { provide: McpTaskService, useValue: publisher.service },
            {
                provide: McpSubscriptionService,
                useValue: {
                    ...createTaskSubscriptions(),
                    bus: () => bus,
                    subscribeAccessInvalidations: () => () => undefined
                }
            }
        ]
    }).compile()
    const runtime = module.get(McpPublicationRuntimeService)
    const requests: string[] = []
    const faults = { loseStartReply: false, failControl: 0, noExtension: false, directResult: false }
    const app = express().use(express.json())
    app.post('/mcp', async (req, res) => {
        requests.push(req.body.method)
        if (req.body.method === 'xpert/tasks/control' && faults.failControl-- > 0) {
            res.status(503).end()
            return
        }
        if (req.body.method === 'server/discover' && faults.noExtension) {
            res.json({
                jsonrpc: '2.0',
                id: req.body.id,
                result: {
                    supportedVersions: ['2026-07-28'],
                    capabilities: { tools: {}, extensions: { 'io.modelcontextprotocol/tasks': {} } }
                }
            })
            return
        }
        if (req.body.method === 'tools/call' && faults.directResult) {
            res.json({
                jsonrpc: '2.0',
                id: req.body.id,
                result: { resultType: 'complete', content: [{ type: 'text', text: 'direct' }] }
            })
            return
        }
        if (req.body.method === 'tools/call' && faults.loseStartReply) {
            const json = res.json.bind(res)
            res.json = (body) => {
                if (body.result?.resultType === 'task') {
                    res.destroy()
                    return res
                }
                return json(body)
            }
        }
        try {
            await runtime.handle('test-publication', req, res, req.body)
        } catch (error) {
            console.warn('fixture runtime error', error)
            if (!res.headersSent) res.status(500).end()
        }
    })
    const server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing fixture port')
    const adapter = new MultiServerMCPClient({
        mcpServers: { fixture: { transport: 'http', url: `http://127.0.0.1:${address.port}/mcp` } }
    })
    const connection = new LangChainMcpConnection(adapter)
    try {
        await connection.negotiateHttpProtocols()
    } catch (error) {
        publisher.close()
        await module.close()
        await adapter.close()
        server.closeAllConnections()
        server.close()
        throw error
    }
    const consumer = new McpConsumer(connection)
    const scope = {
        actor: {
            tenantId: publication().tenantId,
            organizationId: publication().organizationId,
            userId: principal().subjectId
        },
        workspaceId: '10000000-0000-4000-8000-000000000004',
        toolsetId: tool.toolsetId,
        serverName: 'fixture'
    }
    const transport = Object.create(McpOperationTransport.prototype) as McpOperationTransport
    transport.prepare = async () => ({ scope, connectionVersion: 'a'.repeat(64), reconnectable: true })
    transport.assertOriginal = async () => undefined
    transport.terminate = async (row) => (await requestMcpControl(consumer, row, 'terminate')).receipt
    transport.withConnection = async (_row, work) => work(consumer)
    const operationStore = new McpOperationStore(db.getRepository(McpRemoteOperation), publisher.controls)
    const operations = new McpOperationService(operationStore, transport)
    const waitController = new AbortController()
    const input = {
        connectionVersion: 'a'.repeat(64),
        signal: waitController.signal,
        consumer,
        toolsetId: scope.toolsetId,
        toolName: tool.publicName,
        serverName: 'fixture',
        arguments: { value: 'original' },
        mode: 'task' as const,
        operationKey: 'test-call'
    }
    return {
        endpoint: `http://127.0.0.1:${address.port}/mcp`,
        scope,
        publisher,
        consumer,
        operations,
        operationStore,
        transport,
        input,
        requests,
        faults,
        close: async () => {
            waitController.abort()
            operations.onModuleDestroy()
            publisher.close()
            await module.close()
            await adapter.close()
            server.closeAllConnections()
            await new Promise<void>((resolve) => server.close(() => resolve()))
        }
    }
}
