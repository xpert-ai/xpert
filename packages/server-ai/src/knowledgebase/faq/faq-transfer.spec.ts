import * as XLSX from 'xlsx'
import { parseWeKnoraFAQFile, serializeWeKnoraFAQCSV, serializeWeKnoraFAQJSON } from './faq-transfer'

describe('WeKnora FAQ transfer', () => {
    it('parses WeKnora JSON fields and preserves FAQ enabled state', () => {
        const entries = parseWeKnoraFAQFile({
            fileName: 'faq.json',
            buffer: Buffer.from(
                JSON.stringify([
                    {
                        tag_name: 'Support',
                        standard_question: 'How do I reset my password?',
                        similar_questions: ['Forgot my password'],
                        negative_questions: ['How do I change my username?'],
                        answers: ['Open settings.', 'Choose Reset password.'],
                        answer_strategy: 'all',
                        is_enabled: false
                    }
                ])
            )
        })

        expect(entries).toEqual([
            {
                standardQuestion: 'How do I reset my password?',
                similarQuestions: ['Forgot my password'],
                negativeQuestions: ['How do I change my username?'],
                answerBlocks: ['Open settings.', 'Choose Reset password.'],
                enabled: false
            }
        ])
    })

    it('parses annotated WeKnora CSV headers, quoted cells and ## multi-value fields', () => {
        const entries = parseWeKnoraFAQFile({
            fileName: 'faq.csv',
            buffer: Buffer.from(
                '\ufeff标签(必填),问题(必填),相似问题(选填-多个用##分隔),反例问题(选填-多个用##分隔),机器人回答(必填-多个用##分隔),是否全部回复(选填-默认FALSE),是否停用(选填-默认FALSE)\n' +
                    '支持,"密码, 怎么重置？",忘记密码##找回密码,修改用户名,"第一行\n第二行##第二个回答",TRUE,TRUE'
            )
        })

        expect(entries).toEqual([
            {
                standardQuestion: '密码, 怎么重置？',
                similarQuestions: ['忘记密码', '找回密码'],
                negativeQuestions: ['修改用户名'],
                answerBlocks: ['第一行\n第二行', '第二个回答'],
                enabled: false
            }
        ])
    })

    it('parses the first worksheet from a WeKnora Excel file', () => {
        const worksheet = XLSX.utils.json_to_sheet([
            {
                '标签(必填)': 'Support',
                '问题(必填)': 'Where is billing?',
                '相似问题(选填-多个用##分隔)': 'Billing page##Invoices',
                '反例问题(选填-多个用##分隔)': 'Cancel account',
                '机器人回答(必填-多个用##分隔)': 'Open Settings##Select Billing',
                '是否停用(选填-默认FALSE)': 'FALSE'
            }
        ])
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, 'FAQ')

        const entries = parseWeKnoraFAQFile({
            fileName: 'faq.xlsx',
            buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
        })

        expect(entries[0]).toEqual({
            standardQuestion: 'Where is billing?',
            similarQuestions: ['Billing page', 'Invoices'],
            negativeQuestions: ['Cancel account'],
            answerBlocks: ['Open Settings', 'Select Billing'],
            enabled: true
        })
    })

    it('exports WeKnora-compatible CSV and JSON without losing Xpert FAQ fields', () => {
        const entries = [
            {
                id: 'faq-1',
                knowledgebaseId: 'kb-1',
                standardQuestion: 'Question, with comma',
                similarQuestions: ['Similar one', 'Similar two'],
                negativeQuestions: ['Do not match'],
                answerBlocks: ['Answer one', 'Answer two'],
                enabled: false,
                version: 2
            }
        ]

        const csv = serializeWeKnoraFAQCSV(entries)
        expect(csv.startsWith('\ufeff')).toBe(true)
        expect(csv).toContain('标签(必填),问题(必填)')
        expect(csv).toContain('"Question, with comma"')
        expect(csv).toContain('Similar one##Similar two')
        expect(csv).toContain('Do not match')
        expect(csv).toContain(',TRUE,TRUE,FALSE')

        expect(JSON.parse(serializeWeKnoraFAQJSON(entries))).toEqual([
            {
                tag_name: '未分类',
                standard_question: 'Question, with comma',
                similar_questions: ['Similar one', 'Similar two'],
                negative_questions: ['Do not match'],
                answers: ['Answer one', 'Answer two'],
                answer_strategy: 'all',
                is_enabled: false,
                is_recommended: true
            }
        ])
    })

    it('neutralizes spreadsheet formulas in CSV while preserving FAQ values on re-import', () => {
        const entries = [
            {
                id: 'faq-formula',
                knowledgebaseId: 'kb-1',
                standardQuestion: '=HYPERLINK("https://example.com")',
                similarQuestions: ['+SUM(1,1)'],
                negativeQuestions: ['@command'],
                answerBlocks: ['-1+2'],
                enabled: true,
                version: 1
            }
        ]

        const csv = serializeWeKnoraFAQCSV(entries)
        expect(csv).toContain('\t=HYPERLINK')
        expect(csv).toContain('\t+SUM')
        expect(csv).toContain('\t@command')
        expect(csv).toContain('\t-1+2')

        expect(parseWeKnoraFAQFile({ fileName: 'faq.csv', buffer: Buffer.from(csv) })).toEqual([
            {
                standardQuestion: entries[0].standardQuestion,
                similarQuestions: entries[0].similarQuestions,
                negativeQuestions: entries[0].negativeQuestions,
                answerBlocks: entries[0].answerBlocks,
                enabled: true
            }
        ])
    })
})
