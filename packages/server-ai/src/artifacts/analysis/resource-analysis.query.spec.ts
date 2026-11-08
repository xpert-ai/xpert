import type { AnalyticalDataset, ResourceAnalysisPolicy, ResourceAnalysisQuery } from '@xpert-ai/contracts'
import { analyzeDataset, projectAnalysisDataset } from './resource-analysis.query'
import { resourceAnalysisQuerySchema } from '@xpert-ai/plugin-sdk/analytics'

const dataset: AnalyticalDataset = {
    schema: 'xpert.analytics.dataset',
    datasetId: 'inventory',
    grain: [],
    fields: [
        {
            id: 'plant',
            sourceField: 'plant',
            label: 'Plant',
            role: 'dimension',
            logicalType: 'string',
            nullable: false
        },
        {
            id: 'value',
            sourceField: 'value',
            label: 'Value',
            role: 'measure',
            logicalType: 'decimal',
            nullable: false,
            unit: 'CNY'
        },
        {
            id: 'secret',
            sourceField: 'secret',
            label: 'Private',
            role: 'dimension',
            logicalType: 'string',
            nullable: false
        }
    ],
    rows: [
        { plant: 'A', value: '9007199254740993.01', secret: 'private' },
        { plant: 'A', value: '0.02', secret: 'private' },
        { plant: 'B', value: '100', secret: 'private' }
    ],
    completeness: {
        returnedRows: 3,
        totalRows: 3,
        totalAccuracy: 'exact',
        scope: 'full_query_result',
        truncated: false
    },
    freshness: { executedAt: '2026-11-08T00:00:00Z', sourceFetchedAt: '2026-11-08T00:00:00Z' },
    provenance: { executionId: 'test', bindingId: 'stock', providerId: 'test' }
}
const policy: ResourceAnalysisPolicy = {
    mode: 'explore',
    allowDetails: true,
    maxRows: 10,
    datasets: [
        { key: 'stock', fields: ['plant', 'value'], filters: [{ field: 'plant', operator: 'eq', values: ['A'] }] }
    ]
}
const query: ResourceAnalysisQuery = {
    datasetKey: 'stock',
    controls: {},
    select: [],
    filters: [],
    groupBy: [],
    aggregates: [],
    orderBy: [],
    limit: 10
}

