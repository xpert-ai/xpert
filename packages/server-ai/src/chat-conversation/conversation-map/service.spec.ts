import { ForbiddenException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { ChatConversationService } from '../conversation.service'
import { ChatConversationThreadService } from '../conversation-thread.service'
import { ConversationBranchCommand } from '../conversation-branch/branch.command'
import { WorkbenchAssistantConversationNavigationService } from '../workbench-assistant-conversation-navigation.service'
import { XpertProjectService } from '../../xpert-project/project.service'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { ConversationMapService } from './service'
import { mapPageSchema, mapQuerySchema } from './schema'

jest.mock('i18next', () => ({
    t: (key: string) => (key === 'server-ai:ConversationMap.Untitled' ? '未命名对话' : key)
}))

const context: XpertResolvedViewHostContext = {
    slots: [],
    hostType: 'agent',
    hostId: 'assistant',
    tenantId: 'tenant',
    organizationId: 'org',
    userId: 'user'
}
const projectId = 'ec098de6-3e9f-4d13-9d5c-60c526ab748f'
const conversationId = '5bedb93e-9ea0-4585-ad19-6a3f99a82896'
function fixture() {
    const conversation = {
        id: conversationId,
        threadId: 'main',
        xpertId: 'assistant-old',
        projectId,
        title: 'Planning'
    }
    const repository = { findAndCount: jest.fn().mockResolvedValue([[conversation], 2]), findOneBy: jest.fn() }
    const conversations = Object.assign(Object.create(ChatConversationService.prototype), {
        repository,
        findReadableFamilyConversations: repository.findAndCount,
        assertAccess: jest.fn().mockResolvedValue(conversation),
        update: jest.fn()
    })
    const threads = Object.assign(Object.create(ChatConversationThreadService.prototype), {
        ensurePrimary: jest.fn(),
        requireByThreadId: jest.fn().mockResolvedValue({ conversationId }),
        listByConversation: jest.fn().mockResolvedValue([
            { threadId: 'old', metadata: { primary: true }, headMessageId: 'a' },
            { threadId: 'main', parentThreadId: 'old', metadata: { purpose: 'message-edit' }, headMessageId: 'b' },
            {
                threadId: 'side',
                parentThreadId: 'main',
                metadata: { purpose: 'side-chat', title: 'Risk' },
                headMessageId: 'c'
            }
        ]),
        findVisibleMessages: jest.fn().mockResolvedValue({
            items: [
                { id: 'h', role: 'human', content: 'Delivery risk', createdInThreadId: 'main' },
                { id: 'a', role: 'ai', content: 'A visible reply', createdInThreadId: 'main' }
            ]
        }),
        copyThread: jest.fn().mockResolvedValue({ threadId: 'copied' })
    })
    const commands = Object.assign(Object.create(CommandBus.prototype), {
        execute: jest.fn().mockResolvedValue({ id: 'new', threadId: 'new' })
    })
    const projects = Object.assign(Object.create(XpertProjectService.prototype), {
        findAvailableForXpert: jest.fn().mockResolvedValue({ items: [{ id: projectId, name: 'Project' }], total: 1 }),
        assertRuntimeAccess: jest.fn()
    })
    const access = Object.assign(Object.create(XpertProjectAccessService.prototype), {
        assertCanReadXpert: jest.fn(),
        assertCanRead: jest.fn().mockResolvedValue({ project: { name: 'Project' }, role: 'viewer' })
    })
    const published = Object.assign(Object.create(PublishedXpertAccessService.prototype), {
        getAccessiblePublishedXpertFamilyIds: jest.fn().mockResolvedValue(['assistant', 'assistant-old'])
    })
    const navigation = Object.assign(Object.create(WorkbenchAssistantConversationNavigationService.prototype), {
        resolve: jest.fn().mockResolvedValue({ conversationId, threadId: 'main', xpertId: 'assistant', projectId })
    })
    const messages = { find: jest.fn() }
    const db = Object.assign(Object.create(DataSource.prototype), {
        getRepository: jest.fn().mockReturnValue(messages)
    })
    const service = new ConversationMapService(
        conversations,
        threads,
        projects,
        access,
        published,
        navigation,
        commands,
        db
    )
    return { service, conversations, repository, threads, commands, access, projects, navigation, messages, db }
}
beforeEach(() => {
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
})
afterEach(() => jest.restoreAllMocks())
describe('ConversationMapService', () => {
    it.each(['organizationId', 'tenantId', 'userId'] as const)(
        'rejects a mismatching %s before reading',
        async (key) => {
            const f = fixture()
            await expect(
                f.service.read({ ...context, [key]: 'outside' }, mapQuerySchema.parse({}))
            ).rejects.toBeInstanceOf(ForbiddenException)
            expect(f.repository.findAndCount).not.toHaveBeenCalled()
            expect(f.threads.findVisibleMessages).not.toHaveBeenCalled()
        }
    )
    it('filters family, organization and project before counting and pagination', async () => {
        const f = fixture()
        const page = await f.service.read(context, mapQuerySchema.parse({ projectId, limit: 1 }))
        expect(f.access.assertCanReadXpert).toHaveBeenCalledWith(projectId, 'assistant')
        expect(f.conversations.findReadableFamilyConversations).toHaveBeenCalledWith(
            ['assistant', 'assistant-old'],
            projectId,
            0,
            1
        )
        expect(page.nextOffset).toBe(1)
    })
    it('scopes unassigned conversations to the actor and respects an explicit null over runtime project', async () => {
        const f = fixture()
        await f.service.read(
            {
                ...context,
                runtimeScope: {
                    projectId,
                    conversationId: null,
                    dataScopeKey: 'project',
                    workspaceFiles: { catalog: 'projects', scopeId: projectId }
                }
            },
            mapQuerySchema.parse({ projectId: null })
        )
        expect(f.conversations.findReadableFamilyConversations).toHaveBeenCalledWith(
            ['assistant', 'assistant-old'],
            null,
            0,
            20
        )
        expect(f.access.assertCanRead).not.toHaveBeenCalled()
    })
    it('rejects a project viewer denied access and any foreign conversation family', async () => {
        const f = fixture()
        f.access.assertCanReadXpert.mockRejectedValueOnce(new ForbiddenException())
        await expect(f.service.read(context, mapQuerySchema.parse({ projectId }))).rejects.toBeInstanceOf(
            ForbiddenException
        )
        f.conversations.assertAccess.mockResolvedValue({ id: conversationId, xpertId: 'unrelated', projectId })
        await expect(
            f.service.read(context, mapQuerySchema.parse({ projectId, conversationId }))
        ).rejects.toBeInstanceOf(ForbiddenException)
    })
    it('hides edited ancestors while retaining the current revision and side chats', async () => {
        const f = fixture()
        const query = mapQuerySchema.parse({ projectId, conversationId })
        expect((await f.service.read(context, query)).nodes.map((node) => node.threadId)).toEqual(['main', 'side'])
        expect((await f.service.read(context, { ...query, showHistory: true })).nodes).toHaveLength(3)
    })
    it.each([null, undefined, '', ' \t '])(
        'returns valid conversation, branch, turn and search pages when the title is %p',
        async (title) => {
            const f = fixture()
            const conversation = { id: conversationId, threadId: 'main', xpertId: 'assistant-old', title }
            f.repository.findAndCount.mockResolvedValue([[conversation], 1])
            f.conversations.assertAccess.mockResolvedValue(conversation)
            f.threads.requireByThreadId.mockResolvedValue({ conversationId, threadId: 'main' })
            // A newly created conversation already has its first question, but no generated title or answer.
            f.threads.findVisibleMessages.mockResolvedValue({
                items: [{ id: 'h', role: 'human', content: 'Delivery risk', createdInThreadId: 'main' }]
            })
            for (const parameters of [
                {},
                { conversationId },
                { conversationId, threadId: 'main' },
                { search: 'Delivery' }
            ]) {
                const page = await f.service.read(context, mapQuerySchema.parse(parameters))
                // Exercise the same response contract as the View, including JSON serialization.
                const parsed = mapPageSchema.parse(JSON.parse(JSON.stringify(page)))
                expect(parsed.nodes.length).toBeGreaterThan(0)
                for (const node of parsed.nodes) {
                    expect(node.kind === 'conversation' ? node.title : node.conversationTitle).toBe('未命名对话')
                }
            }
        }
    )
    it('preserves an existing title when reading turns', async () => {
        const f = fixture()
        f.threads.requireByThreadId.mockResolvedValue({ conversationId, threadId: 'main' })
        const page = await f.service.read(
            context,
            mapQuerySchema.parse({ projectId, conversationId, threadId: 'main' })
        )
        expect(mapPageSchema.parse(JSON.parse(JSON.stringify(page))).nodes[0].conversationTitle).toBe('Planning')
    })
    it('returns the complete tree topology with shared history, without turn pagination or null titles', async () => {
        const f = fixture()
        f.conversations.assertAccess.mockResolvedValue({
            id: conversationId,
            threadId: 'main',
            xpertId: 'assistant-old',
            projectId,
            title: null
        })
        const messages = [
            { id: 'h', role: 'human', content: 'Delivery risk' },
            { id: 'a', role: 'ai', content: 'Answer', parentId: 'h' },
            { id: 'b', role: 'human', content: 'Continue main', parentId: 'a' },
            { id: 'c', role: 'human', content: 'Continue side', parentId: 'a' }
        ]
        f.messages.find.mockResolvedValue(messages)
        f.repository.findAndCount.mockResolvedValue([[], 0])
        const page = await f.service.read(
            context,
            mapQuerySchema.parse({
                projectId,
                conversationId,
                representation: 'segments',
                limit: 1,
                offset: 10,
                showShared: false
            })
        )
        expect(mapPageSchema.parse(JSON.parse(JSON.stringify(page))).nodes).toHaveLength(3)
        expect(page.nodes.map((node) => [node.endMessageId, node.messageCount])).toEqual([
            ['a', 2],
            ['b', 1],
            ['c', 1]
        ])
        expect(page.nodes.map((node) => node.lastHumanMessage?.text)).toEqual([
            'Delivery risk',
            'Continue main',
            'Continue side'
        ])
        expect(page.nodes.every((node) => !('messages' in node))).toBe(true)
        expect(page.nodes.every((node) => node.conversationTitle === '未命名对话')).toBe(true)
        expect(page.nextOffset).toBeNull()
        expect(f.threads.findVisibleMessages).not.toHaveBeenCalled()
        expect(f.messages.find).toHaveBeenCalledTimes(2)
        expect(f.conversations.findReadableFamilyConversations).toHaveBeenCalledWith(
            ['assistant', 'assistant-old'],
            projectId,
            0,
            50,
            conversationId
        )
        const history = await f.service.read(
            context,
            mapQuerySchema.parse({ projectId, conversationId, representation: 'segments', showHistory: true })
        )
        expect(history.nodes).toHaveLength(4)
        expect(history.nodes.find((node) => node.threadId === 'old' && node.messageCount === 0)).toBeDefined()
        expect(f.threads.findVisibleMessages).not.toHaveBeenCalled()
        expect(f.messages.find).toHaveBeenCalledTimes(4)
    })
    it('does not load message histories for tree root conversation cards', async () => {
        const f = fixture()
        const page = await f.service.read(context, mapQuerySchema.parse({ projectId, representation: 'segments' }))
        expect(page.nodes[0]).toMatchObject({ kind: 'conversation', title: 'Planning' })
        expect(page.nodes[0].lastHumanMessage).toBeUndefined()
        expect(f.threads.findVisibleMessages).not.toHaveBeenCalled()
        expect(f.messages.find).not.toHaveBeenCalled()
    })
    it('splits the source path at accessible independent conversation forks', async () => {
        const f = fixture()
        f.threads.listByConversation.mockResolvedValue([{ threadId: 'main', metadata: {}, headMessageId: 'c' }])
        f.repository.findAndCount.mockResolvedValue([[{ id: 'copy', branchSource: { messageId: 'a' } }], 1])
        f.messages.find.mockResolvedValue([
            { id: 'h', role: 'human', content: 'Question' },
            { id: 'a', role: 'ai', content: 'Reply', parentId: 'h' },
            { id: 'c', role: 'human', content: 'Continue', parentId: 'a' }
        ])
        const page = await f.service.read(
            context,
            mapQuerySchema.parse({ projectId, conversationId, representation: 'segments' })
        )
        expect(page.nodes.map((node) => node.endMessageId)).toEqual(['a', 'c'])
        expect(page.nodes[1].parentId).toBe(page.nodes[0].id)
    })
    it('keeps legacy branch, turn and search reads even when segment representation is available', async () => {
        const f = fixture()
        f.threads.requireByThreadId.mockResolvedValue({ conversationId, threadId: 'main' })
        const legacy = await f.service.read(context, mapQuerySchema.parse({ projectId, conversationId }))
        expect(legacy.nodes.every((node) => node.kind === 'thread')).toBe(true)
        const turns = await f.service.read(
            context,
            mapQuerySchema.parse({ projectId, conversationId, threadId: 'main', representation: 'segments' })
        )
        expect(turns.nodes.every((node) => node.kind === 'turn')).toBe(true)
        const search = await f.service.read(
            context,
            mapQuerySchema.parse({ projectId, search: 'Delivery', representation: 'segments' })
        )
        expect(search.nodes.every((node) => node.kind === 'turn')).toBe(true)
    })
    it('checks conversation access and project scope before reading tree paths', async () => {
        const f = fixture()
        await expect(
            f.service.read(
                context,
                mapQuerySchema.parse({ conversationId, projectId: null, representation: 'segments' })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.threads.findVisibleMessages).not.toHaveBeenCalled()
        f.conversations.assertAccess.mockRejectedValue(new ForbiddenException())
        await expect(
            f.service.read(context, mapQuerySchema.parse({ conversationId, projectId, representation: 'segments' }))
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.threads.listByConversation).not.toHaveBeenCalled()
        expect(f.messages.find).not.toHaveBeenCalled()
    })
    it('reads the latest human question on the current branch for conversation cards', async () => {
        const f = fixture()
        const updatedAt = new Date('2026-10-07T05:30:00Z')
        f.threads.requireByThreadId.mockResolvedValue({ conversationId, updatedAt })
        const page = await f.service.read(context, mapQuerySchema.parse({ projectId, limit: 1 }))
        expect(f.threads.findVisibleMessages).toHaveBeenCalledWith('main', {
            where: { role: 'human' },
            order: { createdAt: 'DESC' },
            take: 1
        })
        expect(page.nodes[0]).toMatchObject({
            title: 'Planning',
            updatedAt: updatedAt.toISOString(),
            lastHumanMessage: { id: 'h', text: 'Delivery risk', inherited: false }
        })
    })
    it('adds owning conversation context and inherited questions only to the requested branch page', async () => {
        const f = fixture()
        const page = await f.service.read(
            context,
            mapQuerySchema.parse({ projectId, conversationId, offset: 1, limit: 1 })
        )
        expect(page.nodes).toHaveLength(1)
        expect(page.nodes[0]).toMatchObject({
            threadId: 'side',
            conversationTitle: 'Planning',
            lastHumanMessage: { id: 'h', text: 'Delivery risk', inherited: true }
        })
        expect(f.threads.findVisibleMessages).toHaveBeenCalledTimes(1)
        expect(f.threads.findVisibleMessages).toHaveBeenCalledWith('side', {
            where: { role: 'human' },
            order: { createdAt: 'DESC' },
            take: 1
        })
    })
    it('rejects a foreign current-branch pointer before loading conversation card content', async () => {
        const f = fixture()
        f.threads.requireByThreadId.mockResolvedValue({ conversationId: 'foreign' })
        await expect(f.service.read(context, mapQuerySchema.parse({ projectId }))).rejects.toBeInstanceOf(
            ForbiddenException
        )
        expect(f.threads.findVisibleMessages).not.toHaveBeenCalled()
    })
    it('deduplicates a shared message search hit and exposes its branch choices', async () => {
        const f = fixture()
        const page = await f.service.read(context, mapQuerySchema.parse({ projectId, search: 'Delivery' }))
        expect(page.nodes).toHaveLength(1)
        expect(page.nodes[0].threadIds).toEqual(['main', 'side'])
        expect(JSON.stringify(page)).not.toContain('outputCheckpoint')
    })
    it('rejects a thread from another conversation before reading its history', async () => {
        const f = fixture()
        f.threads.requireByThreadId.mockResolvedValue({ conversationId: 'foreign' })
        await expect(
            f.service.read(context, mapQuerySchema.parse({ projectId, conversationId, threadId: 'foreign' }))
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.threads.findVisibleMessages).not.toHaveBeenCalled()
    })
    it('keeps deleted source provenance as a non-owning link', async () => {
        const f = fixture()
        f.repository.findAndCount.mockResolvedValue([
            [
                {
                    id: conversationId,
                    title: 'Copy',
                    branchSource: { conversationId: 'deleted-source', messageId: 'source-message' }
                }
            ],
            1
        ])
        const page = await f.service.read(context, mapQuerySchema.parse({ projectId }))
        expect(page.nodes[0].sourceConversationId).toBe('deleted-source')
        expect(page.nodes[0].parentId).toBe(`project:${projectId}`)
    })
    it('checks management permissions for rename', async () => {
        const f = fixture()
        f.conversations.assertAccess.mockRejectedValue(new ForbiddenException())
        await expect(f.service.act(context, { type: 'rename', conversationId, title: 'New' })).rejects.toBeInstanceOf(
            ForbiddenException
        )
        expect(f.conversations.assertAccess).toHaveBeenCalledWith(conversationId, 'manage')
        expect(f.conversations.update).not.toHaveBeenCalled()
    })
    it('passes the stable retry key and exact source to side-chat and the branch command', async () => {
        const f = fixture()
        await f.service.act(context, { type: 'side-chat', conversationId, threadId: 'main', requestId: 'retry' })
        expect(f.threads.copyThread).toHaveBeenCalledWith('main', { mode: 'latest-sealed-reply', requestId: 'retry' })
        await f.service.act(context, {
            type: 'branch',
            conversationId,
            threadId: 'main',
            messageId: 'answer',
            requestId: 'retry'
        })
        expect(f.commands.execute).toHaveBeenCalledWith(
            new ConversationBranchCommand(conversationId, {
                sourceThreadId: 'main',
                afterMessageId: 'answer',
                requestId: 'retry'
            })
        )
    })
    it('paginates matches inside a conversation without dropping or repeating a hit', async () => {
        const f = fixture()
        f.repository.findAndCount.mockResolvedValue([[{ id: conversationId, threadId: 'main', title: 'Plan' }], 1])
        f.threads.findVisibleMessages.mockResolvedValue({
            items: Array.from({ length: 5 }, (_, i) => ({
                id: `hit-${i}`,
                role: 'human',
                content: `Delivery ${i}`,
                createdInThreadId: 'main'
            }))
        })
        const q = mapQuerySchema.parse({ projectId, search: 'Delivery', limit: 2 })
        const first = await f.service.read(context, q)
        const second = await f.service.read(context, {
            ...q,
            offset: first.nextOffset!,
            searchOffset: first.nextSearchOffset!
        })
        const third = await f.service.read(context, {
            ...q,
            offset: second.nextOffset!,
            searchOffset: second.nextSearchOffset!
        })
        expect([...first.nodes, ...second.nodes, ...third.nodes].map((n) => n.messageId)).toEqual([
            'hit-0',
            'hit-1',
            'hit-2',
            'hit-3',
            'hit-4'
        ])
        expect(third.nextOffset).toBeNull()
    })
})
