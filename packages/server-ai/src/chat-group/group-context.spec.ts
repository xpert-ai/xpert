import { groupModelInput } from './group-context'
import { publicGroupDelta } from './group-stream.service'

describe('group public/private projections', () => {
    it('keeps external Assistant authors distinct from the receiving Assistant', () => {
        const input = groupModelInput({
            self: { id: 'e', name: 'E', kind: 'assistant', subjectId: 'expert-e', role: 'member', active: true },
            members: [],
            background: [],
            addressed: {
                id: 'm',
                text: 'Estimate delivery',
                communication: {
                    intent: 'request',
                    senderId: 'c',
                    recipientIds: ['e'],
                    rootMessageId: 'root',
                    rootUserId: 'a',
                    hop: 1
                }
            }
        })
        expect(input).toContain('participant e')
        expect(input).toContain('"senderId":"c"')
        expect(input).toContain('asynchronous')
        expect(input).toContain('Background only')
    })
    it('publishes text deltas only, never tool/reasoning/state payloads', () => {
        expect(publicGroupDelta({ type: 'message', data: 'Hello' })).toBe('Hello')
        expect(publicGroupDelta({ type: 'message', data: { type: 'text', text: '@A hello' } })).toBe('@A hello')
        for (const payload of [
            { type: 'message', data: { type: 'reasoning', text: 'private' } },
            { type: 'message', data: { type: 'tool', text: 'private' } },
            { type: 'event', event: 'on_tool_message', data: { text: 'private' } },
            { type: 'values', data: { messages: [{ content: 'private' }] } }
        ])
            expect(publicGroupDelta(payload)).toBeUndefined()
    })
})
