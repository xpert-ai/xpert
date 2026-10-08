import {
    appendMessageContent,
    appendMessagePlainText,
    ChatMessageEventTypeEnum,
    ChatMessageTypeEnum,
    createResourceCardContent,
    stringifyMessageContent,
    type CopilotChatMessage
} from '@xpert-ai/contracts'
import { bindResourceCardEvent } from './resource-card-event'
const card = createResourceCardContent({
    resource: { namespace: 'platform', type: 'result', id: 'task' },
    title: 'Tests',
    open: { target: 'workbench.view', viewKey: 'platform.agent-results__results', selectionId: 'task' }
})
describe('resource cards in conversation replies', () => {
    it.each([null, {}, { type: 'event', data: card }, { type: 'message', data: { type: 'resource_card', data: {} } }])(
        'ignores invalid envelopes without fabricating a resource',
        (value) => {
            expect(bindResourceCardEvent(value, { messageId: 'current' })).toBeNull()
        }
    )
    it('binds to the current reply, discarding a forged owner', () => {
        const event = bindResourceCardEvent(
            { type: 'message', data: { ...card, messageId: 'other', executionId: 'other' } },
            { messageId: 'current', executionId: 'execution' }
        )
        expect(event.data.messageId).toBe('current')
        expect(event.data.executionId).toBe('execution')
    })
    it('discards forged execution ownership when the host has no execution', () => {
        const event = bindResourceCardEvent(
            { type: 'message', data: { ...card, executionId: 'forged' } },
            { messageId: 'current' }
        )
        expect(event.data).not.toHaveProperty('executionId')
    })
    it('upserts repeated polling receipts without changing model text', () => {
        const message: CopilotChatMessage = { role: 'assistant', content: 'Completed' }
        appendMessageContent(message, card)
        appendMessageContent(message, { ...card, data: { ...card.data, title: 'Updated' } })
        expect(
            Array.isArray(message.content) && message.content.filter((item) => item.type === 'resource_card')
        ).toHaveLength(1)
        expect(stringifyMessageContent(message.content)).toBe('Completed')
    })
})

const content = createResourceCardContent({
    resource: { namespace: 'platform', type: 'scheduled-task', id: 'task' },
    title: 'Task',
    open: { target: 'workbench.view', viewKey: 'platform.scheduler__detail', selectionId: 'task' }
})
describe('resource card message binding', () => {
    it('overrides forged reply and execution ids before SSE and persistence', () => {
        const event = bindResourceCardEvent(
            {
                type: ChatMessageTypeEnum.EVENT,
                event: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
                data: { ...content, messageId: 'other', executionId: 'other-execution' }
            },
            { messageId: 'reply', executionId: 'run' }
        )
        expect(event).toEqual({
            type: ChatMessageTypeEnum.MESSAGE,
            data: { ...content, messageId: 'reply', executionId: 'run' }
        })
    })
    it('persists once, survives serialization and does not enter plain model text', () => {
        const message: CopilotChatMessage = { role: 'ai', content: 'Created', status: 'thinking' }
        appendMessageContent(message, content)
        appendMessageContent(message, content)
        expect(message.content).toHaveLength(2)
        expect(message.status).toBe('thinking')
        expect(JSON.parse(JSON.stringify(message)).content[1]).toEqual(content)
        expect(appendMessagePlainText('Created', content)).toBe('Created')
    })
    it('does not treat unrelated chat events or malformed targets as cards', () => {
        expect(
            bindResourceCardEvent({ type: 'event', event: 'on_tool_end', data: content }, { messageId: 'reply' })
        ).toBeNull()
        expect(
            bindResourceCardEvent(
                { type: 'message', data: { ...content, data: { ...content.data, open: { target: 'url' } } } },
                { messageId: 'reply' }
            )
        ).toBeNull()
    })
})
