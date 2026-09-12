import { Document } from '@langchain/core/documents'
import { KnowledgeTableMetadata, KnowledgeTableSource } from '@xpert-ai/contracts'
import { conservativeEmbeddingTokenCount } from '../embedding-input-guard'
import { projectTableMetadata, tableModelBatches, parseTableModelResult } from './table-metadata'
import { tableSummaryBatches } from './table-summary'

const source: KnowledgeTableSource = {
    tableId: 'sheet:Orders',
    sheetName: 'Orders',
    range: 'A1:B3',
    headerRow: 1,
    rowCount: 2,
    columns: [
        { columnId: 'A', key: 'amount', label: 'amount', column: 1 },
        { columnId: 'B', key: 'secret', label: 'secret', column: 2 }
    ],
    samples: [{ rowNumber: 2, values: { A: 100, B: 'private forecast' } }]
}

describe('table metadata retrieval projection', () => {
    it('preserves source content and chunk count while fitting semantic context in the remaining input budget', () => {
        const state: KnowledgeTableMetadata = {
            schemaVersion: 1,
            status: 'generated',
            generationId: 'generation',
            inputHash: 'input',
            resultHash: 'result',
            updatedAt: '2026-09-11T00:00:00Z',
            tables: [
                {
                    ...source,
                    summary: 'Sales orders',
                    columns: [{ ...source.columns[0], description: 'Order amount', unit: 'CNY' }]
                }
            ]
        }
        const chunks = [
            new Document({
                pageContent: '{"amount":100,"secret":"private forecast"}',
                metadata: {
                    chunkId: 'row',
                    raw: { amount: 100, secret: 'private forecast' },
                    searchContent: '{"amount":100}',
                    tableSource: { tableId: source.tableId, rowNumber: 2 }
                }
            })
        ]
        const projected = projectTableMetadata(chunks, state, 128)
        expect(projected).toHaveLength(1)
        expect(projected[0].pageContent).toBe(chunks[0].pageContent)
        expect(projected[0].metadata.raw).toEqual(chunks[0].metadata.raw)
        expect(projected[0].metadata.searchContent).toContain('Order amount')
        expect(projected[0].metadata.searchContent).not.toContain('private forecast')
        expect(conservativeEmbeddingTokenCount(projected[0].metadata.searchContent)).toBeLessThanOrEqual(96)
        expect(projected[0].metadata).toMatchObject({ tableMetadataResultHash: 'result' })
        expect(chunks[0].metadata).not.toHaveProperty('tableMetadataResultHash')
    })

    it('stamps context ownership without adding physical chunks or exceeding a full budget', () => {
        const state: KnowledgeTableMetadata = {
            schemaVersion: 1,
            status: 'generated',
            generationId: 'g',
            inputHash: 'i',
            resultHash: 'r',
            updatedAt: '',
            tables: [{ ...source, summary: 'Sales orders', columns: [] }]
        }
        const chunk = new Document({
            pageContent: 'x'.repeat(96),
            metadata: {
                chunkId: 'row',
                tableSource: { tableId: source.tableId, rowNumber: 2 }
            }
        })
        const projected = projectTableMetadata([chunk], state, 128)
        expect(projected).toHaveLength(1)
        expect(projected[0].metadata).toMatchObject({ tableMetadataResultHash: 'r' })
        expect(projected[0].metadata).not.toHaveProperty('searchContent')
        expect(projected[0].pageContent).toBe(chunk.pageContent)
    })

    it('limits each model batch to known indexed columns, ten samples and the model input budget', () => {
        const wide: KnowledgeTableSource = {
            ...source,
            columns: Array.from({ length: 65 }, (_, i) => ({
                columnId: `c${i}`,
                key: `field${i}`,
                label: `Field ${i}`,
                column: i + 1
            })),
            samples: Array.from({ length: 50 }, (_, rowNumber) => ({
                rowNumber,
                values: Object.fromEntries(
                    Array.from({ length: 65 }, (_, i) => [`c${i}`, 'bounded sample '.repeat(100)])
                )
            }))
        }
        const batches = tableModelBatches(wide)
        expect(batches.length).toBeGreaterThan(1)
        expect(batches.flatMap((batch) => batch.source.columns)).toHaveLength(65)
        expect(batches.every((batch) => batch.source.columns.length <= 24 && batch.source.samples.length <= 10)).toBe(
            true
        )
        const filtered = tableModelBatches(source, ['amount'])
        expect(filtered[0].source.columns.map((column) => column.columnId)).toEqual(['A'])
        expect(JSON.stringify(filtered)).not.toContain('private forecast')
        expect(JSON.stringify(filtered)).not.toContain('secret')
    })

    it.each([
        { summary: 'Orders', columns: [{ columnId: 'invented', description: 'Unknown' }] },
        {
            summary: 'Orders',
            columns: [
                { columnId: 'A', description: 'Amount' },
                { columnId: 'A', description: 'Other' }
            ]
        },
        { summary: 'Orders', columns: [] },
        { summary: 'Orders', columns: [{ columnId: 'A', description: 'Amount', key: 'redefine' }] }
    ])('rejects malformed identities and source field redefinition: %j', (output) => {
        expect(() =>
            parseTableModelResult(JSON.stringify(output), { ...source, columns: [source.columns[0]] })
        ).toThrow()
    })

    it('accepts unknown semantics as empty values while preserving parser-owned column identities', () => {
        const result = parseTableModelResult('{"summary":"","columns":[{"columnId":"A","description":""}]}', {
            ...source,
            columns: [source.columns[0]]
        })
        expect(result.columns).toEqual([{ ...source.columns[0], description: '' }])
        expect(result).not.toHaveProperty('samples')
    })

    it('rejects copied row facts in generated descriptions instead of attaching them to other rows', () => {
        const sampled = {
            ...source,
            columns: [source.columns[0]],
            samples: [{ rowNumber: 2, values: { A: 'CUSTOMER-847291' } }]
        }
        expect(() =>
            parseTableModelResult(
                JSON.stringify({
                    summary: 'Orders for CUSTOMER-847291',
                    columns: [{ columnId: 'A', description: 'Amount' }]
                }),
                sampled
            )
        ).toThrow()
    })
})

