import { ChatMessage } from '../../chat-message/chat-message.entity'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { Repository } from 'typeorm'
import { ChatThreadPurpose } from '@xpert-ai/contracts'
import { ConversationTitleService } from '../../shared/agent/conversation-title.service'
import type { AgentStateAnnotation } from '../../shared/agent/state'
import { ChatConversationThread } from '../conversation-thread.entity'
import { ChatConversation } from '../conversation.entity'
import { ThreadDTO } from '../../ai/dto/thread.dto'
import { saveSideChatTitle } from './save-title'
import { SaveSideChatTitleCommand } from './operations'

function generator() {
    const queries = { execute: jest.fn().mockResolvedValue({ pending: true, input: 'Compare two deployment plans' }) }
    const commands = { execute: jest.fn().mockResolvedValue(true) }
    const service = new ConversationTitleService(
        commands as unknown as CommandBus,
        queries as unknown as QueryBus,
        {} as I18nService
    )
    const generate = jest.spyOn(service, 'generateStatePatch').mockResolvedValue({ title: 'Deployment comparison' })
    const state = {
        title: 'Inherited parent title',
        messages: [new HumanMessage('Parent discussion'), new AIMessage('Side answer')]
    } as typeof AgentStateAnnotation.State
    return { service, generate, queries, commands, options: { state, config: { configurable: { thread_id: 'side' } } } }
}

describe('side-chat title generation', () => {
    it('uses the side question despite an inherited title, without patching graph state', async () => {
        const f = generator()
        expect(await f.service.generateThreadStatePatch(f.options)).toBeNull()
        expect(f.generate.mock.calls[0][0].state.messages.map((message) => message.content)).toEqual([
            'Compare two deployment plans',
            'Side answer'
        ])
        expect(f.commands.execute).toHaveBeenCalledWith(new SaveSideChatTitleCommand('side', 'Deployment comparison'))
        expect(f.options.state.title).toBe('Inherited parent title')
    })
    it.each([false, true])('preserves main conversation title behavior (existing: %s)', async (existing) => {
        const f = generator()
        f.queries.execute.mockResolvedValue(null)
        f.options.state.title = existing ? 'Existing title' : ''
        await f.service.generateThreadStatePatch(f.options)
        expect(f.generate).toHaveBeenCalledTimes(existing ? 0 : 1)
        expect(f.commands.execute).not.toHaveBeenCalled()
    })
    it('does not generate again after an automatic or manual title was saved', async () => {
        const f = generator()
        f.queries.execute.mockResolvedValue({ pending: false, input: '' })
        await f.service.generateThreadStatePatch(f.options)
        expect(f.generate).not.toHaveBeenCalled()
    })
    it('keeps a successful reply intact if title context cannot be read', async () => {
        const f = generator()
        f.queries.execute.mockRejectedValueOnce(new Error('Storage unavailable'))
        await expect(f.service.generateThreadStatePatch(f.options)).resolves.toBeNull()
        expect(f.generate).not.toHaveBeenCalled()
    })
    it('retains the first-question fallback on model failure or cancellation', async () => {
        const f = generator()
        f.generate.mockRejectedValueOnce(new Error('Model unavailable'))
        await expect(f.service.generateThreadStatePatch(f.options)).resolves.toBeNull()
        const controller = new AbortController()
        f.generate.mockImplementationOnce(async () => {
            controller.abort()
            return { title: 'Late result' }
        })
        await f.service.generateThreadStatePatch({
            ...f.options,
            config: { ...f.options.config, signal: controller.signal }
        })
        expect(f.commands.execute).not.toHaveBeenCalled()
    })
    it('waits for a user input and an answer instead of naming a tool call', async () => {
        const f = generator()
        f.queries.execute.mockResolvedValueOnce({ pending: true, input: '' })
        await f.service.generateThreadStatePatch(f.options)
        f.options.state.messages = [new AIMessage({ content: '', tool_calls: [{ id: 't', name: 'search', args: {} }] })]
        await f.service.generateThreadStatePatch(f.options)
        expect(f.generate).not.toHaveBeenCalled()
    })
})

