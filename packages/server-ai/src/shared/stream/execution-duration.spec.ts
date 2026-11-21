import { serializeRunStreamPayload } from './run-stream-payload'
import { DisplaySnapshotCapture } from './display-snapshot/display-snapshot.capture'
import { executionDuration } from './execution-duration'

describe('execution duration at the event boundary', () => {
    it.each([
        [163097, 163097],
        ['163097', 163097],
        ['12.5', 12.5],
        [0, 0],
        [null, undefined],
        ['', undefined],
        ['NaN', undefined],
        [Infinity, undefined],
        [-1, undefined],
        [false, undefined]
    ])('normalizes %p without inventing a duration', (input, expected) => {
        expect(executionDuration(input)).toBe(expected)
    })
    it.each(['success', 'error', 'interrupted'])('retains %s in serialization and historical replay', (status) => {
        const event = {
            type: 'event',
            event: 'on_agent_end',
            data: { id: 'child', status, elapsedTime: '163097', inputs: { secret: true } }
        }
        const serialized = serializeRunStreamPayload(event)
        expect(serialized).toEqual({ ...event, data: { id: 'child', status, elapsedTime: 163097 } })
        for (const end of [event, serialized]) {
            const capture = new DisplaySnapshotCapture()
            capture.capture({ type: 'event', event: 'on_message_start', data: { id: 'message', role: 'ai' } })
            capture.capture({ type: 'event', event: 'on_agent_start', data: { id: 'child', status: 'running' } })
            capture.capture(end)
            expect(capture.capture({ type: 'complete' })?.messages[0].agentRuns).toEqual([
                { id: 'child', status, elapsedTime: 163097 }
            ])
        }
    })
})
