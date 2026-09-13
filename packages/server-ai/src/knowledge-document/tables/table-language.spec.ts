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
            rowCount: 1,
            columns: [{ columnId: 'A', column: 1, label: '\u58f2\u4e0a\u91d1\u984d', key: 'amount' }],
            samples: []
        }
        const messages = tableLanguageMessages([source], undefined, 16384)
        expect(messages[1].content).toContain('\u58f2\u4e0a\u91d1\u984d')
        expect(countTextTokens(JSON.stringify(messages))).toBeLessThanOrEqual(2000)
        expect(tableModelBatches(source, undefined, '', 16384, 'ja')[0].messages[0].content).toContain('"ja"')
    })
})
