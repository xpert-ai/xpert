import { parseGraphPublication, toStructuredExtraction } from './structured-graph-model'
import { parseGraphExtractionSnapshot, validateKnowledgeGraphExtractionEvidence } from './graph-extraction-model'
const kb = '11111111-1111-4111-8111-111111111111'
const input = () => ({
    knowledgebaseId: kb,
    documentId: kb,
    xpertId: kb,
    agentKey: 'AutomotiveAgent',
    publicationKey: 'auto-bom',
    sourceVersion: 'R1',
    chunkIds: ['root-chunk', 'part-chunk'],
    entities: [
        {
            id: 'root',
            namespace: 'auto:bom:R1',
            nodeKey: 'AUTO-ROOT',
            type: 'Root',
            name: 'Automotive assembly',
            chunkIds: ['root-chunk']
        },
        {
            id: 'part',
            namespace: 'auto:bom:R1:position:1',
            nodeKey: 'AUTO-SENSOR',
            type: 'Component',
            name: 'Temperature sensor',
            properties: { quantity: 2, specification: { unit: 'EA', resistance: 100 } },
            chunkIds: ['part-chunk']
        }
    ],
    relations: [
        {
            source: 'root',
            target: 'part',
            type: 'CONTAINS',
            properties: { quantity: 2, unit: 'EA' },
            chunkIds: ['part-chunk']
        }
    ]
})

it('preserves explicit keys, typed properties and chunk evidence through the durable snapshot', () => {
    const value = parseGraphPublication(input())
    const output = parseGraphExtractionSnapshot(toStructuredExtraction(value))
    expect(output.publication.mode).toBe('structured')
    expect(output.entities[1].properties).toMatchObject({
        quantity: 2,
        specification: { resistance: 100 },
        nodeKey: 'AUTO-SENSOR'
    })
    expect(output.relations[0].properties).toEqual({ quantity: 2, unit: 'EA' })
    expect(() => validateKnowledgeGraphExtractionEvidence(output, new Set(value.chunkIds))).not.toThrow()
})
it('rejects dangling endpoints, duplicate business identities and foreign evidence before writes', () => {
    const dangling = input()
    dangling.relations[0].target = 'missing'
    expect(() => parseGraphPublication(dangling)).toThrow()
    const duplicate = input()
    duplicate.entities.push({ ...duplicate.entities[0], id: 'copy' })
    expect(() => parseGraphPublication(duplicate)).toThrow()
    const foreign = input()
    foreign.entities[0].chunkIds = ['unowned-chunk']
    expect(() => parseGraphPublication(foreign)).toThrow()
})
it('supports an explicit empty replacement and produces a stable publication hash', () => {
    const value = parseGraphPublication({ ...input(), entities: [], relations: [] })
    const a = toStructuredExtraction(value),
        b = toStructuredExtraction(value)
    expect(a.publication.hash).toBe(b.publication.hash)
    expect(() => validateKnowledgeGraphExtractionEvidence(a, new Set(value.chunkIds))).not.toThrow()
})
