import { Logger } from '@nestjs/common'
import { Subscriber } from 'rxjs'
import { createResourceCardContent } from '@xpert-ai/contracts'
import { RESOURCE_CARD_EVENT } from '@xpert-ai/plugin-sdk'
import { createMapStreamEvents } from './agent'
import { bindResourceCardEvent } from '../chat-message/resource-card-event'

jest.mock('../shared', () => ({
    AgentStateAnnotation: { State: {} },
    createTextChunk: jest.requireActual('../shared/agent/stream-text').createTextChunk
}))

describe('custom resource card stream events', () => {
    it('streams a ChatKit card and binds it to the actual host reply', () => {
        const events: MessageEvent[] = []
        const map = createMapStreamEvents(
            new Logger('test'),
            new Subscriber<MessageEvent>({
                next: (event: MessageEvent) => {
                    events.push(event)
                },
                error: (error: unknown) => {
                    throw error
                },
                complete: () => {}
            }),
            { unmutes: [] }
        )
        const card = createResourceCardContent({
            resource: { namespace: 'platform', type: 'result', id: 'task' },
            title: 'Done',
            open: { target: 'workbench.view', viewKey: 'platform.agent-results__results', selectionId: 'task' }
        })
        map({
            event: 'on_custom_event',
            name: RESOURCE_CARD_EVENT,
            tags: [],
            metadata: {},
            data: { ...card, messageId: 'forged', executionId: 'forged' }
        })
        expect(events).toHaveLength(1)
        expect(bindResourceCardEvent(events[0].data, { messageId: 'reply', executionId: 'execution' })).toEqual({
            type: 'message',
            data: { ...card, messageId: 'reply', executionId: 'execution' }
        })
        map({
            event: 'on_custom_event',
            name: RESOURCE_CARD_EVENT,
            tags: [],
            metadata: {},
            data: { type: 'resource_card', data: {} }
        })
        expect(events).toHaveLength(1)
    })
})
