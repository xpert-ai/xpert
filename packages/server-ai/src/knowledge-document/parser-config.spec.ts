import { AiModelTypeEnum, KBDocumentCategoryEnum, KnowledgebaseParserConfig } from '@xpert-ai/contracts'
import { resolveKnowledgeDocumentParserConfig } from './parser-config'

describe('resolveKnowledgeDocumentParserConfig precedence', () => {
    it('defaults text documents to auto while keeping explicit choices and spreadsheet handling', () => {
        for (const type of ['txt', 'md', 'pdf', 'docx']) {
            expect(resolveKnowledgeDocumentParserConfig({ type }).textSplitterType).toBe('auto')
        }
        expect(
            resolveKnowledgeDocumentParserConfig({ type: 'xlsx', category: KBDocumentCategoryEnum.Sheet })
                .textSplitterType
        ).toBeUndefined()
        const explicit = resolveKnowledgeDocumentParserConfig({
            type: 'txt',
            parserConfig: { textSplitterType: 'recursive-character' }
        })
        expect(explicit.textSplitterType).toBe('recursive-character')
        expect(explicit.textSplitter).toMatchObject({ chunkSize: 1000, chunkOverlap: 200 })
        expect(
            resolveKnowledgeDocumentParserConfig(
                { type: 'txt' },
                { chunkSize: 512, chunkOverlap: 80, delimiter: null, textSplitterType: 'markdown-recursive' }
            ).textSplitterType
        ).toBe('markdown-recursive')
        expect(
            resolveKnowledgeDocumentParserConfig({ type: 'txt', parserConfig: { textSplitterType: 'parent-child' } })
                .textSplitterType
        ).toBe('parent-child')
    })
    it('inherits question settings while preserving an explicit per-document opt-out', () => {
        const questionGeneration = {
            enabled: true,
            questionCount: 3,
            customInstructions: 'For new employees',
            model: { copilotId: 'd349f858-50c2-4b41-a422-e74e265b4569', model: 'chat', modelType: AiModelTypeEnum.LLM }
        }
        const defaults = { chunkSize: 512, chunkOverlap: 0, delimiter: null, questionGeneration }
        expect(resolveKnowledgeDocumentParserConfig({ type: 'pdf' }, defaults).questionGeneration).toEqual(
            questionGeneration
        )
        const config = resolveKnowledgeDocumentParserConfig(
            { type: 'txt', parserConfig: { questionGeneration: { enabled: false } } },
            defaults
        )
        expect(config.questionGeneration).toEqual({ enabled: false })
        expect(
            resolveKnowledgeDocumentParserConfig({ type: 'xlsx', category: KBDocumentCategoryEnum.Sheet }, defaults)
                .questionGeneration
        ).toEqual(questionGeneration)
        expect(
            resolveKnowledgeDocumentParserConfig({ type: 'txt', parserConfig: config }, defaults).questionGeneration
        ).toEqual({ enabled: false })
    })
    it('inherits token limits while preserving document overrides, including zero, across repeated normalization', () => {
        const defaults = { chunkSize: 512, chunkOverlap: 0, delimiter: null, maxChunkTokens: 256 }
        expect(resolveKnowledgeDocumentParserConfig({ type: 'txt' }, defaults).maxChunkTokens).toBe(256)
        for (const maxChunkTokens of [0, 128]) {
            const config = resolveKnowledgeDocumentParserConfig(
                { type: 'pdf', parserConfig: { maxChunkTokens } },
                defaults
            )
            expect(config.maxChunkTokens).toBe(maxChunkTokens)
            expect(
                resolveKnowledgeDocumentParserConfig({ type: 'pdf', parserConfig: config }, defaults).maxChunkTokens
            ).toBe(maxChunkTokens)
        }
        const sheet = resolveKnowledgeDocumentParserConfig(
            {
                type: 'xlsx',
                category: KBDocumentCategoryEnum.Sheet,
                parserConfig: { maxChunkTokens: 128, spreadsheet: { maxChunkTokens: 5000 } }
            },
            defaults
        )
        expect(sheet.maxChunkTokens).toBeUndefined()
        expect(sheet.spreadsheet.maxChunkTokens).toBe(5000)
    })
    it('does not overwrite explicit character limits with built-in nested defaults', () => {
        const config = resolveKnowledgeDocumentParserConfig({
            type: 'txt',
            parserConfig: { chunkSize: 512, chunkOverlap: 0 }
        })

        expect(config.textSplitter).toMatchObject({ chunkSize: 512, chunkOverlap: 0 })
    })

    it('preserves explicitly configured strategy limits', () => {
        const config = resolveKnowledgeDocumentParserConfig({
            type: 'txt',
            parserConfig: {
                chunkSize: 512,
                chunkOverlap: 0,
                textSplitter: { chunkSize: 800, chunkOverlap: 40 }
            }
        })

        expect(config.textSplitter).toMatchObject({ chunkSize: 800, chunkOverlap: 40 })
    })
})

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

