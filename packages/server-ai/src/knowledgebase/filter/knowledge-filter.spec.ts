import { KnowledgeFilterNode } from '@xpert-ai/contracts'
import {
    compileKnowledgeFilterToMilvus,
    compileKnowledgeFilterToPostgres,
    createMilvusFilterAttributes,
    createKnowledgeFilterRegistry,
    KnowledgeFilterValidationError,
    prepareKnowledgeFilter,
    validateKnowledgeFilter
} from './knowledge-filter'

describe('KnowledgeFilterCompiler', () => {
    const knowledgebase = {
        metadataSchema: [
            { key: 'domain', type: 'enum' as const, scope: 'document' as const, enumValues: ['水利', '物流'] },
            { key: 'effectiveYear', type: 'number' as const, scope: 'document' as const },
            { key: 'tags', type: 'string[]' as const, scope: 'document' as const },
            { key: 'costs', type: 'number[]' as const, scope: 'document' as const },
            { key: 'quality', type: 'number' as const, scope: 'chunk' as const },
            { key: 'effective', type: 'boolean' as const, scope: 'chunk' as const },
            { key: 'publishedAt', type: 'datetime' as const, scope: 'document' as const },
            { key: 'details', type: 'object' as const, scope: 'document' as const }
        ]
    }
    const registry = createKnowledgeFilterRegistry(knowledgebase)

    it('merges fixed, request, and dynamic filters with AND and resolves fixed variables', () => {
        const result = prepareKnowledgeFilter({
            knowledgebase,
            variables: { input: { regionFolder: '/华东/水利/' } },
            filters: {
                fixed: condition('document.folderPath', 'under', {
                    kind: 'variable',
                    selector: 'input.regionFolder'
                }),
                request: condition('metadata.domain', 'eq', literal('水利')),
                dynamic: condition('metadata.effectiveYear', 'gte', literal(2025))
            }
        })

        expect(result.effective).toMatchObject({ kind: 'group', operator: 'and' })
        expect((result.effective as Extract<KnowledgeFilterNode, { kind: 'group' }>).children).toHaveLength(3)
        expect(result.sources.fixed).toMatchObject({ value: { kind: 'literal', value: '/华东/水利/' } })
        expect(result.diagnostics.filterStatus).toBe('applied')
        expect(result.diagnostics.filterHash).toHaveLength(64)
    })

    it('fails closed when a fixed variable is missing', () => {
        expect(() =>
            prepareKnowledgeFilter({
                knowledgebase,
                filters: {
                    fixed: condition('metadata.domain', 'eq', { kind: 'variable', selector: 'input.domain' })
                }
            })
        ).toThrow(expect.objectContaining({ code: 'MISSING_VARIABLE' }))
    })

    it('discards an entire invalid dynamic filter while retaining the fixed filter', () => {
        const fixed = condition('metadata.domain', 'eq', literal('水利'))
        const result = prepareKnowledgeFilter({
            knowledgebase,
            filters: {
                fixed,
                dynamic: group('and', [
                    condition('metadata.effectiveYear', 'eq', literal(2025)),
                    condition('unknown.field', 'eq', literal('x'))
                ])
            }
        })

        expect(result.effective).toEqual(fixed)
        expect(result.sources.dynamic).toBeUndefined()
        expect(result.diagnostics.filterStatus).toBe('dynamic_fallback')
        expect(result.diagnostics.fallbackReason).toBe('invalid_dynamic_filter')
    })

    it('falls back when a provider supplies an unparseable dynamic-filter transport value', () => {
        const fixed = condition('metadata.domain', 'eq', literal('水利'))
        const result = prepareKnowledgeFilter({
            knowledgebase,
            filters: {
                fixed,
                dynamic: '{not-valid-json' as unknown as KnowledgeFilterNode
            }
        })

        expect(result.effective).toEqual(fixed)
        expect(result.sources.dynamic).toBeUndefined()
        expect(result.diagnostics.filterStatus).toBe('dynamic_fallback')
        expect(result.diagnostics.fallbackReason).toBe('invalid_dynamic_filter')
        expect(result.diagnostics.errors).toContain('Filter node must be an object.')
    })

    it('accepts three nested groups and rejects a fourth group', () => {
        const three = group('and', [group('or', [group('and', [condition('metadata.domain', 'eq', literal('水利'))])])])
        expect(validateKnowledgeFilter(three, registry, { allowVariables: false, source: 'request' })).toBeTruthy()

        const four = group('and', [three])
        expect(() => validateKnowledgeFilter(four, registry, { allowVariables: false, source: 'request' })).toThrow(
            expect.objectContaining({ code: 'FILTER_TOO_COMPLEX' })
        )
    })

    it('enforces typed operators and values', () => {
        expect(() =>
            validateKnowledgeFilter(condition('metadata.effectiveYear', 'contains', literal('2025')), registry, {
                allowVariables: false,
                source: 'request'
            })
        ).toThrow(expect.objectContaining({ code: 'INVALID_OPERATOR' }))
        expect(() =>
            validateKnowledgeFilter(condition('chunk.metadata.effective', 'eq', literal('true')), registry, {
                allowVariables: false,
                source: 'request'
            })
        ).toThrow(expect.objectContaining({ code: 'INVALID_VALUE' }))
        expect(() =>
            validateKnowledgeFilter(condition('metadata.domain', 'eq', literal('工程')), registry, {
                allowVariables: false,
                source: 'request'
            })
        ).toThrow(expect.objectContaining({ code: 'INVALID_VALUE' }))
    })

    it('compiles values as PostgreSQL parameters and preserves folder segment boundaries', () => {
        const attemptedInjection = "%' OR TRUE --"
        const validated = validateKnowledgeFilter(
            group('and', [
                condition('document.fileName', 'contains', literal(attemptedInjection)),
                condition('document.folderPath', 'under', literal('/工程/水利/')),
                condition('metadata.tags', 'containsAll', literal(['定额', '2025'])),
                condition('metadata.details', 'jsonContains', literal({ status: 'effective' }))
            ]),
            registry,
            { allowVariables: false, source: 'request' }
        )
        const compiled = compileKnowledgeFilterToPostgres(validated, registry)

        expect(compiled.sql).not.toContain(attemptedInjection)
        expect(compiled.sql).toContain('d."folder" =')
        expect(compiled.parameters).toContain('工程/水利')
        expect(compiled.parameters).toContain('工程/水利/%')
        expect(compiled.parameters.some((value) => String(value).includes('\\%'))).toBe(true)
    })

    it('compiles Milvus JSON and array expressions with expression values', () => {
        const validated = validateKnowledgeFilter(
            group('and', [
                condition('metadata.effectiveYear', 'between', literal([2020, 2025])),
                condition('metadata.tags', 'containsAny', literal(['定额', '概算'])),
                condition('chunk.metadata.quality', 'gte', literal(0.8))
            ]),
            registry,
            { allowVariables: false, source: 'request' }
        )
        const compiled = compileKnowledgeFilterToMilvus(validated, registry)

        expect(compiled.expression).toContain('filterAttributes["metadata"]["effectiveYear"]')
        expect(compiled.expression).toContain('json_contains_any')
        expect(compiled.expression).toContain('filterAttributes["chunkMetadata"]["quality"]')
        expect(Object.values(compiled.values)).toContainEqual(['定额', '概算'])
    })

    it('uses lower-cased shadow attributes for case-insensitive Milvus text patterns', () => {
        const validated = validateKnowledgeFilter(
            condition('document.fileName', 'contains', literal('WATER定额')),
            registry,
            { allowVariables: false, source: 'request' }
        )
        const compiled = compileKnowledgeFilterToMilvus(validated, registry)
        const attributes = createMilvusFilterAttributes({
            document: { name: 'WATER定额.PDF', folder: 'North/Water' },
            documentMetadata: { domain: 'WATER' },
            chunkMetadata: { section: 'PRICE' }
        })

        expect(compiled.expression).toContain('filterAttributes["documentText"]["fileName"]')
        expect(Object.values(compiled.values)).toContain('%water定额%')
        expect(attributes).toMatchObject({
            documentText: { fileName: 'water定额.pdf', folderPath: 'north/water' },
            metadataText: { domain: 'water' },
            chunkMetadataText: { section: 'price' }
        })
    })

    it('limits IN values and string lengths', () => {
        expect(() =>
            validateKnowledgeFilter(
                condition(
                    'document.fileExtension',
                    'in',
                    literal(Array.from({ length: 101 }, (_, index) => `${index}`))
                ),
                registry,
                { allowVariables: false, source: 'request' }
            )
        ).toThrow(KnowledgeFilterValidationError)
        expect(() =>
            validateKnowledgeFilter(condition('document.fileName', 'eq', literal('x'.repeat(513))), registry, {
                allowVariables: false,
                source: 'request'
            })
        ).toThrow(KnowledgeFilterValidationError)
    })

    it('rejects dynamic variables, invalid UTC datetimes, array item types, and more than 20 conditions', () => {
        expect(() =>
            validateKnowledgeFilter(
                condition('metadata.domain', 'eq', { kind: 'variable', selector: 'input.domain' }),
                registry,
                { allowVariables: false, source: 'dynamic' }
            )
        ).toThrow(expect.objectContaining({ code: 'INVALID_VALUE' }))
        expect(() =>
            validateKnowledgeFilter(
                condition('metadata.publishedAt', 'eq', literal('2025-01-01T00:00:00+08:00')),
                registry,
                { allowVariables: false, source: 'request' }
            )
        ).toThrow(expect.objectContaining({ code: 'INVALID_VALUE' }))
        expect(() =>
            validateKnowledgeFilter(condition('metadata.costs', 'containsAny', literal(['100'])), registry, {
                allowVariables: false,
                source: 'request'
            })
        ).toThrow(expect.objectContaining({ code: 'INVALID_VALUE' }))
        expect(() =>
            validateKnowledgeFilter(
                group(
                    'and',
                    Array.from({ length: 21 }, () => condition('document.fileExtension', 'eq', literal('pdf')))
                ),
                registry,
                { allowVariables: false, source: 'request' }
            )
        ).toThrow(expect.objectContaining({ code: 'FILTER_TOO_COMPLEX' }))
    })

    it('normalizes folder paths and treats the root as all logical folders', () => {
        const normalized = validateKnowledgeFilter(
            condition('document.folderPath', 'under', literal('/工程/物流/../水利/./')),
            registry,
            { allowVariables: false, source: 'request' }
        )
        const postgres = compileKnowledgeFilterToPostgres(normalized, registry)
        expect(postgres.parameters).toEqual(['工程/水利', '工程/水利/%'])

        const root = validateKnowledgeFilter(condition('document.folderPath', 'under', literal('/')), registry, {
            allowVariables: false,
            source: 'request'
        })
        expect(compileKnowledgeFilterToPostgres(root, registry)).toEqual({ sql: 'TRUE', parameters: [] })
        expect(compileKnowledgeFilterToMilvus(root, registry).expression).toBe(
            'exists filterAttributes["document"]["folderPath"]'
        )
    })

    it('casts numeric JSON array members for PostgreSQL containsAny', () => {
        const validated = validateKnowledgeFilter(
            condition('metadata.costs', 'containsAny', literal([100, 200])),
            registry,
            { allowVariables: false, source: 'request' }
        )
        expect(compileKnowledgeFilterToPostgres(validated, registry).sql).toContain('item.value::numeric')
    })
})

function literal(value: any) {
    return { kind: 'literal' as const, value }
}

function condition(field: string, operator: any, value?: any): KnowledgeFilterNode {
    return { kind: 'condition', field, operator, ...(value ? { value } : {}) }
}

function group(operator: 'and' | 'or', children: KnowledgeFilterNode[]): KnowledgeFilterNode {
    return { kind: 'group', operator, children } as KnowledgeFilterNode
}
