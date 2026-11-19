import { interruptedToolContent } from './interrupted-tool-messages'
import type { ChatMessage } from '../chat-message/chat-message.entity'

const receipt = { id: 'run', executionId: 'execution', settled: true, settledAt: '2026-11-13T08:00:01.000Z' }
const component = {
    type: 'component',
    id: 'call',
    executionId: 'execution',
    runId: 'run',
    data: { category: 'Tool', status: 'running', output: 'preserved' }
}
describe('interrupted tool projection', () => {
    it('uses explicit receipt identity and preserves all completed outputs and dates', () => {
        const saved: ChatMessage['content'] = [
            component,
            {
                ...component,
                id: 'done',
                data: {
                    ...component.data,
                    status: 'success',
                    end_date: '2026-11-13T08:00:00.500Z'
                }
            }
        ]
        const result = interruptedToolContent(saved, [receipt])
        expect(result).toEqual([
            expect.objectContaining({
                data: expect.objectContaining({ status: 'fail', end_date: receipt.settledAt, output: 'preserved' })
            }),
            saved[1]
        ])
        expect(interruptedToolContent(result, [receipt])).toBe(result)
    })
    it.each([
        { ...component, runId: 'other' },
        { ...component, executionId: 'other' },
        { ...component, runId: undefined },
        { ...component, data: { ...component.data, category: 'Widget' } }
    ])('does not infer tool identity or completion from incidental fields', (item) => {
        const content: ChatMessage['content'] = [item]
        expect(interruptedToolContent(content, [receipt])).toBe(content)
        expect(interruptedToolContent([component], [{ ...receipt, settled: false }])).toEqual([component])
    })
})
