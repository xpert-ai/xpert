jest.mock('@xpert-ai/plugin-sdk', () => ({
    ...jest.requireActual('../../../plugin-sdk/src/lib/ai-model/utils/tokenizer'),
    TextSplitterStrategy: () => () => undefined,
    TextSplitterRegistry: class {},
    DocumentTransformerRegistry: class {}
}))

import { Document } from '@langchain/core/documents'
import { buildChunkTree, KnowledgebaseParserConfig, KnowledgeStructureEnum } from '@xpert-ai/contracts'
import { DocumentTransformerRegistry, TextSplitterRegistry } from '@xpert-ai/plugin-sdk'
import { resolveKnowledgeDocumentParserConfig } from '../knowledge-document/parser-config'
import { splitKnowledgeDocuments } from '../knowledge-document/split-documents'
import { KnowledgeParserSettingsService } from './parser-settings.service'
import { RecursiveCharacterStrategy } from './plugins/textsplitter-common/recursive-character.strategy'
import { MarkdownRecursiveStrategy } from './plugins/textsplitter-common/markdown-recursive.strategy'
import { ParentChildStrategy } from './plugins/textsplitter-common/parent-child.strategy'
import { StructureAwareStrategy } from './plugins/textsplitter-common/structure-aware.strategy'
import { AutoTextSplitterStrategy } from './plugins/textsplitter-common/auto.strategy'
import { countTokensSafe } from '../../../plugin-sdk/src/lib/ai-model/utils/tokenizer'

const defaults: KnowledgebaseParserConfig = {
    chunkSize: 32,
    chunkOverlap: 0,
    delimiter: null,
    separators: ['\\n', '！', '？']
}

function setup() {
    const recursive = new RecursiveCharacterStrategy()
    const markdown = new MarkdownRecursiveStrategy()
    const structured = new StructureAwareStrategy(recursive)
    const strategies = [
        recursive,
        markdown,
        new ParentChildStrategy(),
        structured,
        new AutoTextSplitterStrategy(structured, markdown, recursive)
    ]
    const splitters = {
        get: (name: string) => strategies.find((strategy) => strategy.meta.name === name)
    } as unknown as TextSplitterRegistry
    const validateConfig = jest.fn()
    const transformers = {
        get: (name: string) => ({
            meta: { supportedFileTypes: name === 'pdf-provider' || name === 'integrated-pdf' ? ['pdf'] : ['docx'] },
            permissions: name === 'integrated-pdf' ? [{ type: 'integration', service: 'ocr' }] : [],
            validateConfig
        })
    } as unknown as DocumentTransformerRegistry
    return { service: new KnowledgeParserSettingsService(splitters, transformers), splitters, validateConfig }
}

