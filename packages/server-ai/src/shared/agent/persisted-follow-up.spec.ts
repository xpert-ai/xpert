import {
    collectPendingFollowUpsByClientMessageId,
    mergeFollowUpHumanInputs,
    readPersistedFollowUpInput
} from './persisted-follow-up'

describe('persisted follow-up helpers', () => {
    it('merges text, files, references, and later fields in order', () => {
        expect(
            mergeFollowUpHumanInputs([
                {
                    input: 'first',
                    files: [{ id: 'file-1' }] as any,
                    references: [{ type: 'quote', text: 'ref-1' }] as any,
                    custom: 'early'
                },
                {
                    input: 'second',
                    files: [{ id: 'file-2' }] as any,
                    references: [{ type: 'quote', text: 'ref-2' }] as any,
                    custom: 'late'
                }
            ])
        ).toEqual({
            input: 'first\n\nsecond',
            files: [{ id: 'file-1' }, { id: 'file-2' }],
            references: [
                { type: 'quote', text: 'ref-1' },
                { type: 'quote', text: 'ref-2' }
            ],
            custom: 'late'
        })
    })

    it('reads persisted references and attachments from the stored follow-up payload', () => {
        expect(
            readPersistedFollowUpInput({
                content: 'fallback',
                references: [{ type: 'quote', text: 'ref-entity' }],
                attachments: [{ id: 'file-entity' }],
                thirdPartyMessage: {
                    followUpInput: {
                        input: 'stored',
                        references: [{ type: 'quote', text: 'ref-payload' }],
                        files: [{ id: 'file-payload' }]
                    }
                }
            })
        ).toEqual({
            input: 'stored',
            references: [{ type: 'quote', text: 'ref-payload' }],
            files: [{ id: 'file-payload' }]
        })
    })

    it('collects only pending follow-ups for the same target execution', () => {
        const collected = collectPendingFollowUpsByClientMessageId(
            [
                {
                    id: 'follow-up-1',
                    role: 'human',
                    createdAt: '2026-04-17T00:00:00.000Z',
                    followUpStatus: 'pending' as const,
                    targetExecutionId: 'run-1',
                    thirdPartyMessage: {
                        followUpClientMessageId: 'client-1',
                        followUpInput: {
                            input: 'first'
                        }
                    }
                },
                {
                    id: 'follow-up-2',
                    role: 'human',
                    createdAt: '2026-04-17T00:00:01.000Z',
                    followUpStatus: 'pending' as const,
                    targetExecutionId: 'run-1',
                    thirdPartyMessage: {
                        followUpClientMessageId: 'client-2',
                        followUpInput: {
                            input: 'second'
                        }
                    }
                },
                {
                    id: 'follow-up-3',
                    role: 'human',
                    createdAt: '2026-04-17T00:00:02.000Z',
                    followUpStatus: 'pending' as const,
                    targetExecutionId: 'run-2',
                    thirdPartyMessage: {
                        followUpClientMessageId: 'client-3',
                        followUpInput: {
                            input: 'other run'
                        }
                    }
                }
            ],
            'client-1'
        )

        expect(collected).toEqual({
            matched: expect.objectContaining({
                id: 'follow-up-1'
            }),
            items: [
                expect.objectContaining({
                    id: 'follow-up-1'
                }),
                expect.objectContaining({
                    id: 'follow-up-2'
                })
            ],
            mergedHumanInput: {
                input: 'first\n\nsecond'
            },
            targetExecutionId: 'run-1',
            messageIds: ['follow-up-1', 'follow-up-2'],
            clientMessageIds: ['client-1', 'client-2']
        })
    })
})
