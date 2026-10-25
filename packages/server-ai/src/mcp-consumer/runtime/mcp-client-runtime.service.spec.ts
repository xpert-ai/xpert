import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ForbiddenException } from '@nestjs/common'
import { RequestContext, type McpClientScope } from '@xpert-ai/plugin-sdk'
import { ToolRuntimeService } from '../../tool-runtime'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { MCPToolset } from '../../xpert-toolset/provider/mcp/mcp-toolset'
import { McpClientConnectionService } from './mcp-client-connection.service'
import { McpClientRuntimeService } from './mcp-client-runtime.service'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { McpConsumer } from '../mcp-consumer'
import { LangChainMcpConnection } from '../connection/langchain-mcp-connection'

const actor = {
    tenantId: '00000000-0000-4000-8000-000000000001',
    organizationId: '00000000-0000-4000-8000-000000000002',
    userId: '00000000-0000-4000-8000-000000000003'
}
const scope = (): McpClientScope => ({
    actor,
    workspaceId: '00000000-0000-4000-8000-000000000004',
    toolsetId: '00000000-0000-4000-8000-000000000005',
    serverName: 'sales',
    signal: new AbortController().signal,
    deadlineAt: Date.now() + 5000
})
const descriptor: Tool = {
    name: 'query',
    annotations: { readOnlyHint: true },
    inputSchema: {
        type: 'object' as const,
        properties: { region: { type: ['string', 'null'] } },
        required: ['region'],
        additionalProperties: false
    },
    outputSchema: {
        type: 'object' as const,
        properties: { rows: { type: 'array' } },
        required: ['rows'],
        additionalProperties: false
    }
}