describe('KnowledgeParserSettingsService', () => {
    it('validates spreadsheet headers and bounded table metadata instructions on save', async () => {
        const { service } = setup()
        await expect(
            service.validateSettings({
                ...defaults,
                spreadsheet: { firstRowAsHeader: false },
                tableMetadataRequirements: ''
            })
        ).resolves.toBe(KnowledgeStructureEnum.General)
        await expect(
            service.validateSettings({ ...defaults, tableMetadataRequirements: 'x'.repeat(4001) })
        ).rejects.toThrow()
        await expect(
            service.validateSettings({ ...defaults, spreadsheet: { firstRowAsHeader: 'false' } } as never)
        ).rejects.toThrow()
    })
    it('returns public language diagnostics and uses the same boundaries as actual document processing', async () => {
        const { service, splitters } = setup()
        const text = '\u8fd9\u662f\u4e00\u4e2a\u4e2d\u6587\u53e5\u5b50\u3002'.repeat(30)
        const parserConfig = {
            ...defaults,
            separators: undefined,
            chunkSize: 80,
            chunkLanguageHint: 'Chinese' as const,
            maxChunkTokens: 48
        }
        const preview = await service.preview({ type: 'txt', text, parserConfig })
        const actual = await splitKnowledgeDocuments(splitters, { type: 'txt', parserConfig }, [
            new Document({ pageContent: text, metadata: { chunkId: 'source', contentFormat: 'text' } })
        ])
        expect(preview.languages[0]).toMatchObject({
            languageHint: 'Chinese',
            detectedLanguage: 'Chinese',
            resolvedLanguage: 'Chinese'
        })
        expect(preview.chunks.map((chunk) => chunk.pageContent)).toEqual(
            actual.chunks.map((chunk) => chunk.pageContent)
        )
        const invalid = { ...defaults, chunkLanguageHint: 'French' } as unknown as KnowledgebaseParserConfig
        await expect(service.validateSettings(invalid)).rejects.toThrow()
    })
    it('previews unconfigured Markdown through auto and preserves an explicit length strategy', async () => {
        const { service } = setup()
        const text = '| Name | Value |\n| --- | --- |\n| A | B |'
        const automatic = await service.preview({ type: 'md', text, parserConfig: defaults })
        expect(automatic.decisions[0]).toMatchObject({ requestedStrategy: 'auto', resolvedStrategy: 'structure-aware' })
        const explicit = await service.preview({
            type: 'md',
            text,
            parserConfig: { ...defaults, textSplitterType: 'recursive-character' }
        })
        expect(explicit.decisions).toBeUndefined()
    })
    it('retains character limits and existing overlap with the additional token cap, and preserves disabled output', async () => {
        const { service } = setup()
        const parserConfig = { ...defaults, chunkSize: 12, chunkOverlap: 3, separators: [] }
        const input = {
            type: 'txt' as const,
            text: 'a simple long English sentence that spans multiple chunks',
            parserConfig
        }
        const original = await service.preview(input)
        const disabled = await service.preview({ ...input, parserConfig: { ...parserConfig, maxChunkTokens: 0 } })
        const looseCap = await service.preview({ ...input, parserConfig: { ...parserConfig, maxChunkTokens: 8192 } })
        const content = (result: typeof original) => result.chunks.map((chunk) => chunk.pageContent)
        expect(content(disabled)).toEqual(content(original))
        expect(content(looseCap)).toEqual(content(original))
        const tightCap = await service.preview({ ...input, parserConfig: { ...parserConfig, maxChunkTokens: 2 } })
        for (const chunk of tightCap.chunks) {
            expect(chunk.pageContent.length).toBeLessThanOrEqual(12)
            expect(chunk.metadata.tokens).toBeLessThanOrEqual(2)
        }
    })

    it.each(['recursive-character', 'markdown-recursive', 'parent-child', 'auto', 'structure-aware'])(
        'enforces the token budget in both preview and ingestion for %s',
        async (textSplitterType) => {
            const { service, splitters } = setup()
            const parserConfig = {
                ...defaults,
                chunkSize: 1000,
                maxChunkTokens: 16,
                textSplitterType,
                textSplitter: { parent: { mode: 'full' }, child: { maxChars: 1000 } }
            }
            const text = '# Header\n\n' + '中文检索 mixed English 🧑🏽‍💻，这是完整的测试文本。'.repeat(12)
            const preview = await service.preview({ type: 'md', text, parserConfig })
            const formal = await splitKnowledgeDocuments(
                splitters,
                { type: 'md', parserConfig: resolveKnowledgeDocumentParserConfig({ type: 'md' }, parserConfig) },
                [
                    new Document({
                        pageContent: text,
                        metadata: { documentId: 'doc', chunkId: 'source', contentFormat: 'markdown' }
                    })
                ]
            )
            const leaves = formal.chunks.filter((chunk) => chunk.metadata.type !== 'parent')
            expect(leaves.length).toBeGreaterThan(1)
            for (const chunk of leaves) {
                expect(countTokensSafe(chunk.pageContent)).toBeLessThanOrEqual(16)
                expect(chunk.pageContent).not.toMatch(
                    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u
                )
            }
            const shape = (chunks: typeof preview.chunks) =>
                chunks.map((chunk) => ({
                    text: chunk.pageContent,
                    children: chunk.metadata.children?.map((child) => child.pageContent)
                }))
            expect(shape(preview.chunks)).toEqual(shape(buildChunkTree(formal.chunks)))
            if (textSplitterType === 'parent-child') {
                const parent = formal.chunks.find((chunk) => chunk.metadata.type === 'parent')
                expect(parent.pageContent).toBe(text)
                expect(leaves.every((chunk) => chunk.metadata.parentId === parent.metadata.chunkId)).toBe(true)
                for (const child of leaves) {
                    expect(parent.pageContent.slice(child.metadata.startOffset, child.metadata.endOffset)).toBe(
                        child.pageContent
                    )
                }
            }
        }
    )

    it.each([-1, 1.5, 8193, NaN, Infinity, null, '32'])(
        'rejects invalid token caps (%p) for saving, preview and document processing',
        async (value) => {
            const { service, splitters } = setup()
            const parserConfig = { ...defaults, maxChunkTokens: value } as KnowledgebaseParserConfig
            await expect(service.validateSettings(parserConfig)).rejects.toThrow()
            await expect(service.preview({ type: 'txt', text: 'test', parserConfig })).rejects.toThrow()
            await expect(
                splitKnowledgeDocuments(
                    splitters,
                    { type: 'txt', parserConfig: resolveKnowledgeDocumentParserConfig({ type: 'txt' }, parserConfig) },
                    [new Document({ pageContent: 'test' })]
                )
            ).rejects.toThrow()
        }
    )

    it.each(['recursive-character', 'markdown-recursive', 'parent-child'])(
        'previews %s with the same configuration and splitter as ingestion',
        async (textSplitterType) => {
            const { service, splitters } = setup()
            const parserConfig = {
                ...defaults,
                textSplitterType,
                textSplitter: { parent: { mode: 'full' }, child: { maxChars: 15 } }
            }
            const text = '# 标题\n第一段！第二段？第三段\n\n' + '正文内容。'.repeat(40)
            const preview = await service.preview({ type: 'md', text, parserConfig })
            const formal = await splitKnowledgeDocuments(
                splitters,
                {
                    type: 'md',
                    parserConfig: resolveKnowledgeDocumentParserConfig({ type: 'md' }, parserConfig)
                },
                [
                    new Document({
                        pageContent: text,
                        metadata: { documentId: 'doc', chunkId: 'source', contentFormat: 'markdown' }
                    })
                ]
            )
            const shape = (chunks: typeof preview.chunks) =>
                chunks.map((chunk) => ({
                    content: chunk.pageContent,
                    children: chunk.metadata.children?.map((child) => child.pageContent)
                }))
            expect(shape(preview.chunks)).toEqual(shape(buildChunkTree(formal.chunks)))
            expect(preview.chunks.length).toBeGreaterThan(0)
        }
    )

    it('validates size, overlap, strategy availability and parent-child limits', async () => {
        const { service } = setup()
        await expect(service.validateSettings(defaults)).resolves.toBe(KnowledgeStructureEnum.General)
        await expect(service.validateSettings({ ...defaults, chunkOverlap: 32 })).rejects.toThrow()
        await expect(service.validateSettings({ ...defaults, textSplitterType: 'missing' })).rejects.toThrow()
        await expect(
            service.validateSettings({
                ...defaults,
                textSplitterType: 'parent-child',
                textSplitter: { child: { maxChars: 0 } }
            })
        ).rejects.toThrow()
    })

    it('passes parent and child separator lists through preview and ingestion without flattening them', async () => {
        const { service, splitters } = setup()
        const parserConfig: KnowledgebaseParserConfig = {
            ...defaults,
            textSplitterType: 'parent-child',
            textSplitter: {
                parent: { mode: 'paragraph', separators: ['|', '\\n\\n'], maxChars: 20 },
                child: { separators: [',', '\\n'], maxChars: 5 }
            }
        }
        const text = 'alpha,beta|gamma,delta'
        const preview = await service.preview({ type: 'txt', text, parserConfig })
        const formal = await splitKnowledgeDocuments(
            splitters,
            {
                type: 'txt',
                parserConfig: resolveKnowledgeDocumentParserConfig({ type: 'txt' }, parserConfig)
            },
            [new Document({ pageContent: text })]
        )
        for (const chunks of [preview.chunks, buildChunkTree(formal.chunks)]) {
            expect(chunks.map((chunk) => chunk.pageContent)).toEqual(['alpha,beta', 'gamma,delta'])
            expect(chunks.map((chunk) => chunk.metadata.children.map((child) => child.pageContent))).toEqual([
                ['alpha', 'beta'],
                ['gamma', 'delta']
            ])
        }
    })

    it('accepts only declared PDF support and requires the selected integration', async () => {
        const { service, validateConfig } = setup()
        await expect(
            service.validateSettings({ ...defaults, pdfParser: { transformerType: 'word-only' } })
        ).rejects.toThrow()
        await expect(
            service.validateSettings({ ...defaults, pdfParser: { transformerType: 'integrated-pdf' } })
        ).rejects.toThrow()
        await service.validateSettings({
            ...defaults,
            pdfParser: { transformerType: 'pdf-provider', transformer: { renderPageImages: false } }
        })
        expect(validateConfig).toHaveBeenCalledWith({ stage: 'test', renderPageImages: false })
    })

    it('rejects empty or excessive preview input before splitting', async () => {
        const { service } = setup()
        for (const text of ['', ' ', 'a'.repeat(100001)]) {
            await expect(service.preview({ type: 'txt', text, parserConfig: defaults })).rejects.toThrow()
        }
    })
})
