jest.mock('@xpert-ai/server-core', () => ({ RequestContext: { currentUserId: () => 'engineer-auto' } }))
jest.mock('../../chat-conversation/conversation.entity', () => ({ ChatConversation: class {} }))
jest.mock('../../chat-conversation/conversation-thread.service', () => ({ ChatConversationThreadService: class {} }))
jest.mock('../../xpert/published-xpert-access.service', () => ({ PublishedXpertAccessService: class {} }))
jest.mock('../../xpert-project/services/project-access.service', () => ({ XpertProjectAccessService: class {} }))
jest.mock('../../shared/stream/redis-sse.service', () => ({ RedisSseStreamService: class {} }))
jest.mock('i18next', () => ({ t: (key: string) => key }))
import { CommandBus } from '@nestjs/cqrs'
import { ModuleRef } from '@nestjs/core'
import { ChatMessageEventTypeEnum, type EvolutionChange } from '@xpert-ai/contracts'
import { ChatConversationUpsertCommand } from '../../chat-conversation/commands/upsert.command'
import { ChatMessageUpsertCommand } from '../../chat-message/commands/upsert.command'
import { XpertAgentExecutionUpsertCommand } from '../../xpert-agent-execution/commands/upsert.command'
import { ChatConversationThreadService } from '../../chat-conversation/conversation-thread.service'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { RedisSseStreamService } from '../../shared/stream/redis-sse.service'
import { EvolutionExecutionConversationService } from './execution-conversation.service'
import { messageAncestorPath } from '../../chat-conversation/message-path'

const change = () =>
    ({
        changeId: 'EVO-auto-1',
        status: 'preparing',
        strategy: { definition: { evaluations: [{ key: 'checks' }] } },
        executionContext: {
            xpertId: 'assistant-auto',
            projectId: 'project-auto',
            title: '汽车电机颜色',
            input: '要求：汽车电机颜色为蓝色。建议增加颜色字段。',
            language: 'zh-Hans'
        }
    }) as EvolutionChange
function harness() {
    const messages = new Map<string, ChatMessageUpsertCommand['entity']>()
    const commands = {
        execute: jest.fn(
            async (
                command: ChatConversationUpsertCommand | ChatMessageUpsertCommand | XpertAgentExecutionUpsertCommand
            ) => {
                if (command instanceof ChatMessageUpsertCommand) {
                    const value = { ...messages.get(command.entity.id), ...command.entity }
                    messages.set(value.id, value)
                    return value
                }
                if (command instanceof XpertAgentExecutionUpsertCommand) return command.execution
                return { ...command.entity, createdAt: new Date(), updatedAt: new Date() }
            }
        )
    }
    const threads = {
        ensurePrimary: jest.fn(async () => ({ headMessageId: null })),
        updateRuntimeState: jest.fn(),
        advanceHead: jest.fn()
    }
    const access = { getAccessiblePublishedXpert: jest.fn() }
    const projects = { assertCanUseXpert: jest.fn() }
    const streams = { appendEvent: jest.fn(), appendCompleteEvent: jest.fn() }
    const modules = {
        get: (token: unknown) => {
            if (token === ChatConversationThreadService) return threads
            if (token === PublishedXpertAccessService) return access
            if (token === XpertProjectAccessService) return projects
            if (token === RedisSseStreamService) return streams
            throw new Error('Unexpected service')
        }
    }
    return {
        service: new EvolutionExecutionConversationService(commands as unknown as CommandBus, modules as ModuleRef),
        commands,
        messages,
        threads,
        access,
        projects,
        streams
    }
}

it('persists a scoped conversation and streams the actual draft and failed checks through ChatKit', async () => {
    const h = harness()
    const input = change()
    const session = await h.service.start(input)
    expect(h.access.getAccessiblePublishedXpert).toHaveBeenCalledWith('assistant-auto')
    expect(h.projects.assertCanUseXpert).toHaveBeenCalledWith('project-auto', 'assistant-auto')
    expect(h.commands.execute).toHaveBeenCalledWith(
        expect.objectContaining({
            entity: expect.objectContaining({
                xpertId: 'assistant-auto',
                projectId: 'project-auto',
                createdById: 'engineer-auto'
            })
        })
    )
    expect([...h.messages.values()].find((m) => m.role === 'human')?.content).toBe(input.executionContext.input)
    input.candidate = {
        artifact: { uri: 'draft:auto', hash: 'draft-hash', schemaVersion: '1', mediaType: 'application/json' },
        baseline: { resourceId: 'baseline-auto', version: '1', hash: 'baseline' },
        summary: '新增汽车电机颜色',
        changes: [{ path: 'features.auto_color', operation: 'add', summary: '颜色', after: '{"type":"string"}' }],
        warnings: []
    }
    await h.service.drafted(session, input)
    expect(session.phase).toBe('evaluation')
    input.status = 'test_failed'
    input.evaluation = {
        runId: 'check-auto',
        candidateHash: 'draft-hash',
        baselineHash: 'baseline',
        evidenceHash: 'evidence',
        datasetVersion: '1',
        datasetHash: 'dataset',
        passed: false,
        completedAt: new Date().toISOString(),
        readiness: [],
        checks: [
            {
                checkId: 'quote-auto',
                title: '来源引用检查',
                kind: 'evidence',
                origin: 'business_evidence',
                passed: false,
                blocking: true,
                details: '原文缺少所引用的段落',
                evidenceRefs: []
            }
        ]
    }
    await h.service.finish(session, input)
    const ai = [...h.messages.values()].filter((m) => m.role === 'ai')
    expect(ai).toHaveLength(2)
    expect(ai[0].content).toContain('新增汽车电机颜色')
    expect(ai[1].content).toContain('原文缺少所引用的段落')
    expect(ai[1].parentId).toBe(ai[0].id)
    expect(h.streams.appendEvent).toHaveBeenCalledWith(
        session.reference.threadId,
        session.reference.executionId,
        expect.objectContaining({
            event: ChatMessageEventTypeEnum.ON_MESSAGE_END,
            data: expect.objectContaining({ role: 'ai', conversationId: session.reference.conversationId })
        })
    )
    expect(h.streams.appendCompleteEvent).toHaveBeenCalledWith(
        session.reference.threadId,
        session.reference.executionId
    )
    expect(h.threads.updateRuntimeState).toHaveBeenLastCalledWith(session.reference.threadId, 'idle', null)
})

