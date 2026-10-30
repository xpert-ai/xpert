import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ContextEvidenceService } from './context-evidence.service'
import {
    ContextEvidenceStorage,
    ContextEvidenceScope,
    EvidenceRecord,
    readContextEvidenceSchema
} from './context-evidence.schema'

jest.mock('@xpert-ai/plugin-sdk', () => ({ RequestContext: { currentUserId: jest.fn(() => 'user-1') } }))
jest.mock('../conversation.service', () => ({ ChatConversationService: class {} }))
jest.mock('../conversation-thread.service', () => ({ ChatConversationThreadService: class {} }))
jest.mock('../../ai/public-xpert-principal', () => ({
    assertPublicXpertSessionConversationAccess: async () => undefined
}))

class MemoryEvidenceStorage extends ContextEvidenceStorage {
    rows = new Map<string, EvidenceRecord>()
    scopes = new Map<string, ContextEvidenceScope>()
    async put(scope: ContextEvidenceScope, records: EvidenceRecord[]) {
        records.forEach((record) => {
            if (!this.rows.has(record.evidenceId)) {
                this.rows.set(record.evidenceId, record)
                this.scopes.set(record.evidenceId, scope)
            }
        })
    }
    async get(scope: ContextEvidenceScope, ids: string[]) {
        return ids.flatMap((id) => {
            const saved = this.scopes.get(id)
            const row = this.rows.get(id)
            return row &&
                saved &&
                ['tenantId', 'organizationId', 'conversationId', 'threadId', 'agentKey'].every(
                    (key: keyof ContextEvidenceScope) => saved[key] === scope[key]
                )
                ? [row]
                : []
        })
    }
}

