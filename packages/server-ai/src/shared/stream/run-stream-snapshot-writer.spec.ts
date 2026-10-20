import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/contracts'
import { RunStreamSnapshotWriter } from './run-stream-snapshot-writer'
import type { IChatMessage } from '@xpert-ai/contracts'

describe('RunStreamSnapshotWriter', () => {
    it('preserves the pending question and call identity after the interrupt boundary is compacted', () => {
        const writer = new RunStreamSnapshotWriter()
        const operation = {
            tasks: [
                {
                    id: 'task',
                    interrupts: [
                        {
                            id: 'interrupt',
                            value: {
                                clientToolCalls: [
                                    {
                                        id: 'call-1',
                                        name: 'request_user_input',
                                        args: { questions: [{ id: 'q', question: 'Choose?' }] }
                                    }
                                ]
                            }
                        }
                    ]
                }
            ]
        }
        writer.observe(
            { id: 'm', conversationId: 'c', role: 'ai', content: 'Question follows' },
            {
                type: ChatMessageTypeEnum.EVENT,
                event: ChatMessageEventTypeEnum.ON_INTERRUPT,
                data: operation
            }
        )
        expect(writer.capture(true)).toMatchObject({ pendingInterrupt: operation })
        expect(new RunStreamSnapshotWriter().capture(true)).toBeNull()
    })

    it('freezes complete content and IDs at the saved boundary, retaining earlier steer replies', () => {
        jest.spyOn(Date, 'now').mockReturnValue(10_000)
        const writer = new RunStreamSnapshotWriter()
        const first: Partial<IChatMessage> = {
            id: 'm1',
            conversationId: 'c',
            executionId: 'r',
            role: 'ai',
            content: 'first'
        }
        writer.observe(first)
        const saved = writer.capture()
        first.content = 'first plus later delta'
        expect(saved?.messages[0].content).toBe('first')
        expect(writer.capture()).toBeNull()
        writer.observe({ id: 'm2', conversationId: 'c', executionId: 'r', role: 'ai', content: 'second' })
        const final = writer.capture(true)
        expect(final?.messages.map((m) => [m.id, m.content])).toEqual([
            ['m1', 'first plus later delta'],
            ['m2', 'second']
        ])
        expect(final?.activeMessageId).toBe('m2')
        expect(final?.finished).toBe(true)
        jest.restoreAllMocks()
    })
})
