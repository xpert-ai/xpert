import { validateKnowledgeGraphExtractionEvidence } from './graphrag.service'
import { toJsonSchema } from '@langchain/core/utils/json_schema'
import { graphExtractionSchema } from './graph-extraction-model'

describe('Graph extraction identity references', () => {
    it('keeps the provider schema inline across Entity and Concept identity branches', () => {
        expect(JSON.stringify(toJsonSchema(graphExtractionSchema))).not.toContain('"$ref"')
    })

    it('rejects a relation endpoint that was never extracted even if its citation is valid', () => {
        expect(() =>
            validateKnowledgeGraphExtractionEvidence(
                {
                    entities: [],
                    relations: [
                        {
                            sourceCandidateId: 'missing',
                            targetCandidateId: 'also-missing',
                            type: 'related',
                            evidence: [{ chunkId: 'chunk' }]
                        }
                    ]
                },
                new Set(['chunk'])
            )
        ).toThrow()
    })

    it('rejects an ambiguous candidate id even when every item has valid evidence', () => {
        const entity = {
            candidateId: 'team',
            name: 'Operations',
            type: 'organization',
            identity: {
                kind: 'entity' as const,
                entityType: 'organization' as const,
                description: 'The north operations team.',
                scope: 'north',
                identifiers: []
            },
            evidence: [{ chunkId: 'chunk' }]
        }
        expect(() =>
            validateKnowledgeGraphExtractionEvidence(
                { entities: [entity, { ...entity, identity: { ...entity.identity, scope: 'south' } }], relations: [] },
                new Set(['chunk'])
            )
        ).toThrow()
    })
})
