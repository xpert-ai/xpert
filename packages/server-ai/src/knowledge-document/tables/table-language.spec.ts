import { parseTableLanguage, tableLanguageMessages, validateTableLanguage } from './table-language'
import { tableModelBatches } from './table-metadata'
import { countTextTokens } from '@xpert-ai/plugin-sdk'
import type { KnowledgeTableSource } from '@xpert-ai/contracts'

describe('table metadata language', () => {
    it.each(['zh', 'ja', 'en', 'ko', 'fr', 'de', 'ru', 'ar'])('accepts an explicit language code: %s', (language) => {
        expect(parseTableLanguage(JSON.stringify({ language }))).toBe(language)
    })

    it.each(['{"language":"Chinese"}', '{"language":"xx"}', '{"language":"en","extra":true}'])(
        'rejects invalid selection: %s',
        (response) => {
            expect(() => parseTableLanguage(response)).toThrow()
        }
    )

    it('accepts source acronyms in Chinese prose but rejects mostly English prose', () => {
        const columns = ['MTTR_h', 'OEE'].map((label, index) => ({
            label,
            key: label,
            columnId: String(index),
            column: index + 1
        }))
        expect(() =>
            validateTableLanguage(
                'MTTR_h \u8868\u793a\u5e73\u5747\u4fee\u590d\u65f6\u95f4\uff0cOEE \u8868\u793a\u8bbe\u5907\u7efc\u5408\u6548\u7387',
                'zh',
                columns
            )
        ).not.toThrow()
        expect(() =>
            validateTableLanguage('\u4e2d\u6587 English description of equipment measurements', 'zh', columns)
        ).toThrow()
        expect(() => validateTableLanguage('\u58f2\u4e0a\u306e\u91d1\u984d\u3067\u3059', 'ja')).not.toThrow()
        expect(() => validateTableLanguage('\u8bb0\u5f55\u9500\u552e\u91d1\u989d', 'ja')).toThrow()
    })

    it('bounds language selection and does not force Han-only Japanese headers into Chinese', () => {
        const source: KnowledgeTableSource = {
            tableId: 'table',
            sheetName: '\u58f2\u4e0a',
            range: 'A1:A2',
            headerRow: 1,
            rowCount: 1,
            columns: [{ columnId: 'A', column: 1, label: '\u58f2\u4e0a\u91d1\u984d', key: 'amount' }],
            samples: []
        }
        const messages = tableLanguageMessages([source], undefined, 16384)
        expect(messages[1].content).toContain('\u58f2\u4e0a\u91d1\u984d')
        expect(countTextTokens(JSON.stringify(messages))).toBeLessThanOrEqual(2000)
        expect(tableModelBatches(source, undefined, '', 16384, 'ja')[0].messages[0].content).toContain('"ja"')
    })

    it('uses sample text for language detection when labels are only column coordinates', () => {
        const coordinate: KnowledgeTableSource = {
            tableId: 'sheet:0',
            sheetName: '\u8bbe\u5907',
            range: 'A1:B2',
            rowCount: 2,
            columns: [
                { columnId: 'A', key: 'A', label: 'A', column: 1 },
                { columnId: 'B', key: 'B', label: 'B', column: 2 }
            ],
            samples: [{ rowNumber: 1, values: { A: '\u51b7\u5374\u6c34\u6cf5-01', B: '\u5f52\u8fd8\u524d' } }]
        }
        const messages = tableLanguageMessages([coordinate], undefined, 16384)
        expect(messages[0].content).toContain('coordinates')
        expect(messages[1].content).toContain('\u5f52\u8fd8\u524d')
        expect(messages[1].content).toContain('\u51b7\u5374\u6c34\u6cf5-01')
        const named = tableLanguageMessages(
            [
                {
                    ...coordinate,
                    headerRow: 1,
                    columns: [{ columnId: 'A', key: 'amount', label: '\u9500\u552e\u989d', column: 1 }],
                    samples: [{ rowNumber: 2, values: { A: 'private forecast' } }]
                }
            ],
            undefined,
            16384
        )
        expect(named[1].content).not.toContain('private forecast')
        expect(named[0].content).not.toContain('coordinates')
        const indexed = tableLanguageMessages([coordinate], ['A'], 16384)
        expect(indexed[1].content).toContain('\u51b7\u5374\u6c34\u6cf5-01')
        expect(indexed[1].content).not.toContain('\u5f52\u8fd8\u524d')
    })

    it('uses explicit header rows even when field names look like column coordinates', () => {
        const source: KnowledgeTableSource = {
            tableId: 'sheet:0',
            sheetName: 'Products',
            range: 'A1:B2',
            headerRow: 1,
            rowCount: 1,
            columns: [
                { columnId: 'A', key: 'SKU', label: 'SKU', column: 1 },
                { columnId: 'B', key: 'VAT', label: 'VAT', column: 2 }
            ],
            samples: [{ rowNumber: 2, values: { A: 'ABC-123', B: 'CN tax' } }]
        }

        const messages = tableLanguageMessages([source], undefined, 16384)

        expect(messages[0].content).not.toContain('coordinates')
        expect(messages[1].content).toContain('SKU')
        expect(messages[1].content).toContain('VAT')
        expect(messages[1].content).not.toContain('ABC-123')
        expect(messages[1].content).not.toContain('CN tax')
    })

    it('samples only selected columns of sheets without headers in a mixed workbook', () => {
        const named: KnowledgeTableSource = {
            tableId: 'sheet:0',
            sheetName: 'Catalog',
            range: 'A1:A2',
            headerRow: 1,
            rowCount: 1,
            columns: [{ columnId: 'A', key: 'Description', label: 'Description', column: 1 }],
            samples: [{ rowNumber: 2, values: { A: 'private named row' } }]
        }
        const withoutHeaders: KnowledgeTableSource = {
            tableId: 'sheet:1',
            sheetName: 'Raw',
            range: 'A1:B1',
            rowCount: 1,
            columns: [
                { columnId: 'A', key: 'A', label: 'A', column: 1 },
                { columnId: 'B', key: 'B', label: 'B', column: 2 }
            ],
            samples: [{ rowNumber: 1, values: { A: 'selected sample', B: 'excluded sample' } }]
        }

        const messages = tableLanguageMessages([named, withoutHeaders], ['Description', 'A'], 16384)

        expect(messages[1].content).toContain('Description')
        expect(messages[1].content).toContain('selected sample')
        expect(messages[1].content).not.toContain('private named row')
        expect(messages[1].content).not.toContain('excluded sample')
    })
})
