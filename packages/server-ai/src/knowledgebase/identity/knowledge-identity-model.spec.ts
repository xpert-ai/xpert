import {
    buildKnowledgeIdentityDedupMessages,
    createKnowledgeIdentityDedupOutputSchema,
    parseKnowledgeIdentityDedupOutput
} from './knowledge-identity-model'

describe('identity deduplication output contract', () => {
    const descriptor = { kind: 'concept' as const, definition: 'Strategic planning.', domain: null, scope: null }
    const input = {
        candidateId: 'source-hash',
        canonicalName: 'Strategic planning',
        aliases: [],
        descriptor,
        facts: [{ text: 'A capability.', sourceChunkIds: ['source-chunk'] }],
        candidates: [{ id: 'existing-id', canonicalName: 'Organizational strategy', aliases: [], descriptor }]
    }

    it('exposes only existing identity IDs as match targets while retaining source evidence', () => {
        const messages = buildKnowledgeIdentityDedupMessages(input)
        const data = JSON.parse(messages[1].content.slice('IDENTITY_DATA\n'.length))
        expect(data).toEqual({
            item: { canonicalName: input.canonicalName, aliases: [], descriptor, facts: input.facts },
            candidates: input.candidates
        })
        expect(messages[0].content).toContain('JSON')
        const schema = createKnowledgeIdentityDedupOutputSchema(input)
        const answer = { decision: 'same', identityId: 'existing-id', reason: 'Equivalent definition.' }
        expect(schema.parse(answer)).toEqual(answer)
        expect(parseKnowledgeIdentityDedupOutput(answer, input)).toEqual(answer)
        for (const identityId of [input.candidateId, 'source-chunk', 'invented-id']) {
            expect(schema.safeParse({ ...answer, identityId }).success).toBe(false)
            expect(() => parseKnowledgeIdentityDedupOutput({ ...answer, identityId }, input)).toThrow()
        }
    })

    it('allows only null when no candidates exist and preserves the decision-target invariant', () => {
        const schema = createKnowledgeIdentityDedupOutputSchema({ ...input, candidates: [] })
        const answer = { decision: 'different', identityId: null, reason: 'No matching identity.' }
        expect(schema.parse(answer)).toEqual(answer)
        expect(schema.safeParse({ ...answer, identityId: input.candidateId }).success).toBe(false)
        expect(() => parseKnowledgeIdentityDedupOutput({ ...answer, decision: 'same' }, input)).toThrow()
        for (const decision of ['different', 'uncertain']) {
            expect(parseKnowledgeIdentityDedupOutput({ ...answer, decision }, input)).toEqual({ ...answer, decision })
            expect(() =>
                parseKnowledgeIdentityDedupOutput({ ...answer, decision, identityId: 'existing-id' }, input)
            ).toThrow()
        }
    })
})