it('rejects short copied samples', () => {
    const table = { ...source, columns: [source.columns[0]], samples: [{ rowNumber: 2, values: { A: '冷却水' } }] }
    expect(() =>
        parseTableModelResult(
            JSON.stringify({ summary: '', columns: [{ columnId: 'A', description: '例如冷却水' }] }),
            table
        )
    ).toThrow()
})

it('uses all indexed headers for the table summary without exposing sample values', () => {
    const wide = {
        ...source,
        columns: Array.from({ length: 32 }, (_, i) => ({
            columnId: String(i),
            column: i + 1,
            key: `field${i}`,
            label: `Field ${i}`
        }))
    }
    const batch = tableSummaryBatches(wide, undefined, 'en', 16384)[0]
    expect(batch.messages[1].content).toContain('Field 31')
    expect(batch.messages[1].content).toContain('"columnCount":32')
    expect(JSON.stringify(batch.messages)).not.toContain('private forecast')
})

it('rejects unsupported code meanings and accepts exact documented evidence', () => {
    const table = { ...source, columns: [source.columns[0]], samples: [] }
    const output = {
        summary: '',
        columns: [
            {
                columnId: 'A',
                description: '',
                valueMeanings: 'F01 means mechanical failure',
                evidence: 'F01 means mechanical failure'
            }
        ]
    }
    expect(() => parseTableModelResult(JSON.stringify(output), table)).toThrow()
    expect(
        parseTableModelResult(JSON.stringify(output), table, 'F01 means mechanical failure').columns[0].valueMeanings
    ).toBe('F01 means mechanical failure')
    expect(
        parseTableModelResult(JSON.stringify(output), table, 'F01 means mechanical failure').columns[0]
    ).not.toHaveProperty('evidence')
})

it('rejects English descriptions for Chinese tables', () => {
    expect(() =>
        parseTableModelResult(
            JSON.stringify({ summary: '', columns: [{ columnId: 'A', description: 'Temperature reading' }] }),
            { ...source, columns: [source.columns[0]] },
            '',
            'zh'
        )
    ).toThrow()
})

it('rejects English prose with a token Chinese prefix', () => {
    expect(() =>
        parseTableModelResult(
            JSON.stringify({
                summary: '\u4e2d\u6587 This table records equipment operating measurements and business performance',
                columns: [{ columnId: 'A', description: '' }]
            }),
            { ...source, columns: [source.columns[0]] },
            '',
            'zh'
        )
    ).toThrow()
})

it('keeps undocumented boolean semantics neutral', () => {
    const table: KnowledgeTableSource = {
        ...source,
        columns: [{ ...source.columns[0], valueType: 'boolean' }],
        samples: [{ rowNumber: 2, values: { A: true } }]
    }
    const result = parseTableModelResult(
        JSON.stringify({ summary: '', columns: [{ columnId: 'A', description: '有效状态' }] }),
        table,
        '',
        'zh'
    )
    expect(result.columns[0].description).toBe('布尔状态标志')
})

it('does not send excluded headers or samples to the full-table summary', () => {
    const batch = tableSummaryBatches(source, ['amount'], 'en', 16384)[0]
    expect(JSON.stringify(batch.messages)).not.toContain('secret')
    expect(JSON.stringify(batch.messages)).not.toContain('private forecast')
})

it('does not exempt copied samples merely mentioned in negative instructions or unrelated headers', () => {
    const table = { ...source, columns: [source.columns[0]], samples: [{ rowNumber: 2, values: { A: 'normal' } }] }
    const output = JSON.stringify({ summary: 'This record is normal', columns: [{ columnId: 'A', description: '' }] })
    expect(() => parseTableModelResult(output, table, 'Do not copy normal or other sample values.')).toThrow()
    expect(() =>
        parseTableModelResult(output, { ...table, columns: [{ ...source.columns[0], label: 'normal state' }] })
    ).toThrow()
})

it('allows a sampled code only in its evidence-backed value meanings, not copied into prose', () => {
    const table = { ...source, columns: [source.columns[0]], samples: [{ rowNumber: 2, values: { A: 'F01' } }] }
    const output = {
        summary: '',
        columns: [
            {
                columnId: 'A',
                description: 'Failure category',
                valueMeanings: 'F01 means mechanical failure',
                evidence: 'F01 means mechanical failure'
            }
        ]
    }
    expect(
        parseTableModelResult(JSON.stringify(output), table, 'F01 means mechanical failure').columns[0].valueMeanings
    ).toContain('F01')
    expect(() =>
        parseTableModelResult(
            JSON.stringify({ ...output, summary: 'This equipment has F01' }),
            table,
            'F01 means mechanical failure'
        )
    ).toThrow()
})
