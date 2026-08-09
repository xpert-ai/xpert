import { KBMetadataFieldDef } from '@xpert-ai/contracts'
import { migrateKnowledgeFilterConfigurations } from './knowledge-filter-v2-config'

describe('Knowledge Filter V2 configuration migration', () => {
    const schemas = new Map<string, KBMetadataFieldDef[]>([
        [
            'kb-water',
            [
                { key: 'domain', type: 'enum', enumValues: ['水利', '物流'], scope: 'document' },
                { key: 'effectiveYear', type: 'number', scope: 'document' }
            ]
        ]
    ])

    it('converts manual, automatic, and disabled bindings and removes the legacy metadata block', () => {
        const input = {
            agentConfig: {
                retrievals: {
                    'kb-water': {
                        metadata: {
                            filtering_mode: 'manual',
                            fields: { domain: {} },
                            filtering_conditions: {
                                logicalOperator: 'and',
                                conditions: [
                                    { variableSelector: 'domain', comparisonOperator: 'equal', value: '水利' },
                                    { variableSelector: 'effectiveYear', comparisonOperator: 'ge', value: '2025' },
                                    {
                                        variableSelector: 'folderPath',
                                        comparisonOperator: 'starts-with',
                                        value: '{{input.regionFolder}}'
                                    }
                                ]
                            }
                        }
                    }
                }
            },
            nodes: [
                {
                    entity: {
                        knowledgebases: ['kb-water'],
                        retrieval: { metadata: { filtering_mode: 'automatic', fields: { domain: {} } } }
                    }
                },
                {
                    entity: {
                        knowledgebases: ['kb-water'],
                        retrieval: { metadata: { filtering_mode: 'disabled' } }
                    }
                }
            ]
        }

        const result = migrateKnowledgeFilterConfigurations(input, schemas, 'Xpert(x1)')

        expect(result.issues).toEqual([])
        expect(result.migratedRetrievals).toBe(3)
        const manual = result.value.agentConfig.retrievals['kb-water'] as any
        expect(manual.metadata).toBeUndefined()
        expect(manual.mode).toBe('vector')
        expect(manual.filtering.agent.enabled).toBe(false)
        expect(manual.filtering.fixed.children).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ field: 'metadata.domain', operator: 'eq' }),
                expect.objectContaining({
                    field: 'metadata.effectiveYear',
                    operator: 'gte',
                    value: { kind: 'literal', value: 2025 }
                }),
                expect.objectContaining({
                    field: 'document.folderPath',
                    value: { kind: 'variable', selector: 'input.regionFolder' }
                })
            ])
        )
        expect((result.value.nodes[0].entity.retrieval as any).filtering.agent.enabled).toBe(true)
        expect((result.value.nodes[1].entity.retrieval as any).filtering.agent.enabled).toBe(false)
    })

    it('is idempotent after conversion', () => {
        const converted = {
            agentConfig: {
                retrievals: {
                    'kb-water': { mode: 'vector', filtering: { agent: { enabled: false } } }
                }
            }
        }
        const result = migrateKnowledgeFilterConfigurations(converted, schemas, 'Xpert(x1)')
        expect(result.changed).toBe(false)
        expect(result.value).toEqual(converted)
    })

    it('fails preflight with an exact location for unknown fields and lossy operators', () => {
        const input = {
            agentConfig: {
                retrievals: {
                    'kb-water': {
                        metadata: {
                            filtering_mode: 'manual',
                            filtering_conditions: {
                                logicalOperator: 'and',
                                conditions: [
                                    { variableSelector: 'unknown', comparisonOperator: 'equal', value: 'x' },
                                    { variableSelector: 'domain', comparisonOperator: 'like', value: '%水利%' }
                                ]
                            }
                        }
                    }
                }
            }
        }
        const result = migrateKnowledgeFilterConfigurations(input, schemas, 'Xpert(x1)')

        expect(result.changed).toBe(false)
        expect(result.issues).toHaveLength(2)
        expect(result.issues[0].location).toContain('Xpert(x1).agentConfig.retrievals.kb-water.conditions[0]')
        expect(result.issues[1].message).toContain('no semantics-preserving')
    })

    it('rejects an ambiguous object that contains both old and new filtering settings', () => {
        const input = {
            agentConfig: {
                retrievals: {
                    'kb-water': {
                        metadata: { filtering_mode: 'disabled' },
                        filtering: { agent: { enabled: true } }
                    }
                }
            }
        }
        const result = migrateKnowledgeFilterConfigurations(input, schemas, 'Xpert(x1)')
        expect(result.issues[0].message).toContain('both legacy metadata')
    })
})
