import { Logger } from '@nestjs/common'
import { Subscriber } from 'rxjs'
import { ChatMessageEventTypeEnum, createResourceCardContent } from '@xpert-ai/contracts'
import { RESOURCE_CARD_EVENT } from '@xpert-ai/plugin-sdk'
import { createMapStreamEvents } from './agent'
import { bindResourceCardEvent } from '../chat-message/resource-card-event'

jest.mock('../shared', () => ({
    AgentStateAnnotation: { State: {} },
    createTextChunk: jest.requireActual('../shared/agent/stream-text').createTextChunk
}))

describe('custom resource card stream events', () => {
    it.each([RESOURCE_CARD_EVENT, ChatMessageEventTypeEnum.ON_CHAT_EVENT])(
        'preserves mixed content blocks and the real child execution for %s',
        (name) => {
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
            const images = [
                {
                    id: 'site',
                    title: '施工平面图',
                    file: { viewKey: 'bid', fileKey: 'image', targetId: 'project:version' }
                }
            ]
            const content = [
                { kind: 'fields' as const, fields: [{ label: '状态', value: '已验收' }] },
                { kind: 'image-gallery' as const, images },
                {
                    kind: 'file-list' as const,
                    files: [
                        {
                            id: 'report',
                            title: '施工报告',
                            file: { viewKey: 'bid', fileKey: 'report', targetId: 'project:version' }
                        }
                    ]
                }
            ]
            const card = createResourceCardContent({
                resource: { namespace: 'bid', type: 'images', id: 'task' },
                title: '施工配图',
                content,
                open: { target: 'workbench.view', viewKey: 'bid' }
            })
            map({
                event: 'on_custom_event',
                name,
                tags: [],
                metadata: { executionId: 'illustrator', parentExecutionId: 'writer' },
                data: { ...card, messageId: 'forged', executionId: 'forged' }
            })
            expect(events).toHaveLength(1)
            expect(bindResourceCardEvent(events[0].data, { messageId: 'root-reply', executionId: 'root-run' })).toEqual(
                {
                    type: 'message',
                    data: { ...card, messageId: 'root-reply', executionId: 'illustrator' }
                }
            )
            expect(card.data.content).toEqual(content)
        }
    )
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
