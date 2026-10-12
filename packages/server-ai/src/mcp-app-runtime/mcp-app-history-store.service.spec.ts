import { RequestContext } from '@xpert-ai/plugin-sdk'
import { getMetadataArgsStorage, type Repository } from 'typeorm'
import { McpAppHistory } from './mcp-app-history.entity'
import { MCP_APP_HISTORY_MAX_BYTES, McpAppHistoryStoreService } from './mcp-app-history-store.service'
import type { McpAppInstanceSnapshot } from './mcp-app-instance-store.service'

describe('McpAppHistoryStoreService', () => {
    const rows = new Map<string, McpAppHistory>()
    let inserted: McpAppHistory
    const query = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn((value: McpAppHistory) => {
            inserted = value
            return query
        }),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn(async () => {
            if (!rows.has(inserted.id)) rows.set(inserted.id, JSON.parse(JSON.stringify(inserted)))
        })
    }
    const repository = {
        createQueryBuilder: jest.fn(() => query),
        findOne: jest.fn(async ({ where }: { where: { id: string; tenantId: string; organizationId: string } }) => {
            const row = rows.get(where.id)
            return row?.tenantId === where.tenantId && row?.organizationId === where.organizationId ? row : null
        })
    }
    const service = new McpAppHistoryStoreService(repository as unknown as Repository<McpAppHistory>)

    beforeEach(() => {
        rows.clear()
        jest.clearAllMocks()
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
    })

    afterEach(() => jest.restoreAllMocks())

    it('keeps the full initial tool result after the lease expires without persisting runtime state', async () => {
        const initial = snapshot()
        initial.expiresAt = Date.now() - 1
        initial.toolResult = {
            content: [{ type: 'text', text: 'x'.repeat(256 * 1024) }],
            structuredContent: { mode: 'live' }
        }
        initial.modelContext = { transient: true }
        initial.messages = [{ content: 'Do not persist runtime conversations' }]
        initial.logs = [{ detail: 'Do not persist runtime logs' }]

        await service.preserve(initial)
        const restored = await service.find(initial.appInstanceId)

        expect(restored?.toolResult).toEqual(initial.toolResult)
        expect(restored?.expiresAt).toBeLessThan(Date.now())
        expect(restored?.modelContext).toBeUndefined()
        expect(restored?.messages).toBeUndefined()
        expect(restored?.logs).toBeUndefined()
        expect(query.orIgnore).toHaveBeenCalled()
        expect(repository.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'app-1', tenantId: 'tenant-1', organizationId: 'org-1' },
                select: expect.objectContaining({ snapshot: true })
            })
        )
    })

    it('does not overwrite the original grants or result when callbacks later save the same instance', async () => {
        await service.preserve(snapshot())
        await service.preserve({
            ...snapshot(),
            stateVersion: 2,
            toolResult: { replaced: true },
            userId: 'another-user'
        })

        const restored = await service.find('app-1')
        expect(restored?.stateVersion).toBe(1)
        expect(restored?.userId).toBe('user-1')
        expect(restored?.toolResult).toEqual({ content: [{ type: 'text', text: 'original result' }] })
        expect(restored?.source?.connectorGrants).toEqual({ bindingIds: ['binding-1'], providers: ['amap'] })
    })

    it('omits MCP private metadata while preserving the actual business result', async () => {
        await service.preserve({
            ...snapshot(),
            toolResult: {
                content: [{ type: 'text', text: 'initial result' }],
                structuredContent: { source: 'amap', places: [] },
                _meta: { runtimeSession: 'fixture-sensitive-metadata' }
            }
        })

        expect((await service.find('app-1'))?.toolResult).toEqual({
            content: [{ type: 'text', text: 'initial result' }],
            structuredContent: { source: 'amap', places: [] }
        })
    })

    it.each(['tenant', 'organization'])('denies a different %s scope', async (scope) => {
        await service.preserve(snapshot())
        if (scope === 'tenant') jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-2')
        else jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-2')
        await expect(service.find('app-1')).resolves.toBeNull()
    })

    it('does not issue an unscoped lookup when request scope is absent', async () => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        await expect(service.find('app-1')).resolves.toBeNull()
        expect(repository.findOne).not.toHaveBeenCalled()
    })

    it.each(['tenantId', 'organizationId', 'executionContext'] as const)(
        'skips an unbound initial snapshot missing %s',
        async (field) => {
            const value = snapshot()
            delete value[field]
            await service.preserve(value)
            expect(query.execute).not.toHaveBeenCalled()
        }
    )

    it('rejects malformed or identity-substituted persisted snapshots', async () => {
        await service.preserve(snapshot())
        const row = rows.get('app-1')
        if (!row) throw new Error('Fixture history missing')
        row.snapshot = { ...snapshot(), tenantId: 'tenant-2' }
        await expect(service.find('app-1')).resolves.toBeNull()
        row.snapshot = {
            ...snapshot(),
            executionContext: { ...snapshot().executionContext, conversationId: 'conversation-2' }
        }
        await expect(service.find('app-1')).resolves.toBeNull()
        row.snapshot = { ...snapshot(), resourceUri: 'https://unexpected.example' }
        await expect(service.find('app-1')).resolves.toBeNull()
    })

    it('bounds history without truncating or writing an oversized initial result', async () => {
        await service.preserve({ ...snapshot(), toolResult: { text: 'x'.repeat(MCP_APP_HISTORY_MAX_BYTES) } })
        expect(query.execute).not.toHaveBeenCalled()
        await expect(service.find('app-1')).resolves.toBeNull()
    })

    it('keeps snapshots private and binds cleanup to conversation and execution deletion', () => {
        const metadata = getMetadataArgsStorage()
        const column = metadata.columns.find(
            (column) => column.target === McpAppHistory && column.propertyName === 'snapshot'
        )
        expect(column?.options).toEqual(expect.objectContaining({ type: 'jsonb', select: false }))
        for (const property of ['conversation', 'execution']) {
            const relation = metadata.relations.find(
                (relation) => relation.target === McpAppHistory && relation.propertyName === property
            )
            expect(relation?.options).toEqual(expect.objectContaining({ onDelete: 'CASCADE', nullable: false }))
        }
    })
})

function snapshot(): McpAppInstanceSnapshot {
    return {
        version: 1,
        stateVersion: 1,
        appInstanceId: 'app-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        executionContext: { xpertId: 'assistant-1', conversationId: 'conversation-1', executionId: 'execution-1' },
        source: {
            kind: 'middleware',
            provider: 'maps:explorer',
            nodeKey: 'maps-1',
            agentKey: 'agent-1',
            pluginName: '@xpert-ai/plugin-maps',
            interruptAfter: false,
            connectorGrants: { bindingIds: ['binding-1'], providers: ['amap'] }
        },
        serverName: 'maps',
        toolName: 'maps_search',
        displayName: 'Maps',
        resourceUri: 'ui://maps/app.html',
        toolCallId: 'call-1',
        toolInput: { query: 'coffee' },
        toolResult: { content: [{ type: 'text', text: 'original result' }] },
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000
    }
}
