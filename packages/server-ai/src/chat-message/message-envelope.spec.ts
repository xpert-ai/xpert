import { chatMessagePresentation, isRuntimeChatMessage, TChatMessageEnvelope } from '@xpert-ai/contracts'
import { ChatMessageDTO } from '../ai/dto/conversation.dto'
import { instanceToPlain } from 'class-transformer'
import { publicChatMessage } from './message-branching'
import { visibleChatMessage, visibleChatMessageSql } from './message-envelope'
import { parseChatMessageEnvelope, readChatMessageEnvelope } from './message-envelope.schema'
import { READ_THREAD_PATH_SQL } from '../chat-conversation/thread-history.query'

const agent: TChatMessageEnvelope = {
    version: 1,
    source: { type: 'agent', xpertId: 'sender', agentKey: 'researcher' },
    presentation: 'message',
    target: { xpertId: 'receiver', agentKey: 'writer', conversationId: 'conversation', threadId: 'thread' },
    correlation: { invocationId: 'invocation', executionId: 'execution', messageId: 'original' }
}

describe('host message envelopes', () => {
    it.each(['message', 'event', 'runtime'] as const)(
        'chooses presentation independently of the Agent source: %s',
        (presentation) => {
            const messageEnvelope = { ...agent, presentation }
            expect(parseChatMessageEnvelope({ messageEnvelope })).toEqual(messageEnvelope)
            const message = { messageEnvelope }
            expect(chatMessagePresentation(message)).toBe(presentation)
            expect(isRuntimeChatMessage(message)).toBe(presentation === 'runtime')
        }
    )

    it.each([
        { type: 'user', userId: 'owner' },
        { type: 'voice', sessionId: 'session' },
        { type: 'assistant', xpertId: 'sender' },
        { type: 'runtime', provider: 'opencode', bindingId: 'binding', invocationId: 'invocation' },
        { type: 'automation', taskId: 'scheduled-task' }
    ])('supports an explicit source without making it private: %j', (source) => {
        const messageEnvelope = { ...agent, source }
        expect(parseChatMessageEnvelope({ messageEnvelope })?.source).toEqual(source)
        expect(isRuntimeChatMessage({ messageEnvelope })).toBe(false)
    })

    it.each([
        { ...agent, version: 2 },
        { ...agent, presentation: 'secret' },
        { ...agent, source: { type: 'agent', xpertId: 'sender' } },
        { ...agent, source: { type: 'runtime', provider: 'opencode', bindingId: 'binding' } },
        { ...agent, source: { type: 'runtime', provider: 'opencode', bindingId: 'binding', invocationId: 'other' } },
        {
            ...agent,
            source: {
                type: 'runtime',
                provider: 'opencode',
                bindingId: 'binding',
                invocationId: 'invocation',
                xpertId: 'invented'
            }
        },
        { ...agent, target: { ...agent.target, tenantId: 'forged' } },
        { ...agent, runtimePrincipal: { type: 'assistant' } }
    ])('rejects invalid or authority-bearing envelopes at the command boundary', (messageEnvelope) => {
        expect(() => parseChatMessageEnvelope({ messageEnvelope })).toThrow()
        expect(readChatMessageEnvelope({ messageEnvelope })).toBeUndefined()
    })

    it.each([
        false,
        [],
        'runtime',
        { version: 2, presentation: 'message' },
        { version: 1 },
        { version: '1', presentation: 'message' }
    ])('keeps unknown persisted presentation private: %j', (messageEnvelope) => {
        expect(isRuntimeChatMessage({ messageEnvelope })).toBe(true)
    })

    it('preserves ordinary messages with no envelope', () => {
        for (const messageEnvelope of [undefined, null]) {
            expect(isRuntimeChatMessage({ messageEnvelope })).toBe(false)
            expect(readChatMessageEnvelope({ messageEnvelope })).toBeUndefined()
        }
        expect(parseChatMessageEnvelope({})).toBeUndefined()
    })

    it('preserves distinct project task, attempt and reply correlations on external runtime messages', () => {
        const messageEnvelope: TChatMessageEnvelope = {
            ...agent,
            source: { type: 'runtime', provider: 'opencode', bindingId: 'binding', invocationId: 'invocation' },
            correlation: {
                ...agent.correlation,
                taskId: 'platform-task',
                projectTaskId: 'project-task',
                taskExecutionId: 'attempt',
                replyToMessageId: 'dispatch-message'
            }
        }
        expect(publicChatMessage({ messageEnvelope }).messageEnvelope).toEqual(messageEnvelope)
        expect(instanceToPlain(new ChatMessageDTO({ messageEnvelope })).messageEnvelope).toEqual(messageEnvelope)
    })

    it('does not interpret third-party payloads as host provenance or presentation', () => {
        const message = {
            messageEnvelope: null,
            thirdPartyMessage: { messageEnvelope: { ...agent, presentation: 'runtime' } }
        }
        expect(isRuntimeChatMessage(message)).toBe(false)
        expect(readChatMessageEnvelope(message)).toBeUndefined()
    })

    it('projects the same validated provenance in HTTP and SSE without relation trees or raw host markers', () => {
        const message = {
            role: 'human' as const,
            content: 'Research result',
            messageEnvelope: agent,
            thirdPartyMessage: { model: 'model' }
        }
        const http = instanceToPlain(new ChatMessageDTO(message))
        const stream = publicChatMessage({
            ...message,
            parent: { role: 'human', content: 'Private parent' },
            children: []
        })
        expect(http.messageEnvelope).toEqual(agent)
        expect(stream.messageEnvelope).toEqual(agent)
        expect(http).not.toHaveProperty('thirdPartyMessage')
        expect(stream.thirdPartyMessage).toEqual({ model: 'model' })
        expect(stream).not.toHaveProperty('parent')
        expect(stream).not.toHaveProperty('children')
        expect(publicChatMessage({ messageEnvelope: agent }).messageEnvelope).toEqual(agent)
    })

    it('uses one SQL policy for paginated history and recursive turn boundaries', () => {
        expect(visibleChatMessage().getSql('message.messageEnvelope')).toBe(
            visibleChatMessageSql('message.messageEnvelope')
        )
        expect(READ_THREAD_PATH_SQL.split(visibleChatMessageSql('m."messageEnvelope"'))).toHaveLength(3)
    })
})
