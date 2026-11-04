import { buildConnectionImpact } from './connection-impact'

const model = { id: 'binding', root: 'binding', organizationId: 'org', model: 'llm', modelType: 'llm' }
const owner = {
    resourceType: 'assistant',
    resourceId: 'assistant',
    resourceName: 'Assistant',
    organizationId: 'org',
    version: '2',
    status: 'published',
    field: 'copilotModelId'
}
describe('connection impact inventory semantics', () => {
    it('partitions all 132 saved records by direct evidence without inventing 132 affected models', () => {
        const models = Array.from({ length: 132 }, (_, i) => ({ ...model, id: `b${i}`, root: `b${i}` }))
        const direct = models.slice(0, 83).map((m, i) => ({
            ...owner,
            bindingId: m.id,
            root: m.id,
            model: m.model,
            modelType: m.modelType,
            status: i < 37 ? 'published' : 'historical',
            resourceId: i < 37 ? 'current-resource' : `history-${i}`
        }))
        const result = buildConnectionImpact('tenant', 'connection', { models, direct, documents: [], defaults: [] })
        expect(result).toMatchObject({
            bindings: 132,
            currentResources: 1,
            historicalResources: 46,
            bindingUsage: { current: 37, historicalOnly: 46, unresolved: 49 }
        })
        expect(result.references.filter((r) => r.evidence === 'saved')).toHaveLength(49)
    })
    it('does not infer effective use from arbitrary nested JSON or a connection display name', () => {
        const result = buildConnectionImpact('tenant', 'connection', {
            models: [model],
            direct: [],
            defaults: [],
            documents: [
                {
                    ...owner,
                    status: 'draft',
                    field: 'draft',
                    document: {
                        team: {
                            graph: { copilotModel: { copilotId: 'connection', model: 'rerank', modelType: 'rerank' } }
                        }
                    }
                }
            ]
        })
        expect(result).toMatchObject({
            currentResources: 0,
            drafts: 1,
            jsonMatches: 1,
            bindingUsage: { current: 0, historicalOnly: 0, unresolved: 1 }
        })
        expect(result.references.find((r) => r.evidence === 'json')).toMatchObject({
            status: 'draft',
            modelType: 'rerank'
        })
    })
    it('deduplicates relation details while retaining provenance for binding classification', () => {
        const direct = { ...owner, bindingId: 'binding', root: 'binding', model: 'llm', modelType: 'llm' }
        const result = buildConnectionImpact('tenant', 'connection', {
            models: [model],
            direct: [direct, direct],
            documents: [],
            defaults: []
        })
        expect(result.references).toHaveLength(1)
        expect(result.currentResources).toBe(1)
    })
    it('rejects malformed database metadata instead of silently turning it into zero impact', () => {
        expect(() =>
            buildConnectionImpact('tenant', 'connection', {
                models: [{ id: 123 }],
                direct: [],
                documents: [],
                defaults: []
            })
        ).toThrow()
    })
})
