import { chatStreamPersistence } from './chat-stream-persistence'

describe('admitted chat replay scope', () => {
    const conversation = { tenantId: 'tenant', organizationId: 'organization' }
    it('adds durable display capture to a compatibility chat using the admitted owner', () => {
        expect(chatStreamPersistence({ transport: 'redis-stream' }, conversation, 'thread', 'run', 'owner')).toEqual({
            transport: 'redis-stream',
            threadId: 'thread',
            runId: 'run',
            snapshotOwner: 'owner',
            snapshotScope: conversation
        })
    })
    it('binds all persistence identifiers to the actual authorized conversation and execution', () => {
        expect(
            chatStreamPersistence(
                {
                    transport: 'redis-stream',
                    threadId: 'other',
                    runId: 'other',
                    snapshotOwner: 'old-owner',
                    snapshotScope: { tenantId: 'other', organizationId: 'other' }
                },
                conversation,
                'thread',
                'run',
                'owner'
            )
        ).toEqual({
            transport: 'redis-stream',
            threadId: 'thread',
            runId: 'run',
            snapshotOwner: 'owner',
            snapshotScope: conversation
        })
    })
    it('preserves an existing protocol owner and leaves non-persisted callers unchanged', () => {
        expect(
            chatStreamPersistence(
                { transport: 'redis-stream', snapshotOwner: 'protocol-owner' },
                conversation,
                'thread',
                'run',
                undefined
            )?.snapshotOwner
        ).toBe('protocol-owner')
        expect(chatStreamPersistence(undefined, conversation, 'thread', 'run', 'owner')).toBeUndefined()
    })
})
