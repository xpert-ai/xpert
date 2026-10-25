import { filterMessageText } from '@xpert-ai/contracts'
import { DisplaySnapshotCapture } from './display-snapshot.capture'

const start = (id = 'ai', content = '') => ({
    type: 'event',
    event: 'on_message_start',
    data: { id, role: 'ai', executionId: 'run', content }
})

describe('display snapshot projection', () => {
    it('owns its inputs and freezes each state without reading ahead from the business message', () => {
        const capture = new DisplaySnapshotCapture()
        capture.capture(start())
        const component = { type: 'component', id: 'tool', data: { category: 'Tool', status: 'running' } }
        const first = capture.capture({ type: 'message', data: component })
        component.data.status = 'success'
        expect(first?.messages[0].content).toEqual([
            { type: 'component', id: 'tool', data: { category: 'Tool', status: 'running' } }
        ])
        expect(capture.capture({ type: 'complete' })?.messages[0].content).toEqual(first?.messages[0].content)
        capture.capture({ type: 'message', data: component })
        expect(first?.messages[0].content).toEqual([
            { type: 'component', id: 'tool', data: { category: 'Tool', status: 'running' } }
        ])
    })
    it('keeps steer messages, coalesces text and drains the final pending text', () => {
        const capture = new DisplaySnapshotCapture()
        capture.capture(start('first'))
        expect(capture.capture({ type: 'message', data: 'a' })).toBeNull()
        expect(capture.capture({ type: 'message', data: 'b' })).toBeNull()
        capture.capture({ type: 'event', event: 'on_message_end', data: { id: 'first', status: 'success' } })
        capture.capture(start('second'))
        capture.capture({ type: 'message', data: 'c' })
        const snapshot = capture.capture({ type: 'complete' })
        expect(snapshot?.messages.map((message) => filterMessageText(message.content))).toEqual(['ab', 'c'])
        expect(snapshot?.activeMessageId).toBe('second')
    })
    it('does not copy checkpoints, execution inputs or agent metadata into the snapshot', () => {
        const capture = new DisplaySnapshotCapture()
        const event = start()
        capture.capture({ ...event, data: { ...event.data, outputCheckpoint: { secret: true } } })
        const snapshot = capture.capture({
            type: 'event',
            event: 'on_agent_start',
            data: { id: 'agent', status: 'running', metadata: { password: 'secret' }, inputs: { secret: true } }
        })
        expect(snapshot?.messages[0].agentRuns).toEqual([{ id: 'agent', status: 'running' }])
        expect(JSON.stringify(snapshot)).not.toContain('secret')
    })
    it('merges tool and reasoning updates using the same persistence reducers', () => {
        const capture = new DisplaySnapshotCapture()
        capture.capture(start())
        capture.capture({
            type: 'message',
            data: {
                type: 'component',
                id: 'tool',
                data: { category: 'Tool', status: 'running', tool: 'sandbox_shell' }
            }
        })
        capture.capture({ type: 'message', data: { type: 'reasoning', id: 'reason', text: 'one' } })
        capture.capture({ type: 'message', data: { type: 'reasoning', id: 'reason', text: ' two' } })
        const snapshot = capture.capture({
            type: 'message',
            data: { type: 'component', id: 'tool', data: { status: 'success' } }
        })
        expect(snapshot?.messages[0].content).toEqual([
            { type: 'component', id: 'tool', data: { category: 'Tool', status: 'success', tool: 'sandbox_shell' } }
        ])
        expect(snapshot?.messages[0].reasoning?.[0].text).toBe('one two')
    })
})