it('keeps one conversation per change and isolates queue retry streams and messages', async () => {
    const h = harness()
    const first = await h.service.start(change())
    const replay = await h.service.start(change())
    const retry = await h.service.start({ ...change(), changeId: 'EVO-auto-2' })
    expect(first.reference.conversationId).toBe(replay.reference.conversationId)
    expect(first.reference.executionId).not.toBe(replay.reference.executionId)
    expect(retry.reference.conversationId).not.toBe(first.reference.conversationId)
    expect(h.messages.size).toBe(6)
})

it('does not create records when project or assistant access is denied', async () => {
    const h = harness()
    h.projects.assertCanUseXpert.mockRejectedValueOnce(new Error('access denied'))
    await expect(h.service.start(change())).rejects.toThrow('access denied')
    expect(h.commands.execute).not.toHaveBeenCalled()
})

it('records generation failures and closes the same execution stream', async () => {
    const h = harness()
    const input = change()
    const session = await h.service.start(input)
    await h.service.finish(session, input, 'provider unavailable')
    expect(session.message.content).toContain('provider unavailable')
    expect(session.message.status).toBe('error')
    expect(h.threads.updateRuntimeState).toHaveBeenLastCalledWith(
        session.reference.threadId,
        'error',
        'provider unavailable'
    )
    expect(h.streams.appendCompleteEvent).toHaveBeenCalledTimes(1)
})

it('leaves older or non-conversational evolution targets unchanged', async () => {
    const h = harness()
    const input = change()
    delete input.executionContext
    expect(await h.service.start(input)).toBeUndefined()
    expect(h.commands.execute).not.toHaveBeenCalled()
})

it.each([undefined, 'provider unavailable'])(
    'finalizes persisted runtime state when Redis rejects events (%s)',
    async (error) => {
        const h = harness()
        const input = change()
        const session = await h.service.start(input)
        h.streams.appendEvent.mockRejectedValue(new Error('Redis unavailable'))
        h.streams.appendCompleteEvent.mockRejectedValue(new Error('Redis unavailable'))

        await expect(h.service.finish(session, input, error)).resolves.toBeUndefined()

        const status = error ? 'error' : 'success'
        const conversationStatus = error ? 'error' : 'idle'
        expect(session.message.status).toBe(status)
        expect(h.commands.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                execution: expect.objectContaining({ id: session.reference.executionId, status })
            })
        )
        expect(h.commands.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                entity: expect.objectContaining({ id: session.reference.conversationId, status: conversationStatus })
            })
        )
        expect(h.threads.updateRuntimeState).toHaveBeenLastCalledWith(
            session.reference.threadId,
            conversationStatus,
            error ?? null
        )
        expect(h.streams.appendCompleteEvent).toHaveBeenCalledTimes(1)
    }
)

it('retains a finalizable session when the initial stream event cannot be published', async () => {
    const h = harness()
    const input = change()
    h.streams.appendEvent.mockRejectedValue(new Error('Redis unavailable'))
    const session = await h.service.start(input)
    expect(session.reference.executionId).toBeDefined()
    await h.service.finish(session, input)
    expect(h.threads.updateRuntimeState).toHaveBeenLastCalledWith(session.reference.threadId, 'idle', null)
})

it('writes tree parent relations so ChatKit can load the complete message ancestry, including queue retries', async () => {
    const h = harness()
    const input = change()
    const session = await h.service.start(input)
    input.candidate = {
        artifact: { uri: 'draft:auto', hash: 'draft-hash', schemaVersion: '1', mediaType: 'application/json' },
        baseline: { resourceId: 'baseline-auto', version: '1', hash: 'baseline' },
        summary: 'Add automotive motor finish',
        changes: [],
        warnings: []
    }
    await h.service.drafted(session, input)
    const firstHead = session.message.id
    h.threads.ensurePrimary.mockResolvedValueOnce({ headMessageId: firstHead })
    const retry = await h.service.start({ ...change(), executionConversation: session.reference })
    const messages = [...h.messages.values()]
    expect(messages[0].parent).toBeNull()
    for (const message of messages.slice(1)) {
        expect(message.parent).toEqual({ id: message.parentId })
    }
    // TypeORM closure ancestry is maintained through the relation, not the parentId column.
    const ancestors: ChatMessageUpsertCommand['entity'][] = []
    let cursor = h.messages.get(retry.message.id)
    while (cursor) {
        ancestors.push(cursor)
        cursor = cursor.parent ? h.messages.get(cursor.parent.id) : undefined
    }
    expect(messageAncestorPath(ancestors, retry.message.id).map((message) => message.id)).toEqual(
        messages.map((message) => message.id)
    )
})