describe('side-chat title ownership', () => {
    const thread = (): ChatConversationThread =>
        Object.assign(new ChatConversationThread(), {
            id: 'row',
            tenantId: 'tenant',
            conversationId: 'conversation',
            metadata: { purpose: ChatThreadPurpose.SideChat, titleSource: 'default' as const }
        })
    function storage(affected = 1) {
        const query = {
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            setParameters: jest.fn().mockReturnThis(),
            setParameter: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({ affected })
        }
        return {
            query,
            repository: { createQueryBuilder: () => query } as unknown as Repository<ChatConversationThread>
        }
    }
    it('compares ownership atomically and scopes the write to the authorized thread', async () => {
        const f = storage(0)
        expect(await saveSideChatTitle(f.repository, thread(), 'Late model title', 'generated')).toBe(false)
        expect(f.query.where).toHaveBeenCalledWith({ id: 'row', conversationId: 'conversation', tenantId: 'tenant' })
        expect(f.query.andWhere).toHaveBeenCalledWith("metadata ->> 'titleSource' = 'default'")
    })
    it('only writes the first-question fallback once, allowing a later model title', async () => {
        const f = storage()
        expect(await saveSideChatTitle(f.repository, thread(), 'First question', 'default')).toBe(true)
        expect(f.query.andWhere).toHaveBeenCalledWith("COALESCE(metadata ->> 'title', '') = ''")
        expect(f.query.setParameters).toHaveBeenCalledWith({ title: 'First question', titleSource: 'default' })
    })
    it.each(['manual', 'generated', undefined] as const)('preserves %s title provenance', async (titleSource) => {
        const f = storage(),
            row = thread()
        row.metadata = { ...row.metadata, titleSource, title: 'Chosen name' }
        expect(await saveSideChatTitle(f.repository, row, 'Overwrite', 'generated')).toBe(false)
        expect(f.query.execute).not.toHaveBeenCalled()
    })
    it('never exposes the parent title as an untitled side-chat label', () => {
        const conversation = Object.assign(new ChatConversation(), { id: 'conversation', title: 'Parent name' })
        expect(new ThreadDTO(conversation, {}, thread()).metadata.title).toBe('')
        const named = thread()
        named.metadata.title = 'Independent title'
        expect(new ThreadDTO(conversation, {}, named).metadata.title).toBe('Independent title')
    })
})

describe('side-chat title integration', () => {
    it('seeds a first-question label when the assistant reply becomes the thread head', async () => {
        const { ChatConversationThreadService } = await import('../conversation-thread.service')
        const row = Object.assign(new ChatConversationThread(), {
            id: 'row',
            threadId: 'side',
            conversationId: 'conversation',
            tenantId: 'tenant',
            metadata: { purpose: ChatThreadPurpose.SideChat, titleSource: 'default' as const }
        })
        const query = {
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            setParameters: jest.fn().mockReturnThis(),
            setParameter: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({ affected: 1 })
        }
        const repository = {
            update: jest.fn().mockResolvedValue({}),
            createQueryBuilder: () => query
        } as unknown as Repository<ChatConversationThread>
        const messageRepository = {
            findOne: jest.fn().mockResolvedValue({ id: 'reply', role: 'ai', createdInThreadId: 'side' })
        } as unknown as Repository<ChatMessage>
        const service = new ChatConversationThreadService(repository, messageRepository, null, null, null, null)
        jest.spyOn(service, 'requireByThreadId').mockResolvedValue(row)
        const visible = jest.spyOn(service, 'findVisibleMessages').mockResolvedValue({
            items: [Object.assign(new ChatMessage(), { content: 'Compare\n deployment options' })],
            total: 1
        })
        await service.advanceHead('side', 'reply')
        expect(visible).toHaveBeenCalledWith('side', {
            where: { createdInThreadId: 'side', role: 'human' },
            order: { createdAt: 'ASC' },
            take: 1
        })
        expect(query.setParameters).toHaveBeenCalledWith({
            title: 'Compare deployment options',
            titleSource: 'default'
        })
        await service.renameThread('side', 'User name')
        const update = query.set.mock.calls.at(-1)[0]
        expect(update.metadata()).toContain("'titleSource', 'manual'")
        expect(row.metadata.titleSource).toBe('manual')
    })
    it('wires the title query and command through CQRS and excludes inherited messages', async () => {
        const { Test } = await import('@nestjs/testing')
        const { CqrsModule } = await import('@nestjs/cqrs')
        const { ChatConversationThreadService } = await import('../conversation-thread.service')
        const { ReadSideChatTitleHandler, SaveSideChatTitleHandler } = await import('./handlers')
        const { ReadSideChatTitleQuery } = await import('./operations')
        const threads = {
            findByThreadId: jest
                .fn()
                .mockResolvedValue({ metadata: { purpose: ChatThreadPurpose.SideChat, titleSource: 'default' } }),
            findVisibleMessages: jest.fn().mockResolvedValue({ items: [{ content: 'New side question' }] })
        }
        const module = await Test.createTestingModule({
            imports: [CqrsModule],
            providers: [
                ReadSideChatTitleHandler,
                SaveSideChatTitleHandler,
                { provide: ChatConversationThreadService, useValue: threads }
            ]
        }).compile()
        await module.init()
        try {
            expect(await module.get(QueryBus).execute(new ReadSideChatTitleQuery('side'))).toEqual({
                pending: true,
                input: 'New side question'
            })
            expect(threads.findVisibleMessages).toHaveBeenCalledWith(
                'side',
                expect.objectContaining({ where: { createdInThreadId: 'side', role: 'human' } })
            )
            threads.findByThreadId.mockResolvedValue({
                metadata: { purpose: ChatThreadPurpose.SideChat, titleSource: 'manual' }
            })
            expect(await module.get(QueryBus).execute(new ReadSideChatTitleQuery('side'))).toEqual({
                pending: false,
                input: ''
            })
        } finally {
            await module.close()
        }
    })
})
