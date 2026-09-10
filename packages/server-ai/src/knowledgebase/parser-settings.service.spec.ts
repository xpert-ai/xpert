jest.mock('@xpert-ai/plugin-sdk', () => ({
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

const defaults: KnowledgebaseParserConfig = {
    chunkSize: 32,
    chunkOverlap: 0,
    delimiter: null,
    separators: ['\\n', '！', '？']
}

function setup() {
    const strategies = [new RecursiveCharacterStrategy(), new MarkdownRecursiveStrategy(), new ParentChildStrategy()]
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
