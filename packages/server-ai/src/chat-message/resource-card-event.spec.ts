import {
    appendMessageContent,
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