describe('context evidence recovery', () => {
    beforeEach(() => jest.mocked(RequestContext.currentUserId).mockReturnValue('user-1'))
    it('recovers exact arguments in bounded pages from a new service instance and deduplicates repeated archives', async () => {
        const storage = new MemoryEvidenceStorage()
        const conversation = { id: 'conversation-1', tenantId: 'tenant-1', organizationId: 'org-1' }
        const conversations = { assertAccess: jest.fn().mockResolvedValue(conversation) }
        const threads = { findByThreadId: jest.fn().mockResolvedValue({ conversationId: 'conversation-1' }) }
        const scope = {
            ...conversation,
            conversationId: conversation.id,
            userId: 'user-1',
            threadId: 'thread-1',
            agentKey: 'agent'
        }
        const makeService = () => new ContextEvidenceService(storage, conversations, threads, { execute: jest.fn() })
        const messages = [
            new HumanMessage('Preserve active=false only for new factories.'),
            new AIMessage({
                content: '',
                tool_calls: [{ id: 'edit', name: 'shell', args: { script: 'original script\n'.repeat(1000) } }]
            }),
            new ToolMessage({ tool_call_id: 'edit', content: 'failed', status: 'error' })
        ]
        const saved = await makeService().bind(scope).archive(messages)
        const rowCount = storage.rows.size
        expect(await makeService().bind(scope).archive(messages)).toEqual(saved)
        expect(storage.rows.size).toBe(rowCount)
        const recovered = await makeService()
            .bind(scope)
            .read(
                readContextEvidenceSchema.parse({
                    archiveId: saved.archiveId,
                    part: 'arguments',
                    record: 1,
                    limit: 100
                })
            )
        expect(recovered).toMatchObject({
            text: JSON.stringify({ script: 'original script\n'.repeat(1000) }).slice(0, 100),
            nextOffset: 100,
            partialSource: false
        })
    })

    function fixture() {
        const storage = new MemoryEvidenceStorage()
        const scope = {
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            conversationId: 'conversation-1',
            userId: 'user-1',
            threadId: 'thread-1',
            agentKey: 'agent'
        }
        const conversations = {
            assertAccess: jest.fn().mockResolvedValue({
                id: scope.conversationId,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId
            })
        }
        const threads = { findByThreadId: jest.fn().mockResolvedValue({ conversationId: scope.conversationId }) }
        const service = new ContextEvidenceService(storage, conversations, threads, { execute: jest.fn() })
        return { storage, scope, conversations, threads, service, access: service.bind(scope) }
    }

    it('reassembles exact JSON arguments across all pages and retains explicit failure state', async () => {
        const f = fixture()
        const args = { script: '中文🙂\\"\n'.repeat(900), active: false, path: '../literal-data' }
        const saved = await f.access.archive([
            new AIMessage({ content: '', tool_calls: [{ id: 'call', name: 'shell', args }] }),
            new ToolMessage({ content: 'verification failed', tool_call_id: 'call', status: 'error' })
        ])
        let offset = 0
        let joined = ''
        while (offset < JSON.stringify(args).length) {
            const page = await f.access.read(
                readContextEvidenceSchema.parse({
                    archiveId: saved.archiveId,
                    part: 'arguments',
                    record: 0,
                    offset,
                    limit: 113
                })
            )
            if (
                !page ||
                typeof page !== 'object' ||
                !('text' in page) ||
                typeof page.text !== 'string' ||
                !('nextOffset' in page)
            )
                throw new Error('Invalid page')
            expect(page.text.length).toBeLessThanOrEqual(113)
            joined += page.text
            if (page.nextOffset === null) break
            if (typeof page.nextOffset !== 'number') throw new Error('Invalid cursor')
            offset = page.nextOffset
        }
        expect(joined).toBe(JSON.stringify(args))
        expect(
            await f.access.read(
                readContextEvidenceSchema.parse({ archiveId: saved.archiveId, record: 1, part: 'content' })
            )
        ).toMatchObject({ text: 'verification failed', status: 'error' })
    })

    it('does not publish an index if durable write-back is incomplete', async () => {
        const f = fixture()
        jest.spyOn(f.storage, 'get').mockResolvedValue([])
        await expect(f.access.archive([new HumanMessage('Keep original')])).rejects.toThrow()
        expect([...f.storage.rows.values()].every((row) => !row.payload.includes('"kind":"manifest"'))).toBe(true)
    })

    it('rejects a corrupted archived record instead of returning changed source', async () => {
        const f = fixture()
        const saved = await f.access.archive([new HumanMessage('Original')])
        const row = [...f.storage.rows.values()].find((item) => item.payload.includes('"kind":"message"'))!
        f.storage.rows.set(row.evidenceId, { ...row, payload: row.payload.replace('Original', 'Modified') })
        await expect(
            f.access.read(readContextEvidenceSchema.parse({ archiveId: saved.archiveId, part: 'content', record: 0 }))
        ).rejects.toThrow()
    })

    it('rechecks revoked conversation access before touching archived storage', async () => {
        const f = fixture()
        const saved = await f.access.archive([new HumanMessage('Secret')])
        const read = jest.spyOn(f.storage, 'get')
        f.conversations.assertAccess.mockRejectedValue(new ForbiddenException())
        await expect(
            f.access.read(readContextEvidenceSchema.parse({ archiveId: saved.archiveId }))
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(read).not.toHaveBeenCalled()
    })

    it.each(['tenantId', 'organizationId', 'conversationId', 'threadId', 'agentKey'] as const)(
        'does not treat an archive ID as a grant across %s',
        async (field) => {
            const f = fixture()
            const saved = await f.access.archive([new HumanMessage('Secret')])
            await expect(
                f.service
                    .bind({ ...f.scope, [field]: 'different' })
                    .read(readContextEvidenceSchema.parse({ archiveId: saved.archiveId }))
            ).rejects.toThrow()
        }
    )

    it('rejects a changed actor and a thread owned by another conversation', async () => {
        const f = fixture()
        const saved = await f.access.archive([new HumanMessage('Secret')])
        jest.mocked(RequestContext.currentUserId).mockReturnValue('other-user')
        await expect(
            f.access.read(readContextEvidenceSchema.parse({ archiveId: saved.archiveId }))
        ).rejects.toBeInstanceOf(ForbiddenException)
        jest.mocked(RequestContext.currentUserId).mockReturnValue('user-1')
        f.threads.findByThreadId.mockResolvedValue({ conversationId: 'other' })
        await expect(
            f.access.read(readContextEvidenceSchema.parse({ archiveId: saved.archiveId }))
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('marks previously truncated sources and bounds index pages', async () => {
        const f = fixture()
        const saved = await f.access.archive(
            Array.from(
                { length: 10 },
                (_, i) =>
                    new ToolMessage({
                        content: `fragment ${i}`,
                        tool_call_id: `${i}`,
                        additional_kwargs: { truncated: true }
                    })
            )
        )
        expect(saved.partial).toBe(true)
        expect(await f.access.read(readContextEvidenceSchema.parse({ archiveId: saved.archiveId }))).toMatchObject({
            nextOffset: 8,
            entries: expect.arrayContaining([expect.objectContaining({ partialSource: true })])
        })
        expect(
            await f.access.read(readContextEvidenceSchema.parse({ archiveId: saved.archiveId, offset: 8 }))
        ).toMatchObject({ nextOffset: null })
        expect(
            await f.access.read(
                readContextEvidenceSchema.parse({ archiveId: saved.archiveId, part: 'content', record: 0 })
            )
        ).toMatchObject({ partialSource: true })
    })

    it('recovers an inherited archive from a same-conversation ancestor, but not a sibling branch', async () => {
        const f = fixture()
        const saved = await f.access.archive([new HumanMessage('Before the fork')])
        f.threads.findByThreadId.mockImplementation(async (threadId: string) => ({
            conversationId: f.scope.conversationId,
            parentThreadId: threadId === 'child' ? f.scope.threadId : null
        }))
        const input = readContextEvidenceSchema.parse({ archiveId: saved.archiveId, part: 'content', record: 0 })
        expect(await f.service.bind({ ...f.scope, threadId: 'child' }).read(input)).toMatchObject({
            text: 'Before the fork',
            sourceThreadId: f.scope.threadId
        })
        await expect(f.service.bind({ ...f.scope, threadId: 'sibling' }).read(input)).rejects.toThrow()
    })

    it('rejects an ancestor link to another conversation', async () => {
        const f = fixture()
        const saved = await f.access.archive([new HumanMessage('Secret')])
        f.threads.findByThreadId.mockImplementation(async (threadId: string) => ({
            conversationId: threadId === 'child' ? f.scope.conversationId : 'other-conversation',
            parentThreadId: threadId === 'child' ? f.scope.threadId : null
        }))
        await expect(
            f.service
                .bind({ ...f.scope, threadId: 'child' })
                .read(readContextEvidenceSchema.parse({ archiveId: saved.archiveId }))
        ).rejects.toThrow()
    })

    it.each([{ limit: 8001 }, { offset: -1 }, { record: 0.5 }, { conversationId: 'other' }, { path: '/etc/passwd' }])(
        'rejects invalid or authority-changing tool input %j',
        (input) => {
            expect(readContextEvidenceSchema.safeParse({ archiveId: 'a'.repeat(64), ...input }).success).toBe(false)
        }
    )
})