describe('new document knowledgebase defaults', () => {
    const defaults: KnowledgebaseParserConfig = {
        chunkSize: 512,
        chunkOverlap: 80,
        delimiter: '\\n\\n',
        separators: ['\\n\\n', '。', '！'],
        imageUnderstandingEnabled: false,
        imageUnderstanding: { promptTemplate: 'Describe in Chinese: {{context}}' },
        pdfParser: { transformerType: 'default', transformer: { pages: [1] } }
    }

    it('inherits limits, complete ordered separators and PDF configuration only for new PDFs', () => {
        const pdf = resolveKnowledgeDocumentParserConfig({ type: 'pdf' }, defaults)
        expect(pdf.textSplitter).toMatchObject({ chunkSize: 512, chunkOverlap: 80, separators: defaults.separators })
        expect(pdf.transformerType).toBe('default')
        expect(pdf.transformer).toEqual({ pages: [1] })
        expect(resolveKnowledgeDocumentParserConfig({ type: 'txt' }, defaults).transformer).toBeUndefined()
    })

    it('allows document limits, separators and prompts to override the knowledgebase', () => {
        const doc = resolveKnowledgeDocumentParserConfig(
            {
                type: 'pdf',
                parserConfig: {
                    textSplitter: { chunkSize: 1000, chunkOverlap: 0, separators: '!' },
                    imageUnderstandingEnabled: true,
                    imageUnderstanding: { promptTemplate: 'Document override' },
                    transformerType: 'pdf-visual'
                }
            },
            defaults
        )
        expect(doc.textSplitter).toMatchObject({ chunkSize: 1000, chunkOverlap: 0, separators: '!' })
        expect(doc.imageUnderstandingType).toBe('vlm-default')
        expect(doc.imageUnderstanding).toEqual({ promptTemplate: 'Document override' })
        expect(doc.transformerType).toBe('pdf-visual')
        expect(resolveKnowledgeDocumentParserConfig({ type: 'pdf', parserConfig: doc })).toEqual(doc)
    })

    it('retains explicit false through repeated normalization and preserves legacy format defaults', () => {
        const doc = resolveKnowledgeDocumentParserConfig({ type: 'pdf' }, defaults)
        expect(doc.imageUnderstandingEnabled).toBe(false)
        expect(doc.imageUnderstandingType).toBeUndefined()
        expect(
            resolveKnowledgeDocumentParserConfig({ type: 'pdf', parserConfig: doc }).imageUnderstandingType
        ).toBeUndefined()
        expect(resolveKnowledgeDocumentParserConfig({ type: 'pdf' }).imageUnderstandingType).toBe('vlm-default')
        expect(resolveKnowledgeDocumentParserConfig({ type: 'txt' }).imageUnderstandingType).toBeUndefined()
    })

    it('retains the selected image strategy when a document explicitly enables an inherited opt-out', () => {
        expect(
            resolveKnowledgeDocumentParserConfig(
                { type: 'pdf', parserConfig: { imageUnderstandingEnabled: true } },
                {
                    ...defaults,
                    imageUnderstandingType: 'custom-image-strategy'
                }
            ).imageUnderstandingType
        ).toBe('custom-image-strategy')
    })

    it('keeps empty separators and empty prompts as explicit overrides', () => {
        const doc = resolveKnowledgeDocumentParserConfig(
            {
                type: 'pdf',
                parserConfig: {
                    separators: [],
                    imageUnderstanding: { promptTemplate: '' }
                }
            },
            defaults
        )
        expect(doc.textSplitter.separators).toEqual([])
        expect(doc.imageUnderstanding.promptTemplate).toBe('')
    })

    it('does not migrate historical documents or apply text defaults to spreadsheets', () => {
        expect(resolveKnowledgeDocumentParserConfig({ type: 'txt' }).textSplitter).toMatchObject({
            chunkSize: 1000,
            chunkOverlap: 200
        })
        expect(
            resolveKnowledgeDocumentParserConfig({ type: 'xlsx', category: KBDocumentCategoryEnum.Sheet }, defaults)
        ).toEqual({})
    })
})