describe('group resource data projection', () => {
    it('projects intermediate provider data before aggregation without leaking hidden columns or counts', () => {
        const projected = projectAnalysisDataset(dataset, policy.datasets[0])
        expect(JSON.stringify(projected)).not.toContain('secret')
        expect(projected.rows).toHaveLength(2)
        expect(projected.completeness.totalRows).toBe(2)
        expect(
            analyzeDataset(projected, policy, {
                ...query,
                aggregates: [{ key: 'total', operation: 'sum', field: 'value' }]
            }).rows
        ).toEqual([{ total: '9007199254740993.03' }])
        const partial = projectAnalysisDataset(
            { ...dataset, completeness: { ...dataset.completeness, truncated: true } },
            policy.datasets[0]
        )
        expect(partial.completeness.totalRows).toBeUndefined()
        expect(partial.completeness.totalAccuracy).toBe('unknown')
        expect(() =>
            analyzeDataset(partial, policy, { ...query, aggregates: [{ key: 'n', operation: 'count' }] })
        ).toThrow()
    })
    it('enforces fixed row predicates and removes unapproved fields before model access', () => {
        const result = analyzeDataset(dataset, policy, query)
        expect(result.rows).toEqual([
            { plant: 'A', value: '9007199254740993.01' },
            { plant: 'A', value: '0.02' }
        ])
        expect(JSON.stringify(result)).not.toContain('secret')
        expect(result.completeness.totalRows).toBe(2)
    })
    it('does not let caller filters broaden the fixed row scope', () => {
        expect(
            analyzeDataset(dataset, policy, { ...query, filters: [{ field: 'plant', operator: 'eq', values: ['B'] }] })
                .rows
        ).toEqual([])
    })
    it('aggregates decimals exactly, after applying audience restrictions', () => {
        const result = analyzeDataset(dataset, policy, {
            ...query,
            groupBy: ['plant'],
            aggregates: [{ key: 'total', operation: 'sum', field: 'value' }]
        })
        expect(result.rows).toEqual([{ plant: 'A', total: '9007199254740993.03' }])
        expect(result.fields[1].unit).toBe('CNY')
    })
    it('refuses aggregates of incomplete upstream results', () => {
        expect(() =>
            analyzeDataset(
                { ...dataset, completeness: { ...dataset.completeness, scope: 'page', truncated: true } },
                policy,
                { ...query, aggregates: [{ key: 'count', operation: 'count' }] }
            )
        ).toThrow()
    })
    it.each(['select', 'groupBy'] as const)('rejects hidden fields in %s', (key) => {
        expect(() => analyzeDataset(dataset, policy, { ...query, [key]: ['secret'] })).toThrow()
    })
    it('rejects hidden field predicates, ordering and aggregates', () => {
        expect(() =>
            analyzeDataset(dataset, policy, {
                ...query,
                filters: [{ field: 'secret', operator: 'eq', values: ['private'] }]
            })
        ).toThrow()
        expect(() =>
            analyzeDataset(dataset, policy, { ...query, orderBy: [{ field: 'secret', direction: 'asc' }] })
        ).toThrow()
        expect(() =>
            analyzeDataset(dataset, policy, {
                ...query,
                aggregates: [{ field: 'secret', key: 'total', operation: 'sum' }]
            })
        ).toThrow()
    })
    it('enforces details, exploration and output budgets', () => {
        expect(() => analyzeDataset(dataset, { ...policy, allowDetails: false }, query)).toThrow()
        expect(() =>
            analyzeDataset(
                dataset,
                { ...policy, mode: 'bindings' },
                { ...query, aggregates: [{ key: 'count', operation: 'count' }] }
            )
        ).toThrow()
        expect(() => analyzeDataset(dataset, policy, { ...query, limit: 11 })).toThrow()
        expect(analyzeDataset(dataset, policy, { ...query, limit: 1 }).completeness).toMatchObject({
            truncated: true,
            scope: 'top_n',
            totalRows: 2
        })
    })
    it('handles empty aggregate results and negative decimals', () => {
        expect(
            analyzeDataset({ ...dataset, rows: [] }, policy, {
                ...query,
                aggregates: [
                    { key: 'total', field: 'value', operation: 'sum' },
                    { key: 'count', operation: 'count' }
                ]
            }).rows
        ).toEqual([{ total: null, count: '0' }])
        expect(
            analyzeDataset(
                {
                    ...dataset,
                    rows: [
                        { plant: 'A', value: '-0.01' },
                        { plant: 'A', value: '0.02' }
                    ]
                },
                policy,
                { ...query, aggregates: [{ key: 'total', field: 'value', operation: 'sum' }] }
            ).rows
        ).toEqual([{ total: '0.01' }])
    })
    it('defaults omitted limits to the grant budget, including aggregate-only queries', () => {
        const input = resourceAnalysisQuerySchema.parse({
            datasetKey: 'stock',
            aggregates: [{ key: 'row_count', operation: 'count' }]
        })
        expect(input.limit).toBeUndefined()
        expect(analyzeDataset(dataset, { ...policy, maxRows: 1, allowDetails: false }, input).rows).toEqual([
            { row_count: '2' }
        ])
        const details = resourceAnalysisQuerySchema.parse({ datasetKey: 'stock' })
        expect(analyzeDataset(dataset, { ...policy, maxRows: 1 }, details).completeness).toMatchObject({
            returnedRows: 1,
            totalRows: 2,
            truncated: true
        })
        expect(() => analyzeDataset(dataset, { ...policy, maxRows: 1 }, { ...input, limit: 2 })).toThrow()
    })
})
