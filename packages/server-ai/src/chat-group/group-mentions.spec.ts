import { groupMentionRecipients } from './group-mentions'

const members = [
    { id: 'a', name: 'Alice', active: true },
    { id: 'c', name: 'Expert C', active: true },
    { id: 'removed', name: 'Removed', active: false }
]
describe('group mention routing', () => {
    it('binds exact spans, handles names with spaces and deduplicates recipients', () => {
        const text = '@Alice @Expert C @Alice'
        expect(
            groupMentionRecipients(
                text,
                [
                    { participantId: 'c', start: 7, end: 16 },
                    { participantId: 'a', start: 0, end: 6 },
                    { participantId: 'a', start: 17, end: 23 }
                ],
                members
            )
        ).toEqual(['a', 'c'])
    })
    it('does not interpret email addresses as mentions', () => {
        expect(groupMentionRecipients('Contact alice@example.com', [], members)).toEqual([])
    })
    it.each([
        ['@Alice', []],
        ['@Alice', [{ participantId: 'c', start: 0, end: 6 }]],
        ['@Removed', [{ participantId: 'removed', start: 0, end: 8 }]],
        [
            '@Alice',
            [
                { participantId: 'a', start: 0, end: 6 },
                { participantId: 'a', start: 0, end: 6 }
            ]
        ],
        ['@AliceX', [{ participantId: 'a', start: 0, end: 6 }]],
        ['x@Alice', [{ participantId: 'a', start: 1, end: 7 }]]
    ] as const)('rejects unbound, spoofed, inactive or overlapping mentions: %s', (text, mentions) => {
        expect(() => groupMentionRecipients(text, [...mentions], members)).toThrow()
    })
})