describe('MCP read-only connection runtime', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
    })
    afterEach(() => jest.restoreAllMocks())
    async function fixture() {
        const connection = {
            schema: 'private connection',
            tools: [{ name: 'sales__query', disabled: false }],
            options: {}
        }
        const repo = { findOne: jest.fn(async () => connection) }
        const workspaces = { assertCanRead: jest.fn(async () => ({})) }
        const transport = Object.assign(Object.create(LangChainMcpConnection.prototype), {
            serverNames: () => ['sales'],
            formatToolName: (server: string, name: string) => `${server}__${name}`
        }) as LangChainMcpConnection
        const consumer = new McpConsumer(transport)
        const call = jest
            .spyOn(consumer.tools, 'call')
            .mockResolvedValue({ content: [], structuredContent: { rows: [] } })
        const list = jest.spyOn(consumer.tools, 'list').mockResolvedValue([descriptor])
        const runtime: MCPToolset = Object.create(MCPToolset.prototype)
        const getConsumer = jest.spyOn(runtime, 'getMcpConsumer').mockResolvedValue(consumer)
        jest.spyOn(runtime, 'getTools').mockReturnValue([Object.assign(Object.create(null), { name: 'sales__query' })])
        jest.spyOn(runtime, 'close').mockResolvedValue(undefined)
        const loader = { loadToolsets: jest.fn(async () => [runtime]) }
        const module = await Test.createTestingModule({
            providers: [
                McpClientRuntimeService,
                McpClientConnectionService,
                { provide: ToolRuntimeService, useValue: loader },
                { provide: XpertWorkspaceAccessService, useValue: workspaces },
                { provide: getRepositoryToken(XpertToolset), useValue: repo }
            ]
        }).compile()
        return {
            service: module.get(McpClientRuntimeService),
            connections: module.get(McpClientConnectionService),
            repo,
            workspaces,
            loader,
            runtime,
            consumer,
            getConsumer,
            call,
            list,
            connection
        }
    }
    it('retains only pinned stop authority after workspace access is revoked', async () => {
        const f = await fixture(),
            input = scope()
        const version = await f.connections.pin(input)
        f.workspaces.assertCanRead.mockRejectedValue(new ForbiddenException())
        await expect(f.connections.pin(input)).rejects.toThrow()
        expect(await f.connections.pinForStop(input)).toBe(version)
        f.connection.schema = 'replaced endpoint'
        expect(await f.connections.pinForStop(input)).not.toBe(version)
        await expect(f.connections.pinForStop({ ...input, actor: { ...actor, userId: 'foreign' } })).rejects.toThrow()
        expect(f.call).not.toHaveBeenCalled()
    })
    it('uses exact current-viewer scope, preserves connection ownership and closes discovery/call runtimes', async () => {
        const f = await fixture(),
            input = scope(),
            [tool] = await f.service.tools.list(input)
        expect(tool.contractHash).toMatch(/^[a-f0-9]{64}$/)
        expect(JSON.stringify(tool)).not.toContain('private connection')
        expect(f.loader.loadToolsets).toHaveBeenCalledWith(
            expect.objectContaining({
                source: 'api',
                tenantId: actor.tenantId,
                organizationId: actor.organizationId,
                workspaceId: input.workspaceId,
                toolsetIds: [input.toolsetId],
                principal: { type: 'user', id: actor.userId, userId: actor.userId }
            })
        )
        expect(f.repo.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id: input.toolsetId,
                    tenantId: actor.tenantId,
                    organizationId: actor.organizationId,
                    workspaceId: input.workspaceId,
                    category: 'mcp'
                })
            })
        )
        expect(
            await f.service.tools.call(input, {
                toolName: 'query',
                contractHash: tool.contractHash,
                arguments: { region: 'East' }
            })
        ).toEqual({ structuredContent: { rows: [] }, text: [] })
        expect(f.call).toHaveBeenCalledWith(
            'query',
            { region: 'East' },
            'sales',
            expect.any(AbortSignal),
            expect.any(Function),
            undefined
        )
        expect(f.runtime.close).toHaveBeenCalledTimes(2)
    })
    it('denies foreign actors, inaccessible workspace and missing scoped connection before loading', async () => {
        for (const mode of ['actor', 'workspace', 'connection']) {
            const f = await fixture(),
                input = scope()
            if (mode === 'actor') input.actor = { ...actor, userId: '00000000-0000-4000-8000-000000000099' }
            if (mode === 'workspace') f.workspaces.assertCanRead.mockRejectedValue(new ForbiddenException())
            if (mode === 'connection') f.repo.findOne.mockResolvedValue(null)
            await expect(f.service.tools.list(input)).rejects.toThrow()
            expect(f.loader.loadToolsets).not.toHaveBeenCalled()
        }
    })
    it('does not expose disabled, non-readonly, destructive or task-only tools', async () => {
        const f = await fixture()
        f.list.mockResolvedValue([
            descriptor,
            { ...descriptor, name: 'disabled' },
            { ...descriptor, annotations: {} },
            { ...descriptor, annotations: { readOnlyHint: false } },
            { ...descriptor, annotations: { readOnlyHint: true, destructiveHint: true } },
            { ...descriptor, execution: { taskSupport: 'required' } }
        ])
        expect((await f.service.tools.list(scope())).map((tool) => tool.name)).toEqual(['query'])
    })
    it('rejects policy and connection overrides and cannot call a tool that becomes writable', async () => {
        const f = await fixture(),
            [tool] = await f.service.tools.list(scope())
        const request = { toolName: 'query', contractHash: tool.contractHash, arguments: { region: null } }
        for (const override of [
            { readOnly: false },
            { policy: 'unrestricted' },
            { url: 'https://invalid.example/mcp' }
        ]) {
            await expect(f.service.tools.list({ ...scope(), ...override })).rejects.toThrow()
            await expect(f.service.tools.call(scope(), { ...request, ...override })).rejects.toThrow()
        }
        for (const annotations of [{ readOnlyHint: false }, { readOnlyHint: true, destructiveHint: true }]) {
            f.list.mockResolvedValue([{ ...descriptor, annotations }])
            await expect(f.service.tools.call(scope(), request)).rejects.toThrow()
        }
        expect(f.call).not.toHaveBeenCalled()
    })
    it('rechecks grants after discovery and discards results after workspace revocation', async () => {
        const f = await fixture(),
            [tool] = await f.service.tools.list(scope())
        const request = { toolName: 'query', contractHash: tool.contractHash, arguments: { region: null } }
        f.list.mockImplementationOnce(async () => {
            f.connection.tools[0].disabled = true
            return [descriptor]
        })
        await expect(f.service.tools.call(scope(), request)).rejects.toThrow()
        expect(f.call).not.toHaveBeenCalled()
        f.connection.tools[0].disabled = false
        f.call.mockImplementationOnce(async () => {
            f.workspaces.assertCanRead.mockRejectedValue(new ForbiddenException())
            return { content: [], structuredContent: { rows: [] } }
        })
        await expect(f.service.tools.call(scope(), request)).rejects.toThrow()
        expect(f.runtime.close).toHaveBeenCalledTimes(3)
    })
    it('rejects changed schemas, invalid/extra arguments and unavailable tools without invoking them', async () => {
        const f = await fixture(),
            [tool] = await f.service.tools.list(scope())
        for (const request of [
            { toolName: 'query', contractHash: '0'.repeat(64), arguments: { region: null } },
            { toolName: 'query', contractHash: tool.contractHash, arguments: { region: 123 } },
            { toolName: 'query', contractHash: tool.contractHash, arguments: { region: null, actor: 'admin' } },
            { toolName: 'delete', contractHash: tool.contractHash, arguments: { region: null } }
        ])
            await expect(f.service.tools.call(scope(), request)).rejects.toThrow()
        expect(f.call).not.toHaveBeenCalled()
    })
    it('isolates remote schema IDs across refreshes and contract changes', async () => {
        const f = await fixture()
        const remote = {
            ...descriptor,
            inputSchema: { ...descriptor.inputSchema, $id: 'urn:mcp:query:input' },
            outputSchema: { ...descriptor.outputSchema, $id: 'urn:mcp:query:output' }
        }
        f.list.mockImplementation(async () => JSON.parse(JSON.stringify([remote])))
        const [tool] = await f.service.tools.list(scope())
        const request = { toolName: 'query', contractHash: tool.contractHash, arguments: { region: 'East' } }
        for (let refresh = 0; refresh < 2; refresh++) {
            await expect(f.service.tools.call(scope(), request)).resolves.toEqual({
                structuredContent: { rows: [] },
                text: []
            })
        }
        remote.inputSchema.properties = { region: { type: 'number' } }
        const [changed] = await f.service.tools.list(scope())
        expect(changed.contractHash).not.toBe(tool.contractHash)
        await expect(f.service.tools.call(scope(), request)).rejects.toThrow()
        await expect(
            f.service.tools.call(scope(), { ...request, contractHash: changed.contractHash })
        ).rejects.toThrow()
        await expect(
            f.service.tools.call(scope(), { ...request, contractHash: changed.contractHash, arguments: { region: 1 } })
        ).resolves.toEqual({ structuredContent: { rows: [] }, text: [] })
        expect(f.call).toHaveBeenCalledTimes(3)
    })
    it('rejects tool errors, mismatched structured outputs and interactive requests', async () => {
        const f = await fixture(),
            [tool] = await f.service.tools.list(scope())
        const input = { toolName: 'query', contractHash: tool.contractHash, arguments: { region: null } }
        f.call.mockResolvedValueOnce({ content: [], isError: true, structuredContent: { rows: [] } })
        await expect(f.service.tools.call(scope(), input)).rejects.toThrow()
        f.call.mockResolvedValueOnce({ content: [], structuredContent: { rows: 'not rows' } })
        await expect(f.service.tools.call(scope(), input)).rejects.toThrow()
        f.call.mockImplementationOnce(async (...args) => {
            await args[4]!({ mode: 'form', message: 'Approve', requestedSchema: { type: 'object', properties: {} } })
            return { content: [] }
        })
        await expect(f.service.tools.call(scope(), input)).rejects.toThrow()
    })
    it('rechecks revocation after I/O and bounds cancellation, including late initialization', async () => {
        const f = await fixture(),
            [tool] = await f.service.tools.list(scope())
        f.call.mockImplementationOnce(async () => {
            f.connection.tools[0].disabled = true
            return { content: [], structuredContent: { rows: [] } }
        })
        await expect(
            f.service.tools.call(scope(), {
                toolName: 'query',
                contractHash: tool.contractHash,
                arguments: { region: null }
            })
        ).rejects.toThrow()
        const before = await fixture(),
            controller = new AbortController()
        controller.abort()
        await expect(before.service.tools.list({ ...scope(), signal: controller.signal })).rejects.toThrow()
        expect(before.loader.loadToolsets).not.toHaveBeenCalled()
        const late = await fixture()
        late.getConsumer.mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 30))
            return late.consumer
        })
        await expect(late.service.tools.list({ ...scope(), deadlineAt: Date.now() + 10 })).rejects.toThrow()
        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(late.runtime.close).toHaveBeenCalled()
        expect(late.list).not.toHaveBeenCalled()
    })
})
