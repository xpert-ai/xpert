import { KnowledgeTableSource } from '@xpert-ai/contracts'
import { countTextTokens } from '@xpert-ai/plugin-sdk'
import { parseTableSummary, tableSummaryBatches, tableSummaryMergeBatches } from './table-summary'

it('partitions all 300 long headers into bounded summary inputs', () => {
    const source: KnowledgeTableSource = {
        tableId: 'wide',
        sheetName: 'Measurements',
        range: 'A1:KN2',
        rowCount: 1,
        columns: Array.from({ length: 300 }, (_, i) => ({
            columnId: String(i),
            key: `f${i}`,
            column: i + 1,
            label: `Sensor ${i} ` + 'temperature pressure measurement details '.repeat(6)
        })),
        samples: []
    }
    const batches = tableSummaryBatches(source, undefined, 'en', 16384)
    expect(batches.length).toBeGreaterThan(1)
    expect(batches.every((batch) => countTextTokens(JSON.stringify(batch.messages)) <= 6000)).toBe(true)
    const headers = batches.flatMap((batch) => JSON.parse(batch.messages[1].content).columns)
    expect(headers).toEqual(source.columns.map((column) => column.label))
})

it('keeps reductions within budget, limits output and checks summaries against original row values', () => {
    const source: KnowledgeTableSource = {
        tableId: 'table',
        sheetName: 'Measurements',
        range: 'A1:A2',
        rowCount: 1,
        columns: [{ columnId: 'A', key: 'name', label: 'name', column: 1 }],
        samples: [{ rowNumber: 2, values: { A: 'normal' } }]
    }
    const summaries = Array.from({ length: 100 }, () =>
        'A description of equipment measurements and their structure. '.repeat(12)
    )
    const batches = tableSummaryMergeBatches(source, summaries, 'en', 16384)
    expect(batches.length).toBeLessThan(summaries.length)
    expect(batches.every((batch) => countTextTokens(JSON.stringify(batch.messages)) <= 6000)).toBe(true)
    expect(() =>
        parseTableSummary('{"summary":"This equipment is normal","columns":[]}', source, 'en', 16384)
    ).toThrow()
    expect(() =>
        parseTableSummary(
            JSON.stringify({ summary: 'Equipment measurements '.repeat(43), columns: [] }),
            source,
            'en',
            1024
        )
    ).toThrow()
    expect(() => tableSummaryMergeBatches(source, ['unbounded '.repeat(10000)], 'en', 16384)).toThrow()
})
