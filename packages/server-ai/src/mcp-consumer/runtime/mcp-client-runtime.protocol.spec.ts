import { createServer } from 'node:http'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { MCP_PROTOCOL_VERSION, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { RequestContext, type McpClientScope } from '@xpert-ai/plugin-sdk'
import { environment } from '@xpert-ai/server-config'
import { ToolRuntimeService } from '../../tool-runtime'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { MCPToolset } from '../../xpert-toolset/provider/mcp/mcp-toolset'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { McpClientConnectionService } from './mcp-client-connection.service'
import { McpClientRuntimeService } from './mcp-client-runtime.service'

// Exercise the existing client/connection/tool filtering over real HTTP, without replacing fetch.
describe('MCP read-only protocol integration', () => {
    it.each([
        { modern: true, serverKey: 'business' },
        { modern: false, serverKey: 'business' },
        { modern: false, serverKey: '' }
    ])(
        'uses a saved MCP connection for discovery, filters, refresh and revocation (modern=$modern, key=$serverKey)',
        async ({ modern, serverKey }) => {
            const actor = {
                tenantId: '00000000-0000-4000-8000-000000000001',
                organizationId: '00000000-0000-4000-8000-000000000002',
                userId: '00000000-0000-4000-8000-000000000003'
            }
            const input: McpClientScope = {
                actor,
                workspaceId: '00000000-0000-4000-8000-000000000004',
                toolsetId: '00000000-0000-4000-8000-000000000005',
                serverName: serverKey || 'Existing MCP connection',
                signal: new AbortController().signal,
                deadlineAt: Date.now() + 10000
            }
            jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
            jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
            jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
            const calls: Array<{ method: string; arguments?: object; authenticated: boolean }> = []
            let amount = '10.00'
            const server = createServer(async (req, res) => {
                if (req.method !== 'POST') {
                    res.writeHead(405).end()
                    return
                }
                const chunks: Buffer[] = []
                for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
                const envelope: {
                    id: string
                    method: string
                    params: { name?: string; arguments?: { region: string | null } }
                } = JSON.parse(Buffer.concat(chunks).toString())
                const params = envelope.params ?? {}
                calls.push({
                    method: envelope.method,
                    arguments: params.arguments,
                    authenticated: req.headers.authorization === 'Bearer local-fixture-only'
                })
                if (envelope.method.startsWith('notifications/')) {
                    res.writeHead(202).end()
                    return
                }
                if (envelope.method === 'server/discover' && !modern) {
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    res.end(
                        JSON.stringify({
                            jsonrpc: '2.0',
                            id: envelope.id,
                            error: { code: -32601, message: 'Method not found' }
                        })
                    )
                    return
                }
                const tools = [
                    {
                        name: 'sales',
                        description: 'Net sales',
                        annotations: { readOnlyHint: true },
                        inputSchema: {
                            type: 'object',
                            properties: { region: { type: ['string', 'null'] } },
                            required: ['region'],
                            additionalProperties: false
                        }
                    }
                ]
                const rows = ['East', 'West']
                    .filter((region) => !params.arguments?.region || params.arguments.region === region)
                    .map((region) => ({ region, amount }))
                const result =
                    envelope.method === 'server/discover'
                        ? { supportedVersions: [MCP_PROTOCOL_VERSION], capabilities: { tools: {} } }
                        : envelope.method === 'initialize'
                          ? {
                                protocolVersion: '2025-03-26',
                                capabilities: { tools: {} },
                                serverInfo: { name: 'fixture', version: '1' }
                            }
                          : envelope.method === 'tools/list'
                            ? { tools }
                            : modern
                              ? { content: [], structuredContent: { rows } }
                              : { content: [{ type: 'text', text: JSON.stringify({ rows }) }] }
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ jsonrpc: '2.0', id: envelope.id, result }))
            })
            await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
            const address = server.address()
            if (!address || typeof address === 'string') throw new Error('Missing fixture port')
            const saved = Object.assign(new XpertToolset(), {
                id: input.toolsetId,
                name: 'Existing MCP connection',
                category: XpertToolsetCategoryEnum.MCP,
                ...actor,
                workspaceId: input.workspaceId,
                tools: [],
                options: { disableToolDefault: false },
                schema: JSON.stringify({
                    mcpServers: {
                        [serverKey]: {
                            type: 'http',
                            url: `http://127.0.0.1:${address.port}/mcp`,
                            headers: { Authorization: 'Bearer local-fixture-only' }
                        }
                    }
                })
            })
            const loader = {
                loadToolsets: jest.fn(async (scope) => [
                    new MCPToolset(saved, { ...scope, userId: scope.principal.userId, env: {} })
                ])
            }
            const module = await Test.createTestingModule({
                providers: [
                    McpClientRuntimeService,
                    McpClientConnectionService,
                    { provide: ToolRuntimeService, useValue: loader },
                    { provide: XpertWorkspaceAccessService, useValue: { assertCanRead: jest.fn(async () => ({})) } },
                    { provide: getRepositoryToken(XpertToolset), useValue: { findOne: jest.fn(async () => saved) } }
                ]
            }).compile()
            const pro = environment.pro
            environment.pro = false
            try {
                const runtime = module.get(McpClientRuntimeService),
                    [tool] = await runtime.tools.list(input)
                const query = async (request: Parameters<McpClientRuntimeService['tools']['call']>[1]) => {
                    const result = await runtime.tools.call(input, request)
                    return modern ? result.structuredContent : JSON.parse(result.text[0])
                }
                const request = { toolName: 'sales', contractHash: tool.contractHash, arguments: { region: null } }
                expect(await query(request)).toEqual({
                    rows: [
                        { region: 'East', amount },
                        { region: 'West', amount }
                    ]
                })
                request.arguments.region = 'West'
                expect(await query(request)).toEqual({
                    rows: [{ region: 'West', amount }]
                })
                amount = '20.00'
                expect(await query(JSON.parse(JSON.stringify(request)))).toEqual({
                    rows: [{ region: 'West', amount }]
                })
                saved.options.disableToolDefault = true
                const callCount = calls.filter((call) => call.method === 'tools/call').length
                await expect(runtime.tools.call(input, request)).rejects.toThrow()
                expect(calls.filter((call) => call.method === 'tools/call')).toHaveLength(callCount)
                expect(calls.every((call) => call.authenticated)).toBe(true)
                expect(loader.loadToolsets.mock.calls.every(([scope]) => scope.principal.userId === actor.userId)).toBe(
                    true
                )
            } finally {
                environment.pro = pro
                jest.restoreAllMocks()
                await module.close()
                server.closeAllConnections()
                await new Promise<void>((resolve, reject) =>
                    server.close((error) => (error ? reject(error) : resolve()))
                )
            }
        },
        15000
    )
})
