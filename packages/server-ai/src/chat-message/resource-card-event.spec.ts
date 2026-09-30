import {
    ChatMessageEventTypeEnum,
    ChatMessageTypeEnum,
    createResourceCardContent,
    appendMessageContent,
    appendMessagePlainText
} from '@xpert-ai/contracts'
import type { CopilotChatMessage } from '@xpert-ai/contracts'
import { bindResourceCardEvent } from './resource-card-event'

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
