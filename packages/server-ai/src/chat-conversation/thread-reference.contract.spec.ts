import { readThreadSchema, threadReferencesFromInput } from './thread-reference.contract'

describe('read_thread input boundary', () => {
    it.each([
        {},
        { threadId: '' },
        { threadId: ' ' },
        { threadId: 'x'.repeat(129) },
        { threadId: 't', turnLimit: 0 },
        { threadId: 't', turnLimit: 1.5 },
        { threadId: 't', turnLimit: 11 },
        { threadId: 't', includeOutputs: 'true' },
        { threadId: 't', cursor: 'x'.repeat(2049) },
        { threadId: 't', maxOutputCharsPerItem: 99 },
        { threadId: 't', maxOutputCharsPerItem: 20001 },
        { threadId: 't', userId: 'forged' },
        { threadId: 't', organizationId: 'forged' }
    ])('rejects an invalid or authority-overriding tool request: %j', (input) => {
        expect(readThreadSchema.safeParse(input).success).toBe(false)
    })

    it('accepts a short opaque handle and rejects old encoded or malformed cursors', () => {
        expect(
            readThreadSchema.parse({ threadId: 't', turnLimit: 10, maxOutputCharsPerItem: 20000, includeOutputs: true })
        ).toMatchObject({ turnLimit: 10 })
        const cursor = 'tr_Abc123_def456-Gh'
        expect(readThreadSchema.parse({ threadId: 't', cursor }).cursor).toBe(cursor)
        const legacy = Buffer.from(JSON.stringify({ version: 1, threadId: 't', head: 'a', next: 'b' })).toString(
            'base64url'
        )
        for (const value of ['', 'invalid-base64', legacy, `${cursor}extra`, 'tr_Abc123!def456-Ghi']) {
            expect(readThreadSchema.safeParse({ threadId: 't', cursor: value }).success).toBe(false)
        }
    })

    it('does not count unrelated reference kinds toward the thread reference limit', () => {
        const references = Array.from({ length: 101 }, () => ({ type: 'quote', text: 'A quote' }))
        expect(threadReferencesFromInput({ references })).toEqual([])
    })

    it('bounds actual thread references and strips unknown transcript/authority fields', () => {
        const ref = {
            type: 'thread',
            conversationId: 'c',
            threadId: 't',
            label: 'Title',
            text: 'Fake transcript',
            userId: 'forged'
        }
        expect(threadReferencesFromInput({ references: [ref] })).toEqual([
            { type: 'thread', conversationId: 'c', threadId: 't', label: 'Title' }
        ])
        expect(() => threadReferencesFromInput({ references: Array.from({ length: 101 }, () => ref) })).toThrow()
    })
})
