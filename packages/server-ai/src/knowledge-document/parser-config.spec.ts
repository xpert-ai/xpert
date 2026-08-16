import { KBDocumentCategoryEnum } from '@xpert-ai/contracts'
import { resolveKnowledgeDocumentParserConfig } from './parser-config'

describe('resolveKnowledgeDocumentParserConfig for spreadsheets', () => {
    it('retains platform spreadsheet interpretation settings', () => {
        expect(
            resolveKnowledgeDocumentParserConfig({
                type: 'xlsx',
                category: KBDocumentCategoryEnum.Sheet,
                parserConfig: {
                    textSplitterType: 'recursive-character',
                    textSplitter: { chunkSize: 5000, chunkOverlap: 500 },
                    spreadsheet: {
                        interpretation: 'form_document',
                        contextUnit: 'workbook',
                        maxChunkTokens: 5000,
                        emitCellAnchors: true
                    }
                }
            })
        ).toMatchObject({
            textSplitterType: 'recursive-character',
            textSplitter: { chunkSize: 5000, chunkOverlap: 500 },
            spreadsheet: {
                interpretation: 'form_document',
                contextUnit: 'workbook',
                maxChunkTokens: 5000,
                emitCellAnchors: true
            }
        })
    })

    it('retains an explicitly selected transformer so it overrides native spreadsheet parsing', () => {
        expect(
            resolveKnowledgeDocumentParserConfig({
                type: 'xls',
                category: KBDocumentCategoryEnum.Sheet,
                parserConfig: {
                    transformerType: 'baidu-paddleocr-vl',
                    transformerIntegration: 'ocr-connection',
                    transformer: { preserveRawOutput: true }
                }
            })
        ).toMatchObject({
            transformerType: 'baidu-paddleocr-vl',
            transformerIntegration: 'ocr-connection',
            transformer: { preserveRawOutput: true }
        })
    })
})
