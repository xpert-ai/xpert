import { ConflictException, ForbiddenException } from '@nestjs/common'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { MemoryManagement } from './memory-management'
import { FileMemoryService } from './file-memory.service'
import { MemoryViewProvider } from './memory-view.provider'

describe('Xpert Memory management in both hosts', () => {
    const scope = { tenantId: 'tenant', userId: 'owner', id: 'assistant', workspaceDataScope: 'user' as const }
    const context = (hostType: string, features = ['xpert.memory']) =>
        ({
            hostType,
            hostId: scope.id,
            userId: scope.userId,
            tenantId: scope.tenantId,
            slots: [],
            capabilities: { features }
        }) satisfies XpertResolvedViewHostContext
    let root: string, memory: FileMemoryService, management: MemoryManagement
    const access = { resolve: jest.fn(), canReadConversation: jest.fn() }
    const history = { readSnippets: jest.fn() }
    beforeEach(async () => {
        jest.resetAllMocks()
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-view-'))
        memory = new FileMemoryService({
            resolve: () => ({ path: (relative) => path.join(root, relative) }),
            readSnapshot: (_scope, relative) => fs.readFile(path.join(root, relative), 'utf8')
        })
        access.resolve.mockResolvedValue({ scope, canEdit: true, canManage: true })
        management = new MemoryManagement(memory, {} as never, access, history)
    })
    afterEach(() => fs.rm(root, { recursive: true, force: true }))
    it('contributes one identical iframe to the author and activated published Assistant', () => {
        const provider = new MemoryViewProvider(management)
        const [a] = provider.getViewManifests(context('agent'), 'agent.workbench')
        const [b] = provider.getViewManifests(context('assistant-studio', []), 'assistant.studio.memory')
        expect(a.view).toEqual(b.view)
        expect(a.source).toEqual(b.source)
        expect(a.key).toBe(b.key)
        expect(provider.getViewManifests(context('agent', ['sandbox']), 'agent.workbench')).toEqual([])
    })
    it('shares scoped notes without changing usage, rejects concurrent stale revisions and rechecks revoked writes', async () => {
        const input = { type: 'project' as const, title: 'Scope', summary: 'Only east', content: 'Regional rule' }
        const { memoryId } = await memory.writeMemory(scope, input)
        const before = (await memory.listTopicRecords(scope))[0].document.frontmatter.usage
        const detail = await management.read(context('assistant-studio'), {
            parameters: { section: 'note' },
            selectionId: memoryId
        })
        await management.read(context('agent'), {})
        expect((await memory.listTopicRecords(scope))[0].document.frontmatter.usage).toEqual(before)
        const { type, ...edits } = input
        if (!('note' in detail)) throw Error('Expected note detail')
        const edit = { ...edits, id: memoryId, revision: detail.note.revision }
        const results = await Promise.allSettled(
            ['agent', 'assistant-studio'].map((h, i) =>
                management.act(context(h), 'save', { ...edit, content: String(i) })
            )
        )
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
        expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: expect.any(ConflictException) })
        access.resolve.mockResolvedValue({ scope, canEdit: false, canManage: false })
        await expect(management.act(context('agent'), 'archive', edit)).rejects.toBeInstanceOf(ForbiddenException)
        await expect(management.act(context('agent'), 'dream', {})).rejects.toBeInstanceOf(ForbiddenException)
    })
    it('projects old receipts and reads only their cited visible turns', async () => {
        const review = 'a'.repeat(64),
            conversationId = randomUUID(),
            messageId = randomUUID()
        const sourceRef = 'conversation:' + conversationId + '#message:' + messageId
        const dir = path.join(await memory.getMemoryRootPath(scope), '.dream', 'reviews')
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(
            path.join(dir, review + '.json'),
            JSON.stringify({
                memoryId: 'old',
                outcome: 'missing_evidence',
                sourceRefs: [sourceRef],
                checkedAt: '2026-01-01'
            })
        )
        const parameters = { section: 'review-evidence' }
        access.canReadConversation.mockResolvedValue(false)
        const denied = await management.read(context('agent'), { parameters, selectionId: review })
        expect(denied.evidence).toEqual([{ state: 'unavailable' }])
        expect(history.readSnippets).not.toHaveBeenCalled()
        access.canReadConversation.mockResolvedValue(true)
        history.readSnippets.mockResolvedValue([
            { conversationId, messageId, sourceRef, role: 'human', sourceType: 'user', content: 'East only' }
        ])
        const allowed = await management.read(context('assistant-studio'), { parameters, selectionId: review })
        expect(allowed.evidence).toEqual([{ state: 'available', role: 'human', content: 'East only' }])
        const old = await management.read(context('agent'), { parameters: { section: 'review' }, selectionId: review })
        if (!('review' in old)) throw Error('Expected review detail')
        expect(old.review.proposal).toBeUndefined()
        await expect(management.read(context('agent'), { parameters, selectionId: '../status' })).rejects.toThrow()
    })
})
