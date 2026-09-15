jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))
import { Document } from '@langchain/core/documents'
import { buildChunkTree, IKnowledgeDocument } from '@xpert-ai/contracts'
import { ChunkMetadata, countTextTokens, TImageUnderstandingResult } from '@xpert-ai/plugin-sdk'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { KnowledgeDocLoadCommand } from '../load.command'
import { KnowledgebaseService } from '../../../knowledgebase/knowledgebase.service'
import { KnowledgeDocLoadHandler } from './load.handler'
import { RecursiveCharacterStrategy } from '../../../knowledgebase/plugins/textsplitter-common/recursive-character.strategy'
import { AutoTextSplitterStrategy } from '../../../knowledgebase/plugins/textsplitter-common/auto.strategy'
import { StructureAwareStrategy } from '../../../knowledgebase/plugins/textsplitter-common/structure-aware.strategy'
import { MarkdownRecursiveStrategy } from '../../../knowledgebase/plugins/textsplitter-common/markdown-recursive.strategy'
import { ParentChildStrategy } from '../../../knowledgebase/plugins/textsplitter-common/parent-child.strategy'
import { KnowledgeDocumentService } from '../../document.service'
import { KnowledgeDocumentChunkService } from '../../chunk/chunk.service'

type Splitter = 'recursive-character' | 'auto' | 'structure-aware' | 'parent-child'

function fixture(mixed: boolean, enabled: boolean, recognized: boolean, splitter: Splitter = 'recursive-character') {
    const asset = {
        type: 'image',
        sourceType: 'pdf_page',
        page: 2,
        filePath: 'page2.png',
        url: 'https://files.test/page2.png'
    }
    const transformed = {
        chunks: [
            new Document<ChunkMetadata>({
                pageContent: (mixed ? 'PAGE1-NATIVE-471\n' : '') + '![page](https://files.test/page2.png)',
                metadata: { chunkId: 'source', contentFormat: 'markdown', page: 2 }
            })
        ],
        metadata: {
            assets: [asset],
            parserDiagnostics: {
                schemaVersion: 1,
                pages: [
                    ...(mixed ? [{ page: 1, status: 'text', imagePaths: [] }] : []),
                    { page: 2, status: 'needs-ocr', imagePaths: ['page2.png'] }
                ]
            }
        }
    }
    const understandImages = jest.fn(
        async (): Promise<TImageUnderstandingResult> => ({
            chunks: [
                ...transformed.chunks,
                ...(recognized
                    ? [
                          new Document<ChunkMetadata>({
                              pageContent: 'PAGE2-SCAN-862 385.50 '.repeat(80),
                              metadata: {
                                  chunkId: 'ocr',
                                  mediaType: 'image',
                                  contentFormat: 'markdown',
                                  parser: 'vlm',
                                  sourceType: 'pdf_page',
                                  page: 2,
                                  imagePath: 'page2.png'
                              }
                          })
                      ]
                    : [])
            ]
        })
    )
    const handler = new KnowledgeDocLoadHandler(
        {} as KnowledgebaseService,
        { execute: async () => ({}) } as unknown as CommandBus,
        {} as QueryBus
    )
    const recursive = new RecursiveCharacterStrategy()
    const structured = new StructureAwareStrategy(recursive)
    const splitters = {
        'recursive-character': recursive,
        'structure-aware': structured,
        auto: new AutoTextSplitterStrategy(structured, new MarkdownRecursiveStrategy(), recursive),
        'parent-child': new ParentChildStrategy()
    }
    Object.assign(handler, {
        knowledgeWorkAreaResolver: { resolve: async () => ({ volume: {}, tmpPath: { serverPath: '/tmp' } }) },
        transformerRegistry: {
            get: () => ({
                permissions: [],
                meta: { name: 'markitdown', supportedFileTypes: ['pdf'], providesImageText: false },
                transformDocuments: async () => [transformed]
            })
        },
        imageUnderstandingRegistry: {
            get: () => ({ permissions: [], requiresVisionModel: () => false, understandImages })
        },
        textSplitterRegistry: { get: () => splitters[splitter] },
        cacheManager: { get: async () => undefined, set: async () => undefined }
    })
    const doc = {
        id: 'doc',
        name: 'sample.pdf',
        type: 'pdf',
        filePath: 'sample.pdf',
        knowledgebaseId: 'kb',
        parserConfig: {
            transformerType: 'markitdown',
            imageUnderstandingEnabled: enabled,
            imageUnderstandingType: 'vlm-default',
            textSplitterType: splitter,
            chunkSize: 200,
            chunkOverlap: 0
        }
    } as IKnowledgeDocument
    return {
        handler,
        doc,
        understandImages,
        run: () => handler.execute(new KnowledgeDocLoadCommand({ doc, stage: 'test' }))
    }
}
it('does not report a pure scan as complete when OCR is disabled or fails', async () => {
    for (const enabled of [false, true]) {
        const f = fixture(false, enabled, false)
        await expect(f.run()).rejects.toThrow('No text was recognized')
        expect(f.doc.metadata.parserDiagnostics.pages[0].status).toBe('needs-ocr')
        expect(f.understandImages).toHaveBeenCalledTimes(enabled ? 1 : 0)
    }
})
it('retains native text but records the missing scan page on mixed PDFs', async () => {
    const f = fixture(true, false, false)
    const result = await f.run()
    expect(result.chunks.map((chunk) => chunk.pageContent).join('')).toContain('PAGE1-NATIVE-471')
    expect(f.doc.metadata.parserDiagnostics.pages[1].status).toBe('needs-ocr')
})
it('splits OCR text under the configured budget and preserves page identity', async () => {
    const f = fixture(false, true, true)
    const result = await f.run()
    expect(result.chunks.length).toBeGreaterThan(1)
    expect(result.chunks.every((chunk) => chunk.pageContent.length <= 200 && chunk.metadata.page === 2)).toBe(true)
    expect(result.chunks.map((chunk) => chunk.pageContent).join('')).toContain('PAGE2-SCAN-862')
    expect(f.doc.metadata.parserDiagnostics.pages[0].status).toBe('recognized')
})

it.each<Splitter>(['auto', 'structure-aware', 'recursive-character', 'parent-child'])(
    'applies text and token limits to real VLM page metadata using %s',
    async (splitter) => {
        const f = fixture(false, true, true, splitter)
        f.doc.parserConfig.maxChunkTokens = 32
        const result = await f.run()
        const leaves = result.chunks.filter((chunk) => chunk.metadata.type !== 'parent')
        expect(leaves.length).toBeGreaterThan(1)
        expect(
            leaves.every((chunk) => chunk.pageContent.length <= 200 && countTextTokens(chunk.pageContent) <= 32)
        ).toBe(true)
        expect(result.chunks.every((chunk) => chunk.metadata.mediaType === 'text')).toBe(true)
        expect(
            result.chunks.every((chunk) => chunk.metadata.page === 2 && chunk.metadata.imagePath === 'page2.png')
        ).toBe(true)
    }
)

it('keeps OCR context parents out of embedding inputs and preserves their children', async () => {
    const f = fixture(false, true, true, 'parent-child')
    const result = await f.run()
    const byId = new Map(
        result.chunks.map((chunk) => [chunk.metadata.chunkId, { ...chunk, id: chunk.metadata.chunkId }])
    )
    const stored = result.chunks.map((chunk) => ({
        ...byId.get(chunk.metadata.chunkId),
        parent: byId.get(chunk.metadata.parentId)
    }))
    const service: KnowledgeDocumentChunkService = Object.create(KnowledgeDocumentChunkService.prototype)
    const embedded = service.findAllEmbeddingNodes(stored)
    expect(result.chunks.some((chunk) => chunk.metadata.type === 'parent')).toBe(true)
    expect(embedded.length).toBeGreaterThan(0)
    expect(embedded.every((chunk) => chunk.metadata.type === 'child' && byId.has(chunk.metadata.parentId))).toBe(true)
})

it('does not mutate cached OCR or convert ordinary image descriptions into page text', async () => {
    const f = fixture(true, true, true)
    const parent = new Document<ChunkMetadata>({ pageContent: 'Original text.', metadata: { chunkId: 'native' } })
    const page = new Document<ChunkMetadata>({
        pageContent: 'Page transcript with https://example.test and person@example.test',
        metadata: {
            chunkId: 'page',
            mediaType: 'image',
            parser: 'vlm',
            sourceType: 'pdf_page',
            page: 2,
            imagePath: 'page2.png'
        }
    })
    const image = new Document<ChunkMetadata>({
        pageContent: 'Ordinary illustration description. '.repeat(30),
        metadata: {
            chunkId: 'image',
            mediaType: 'image',
            parser: 'vlm',
            parentId: 'native',
            imagePath: 'illustration.png'
        }
    })
    f.understandImages.mockResolvedValue({ chunks: [parent, page, image] })
    f.doc.parserConfig.removeSensitive = true
    const original = JSON.stringify([parent, page, image])
    const result = await f.run()
    expect(JSON.stringify([parent, page, image])).toBe(original)
    const illustration = result.chunks.find((chunk) => chunk.metadata.chunkId === 'image')
    expect(illustration.pageContent).toBe(image.pageContent)
    expect(illustration.metadata).toMatchObject(image.metadata)
    const transcript = result.chunks.find((chunk) => chunk.metadata.sourceType === 'pdf_page')
    expect(transcript.pageContent).not.toContain('https://example.test')
    expect(transcript.pageContent).not.toContain('person@example.test')
})

it.each<Splitter>(['recursive-character', 'parent-child'])(
    'keeps multiple OCR pages in order with sibling-scoped indexes using %s',
    async (splitter) => {
        const f = fixture(false, true, true, splitter)
        f.understandImages.mockResolvedValue({
            chunks: [2, 3].map(
                (page) =>
                    new Document<ChunkMetadata>({
                        pageContent: `PAGE${page}-SCAN-862 385.50 `.repeat(80),
                        metadata: {
                            chunkId: `ocr-${page}`,
                            mediaType: 'image',
                            contentFormat: 'markdown',
                            parser: 'vlm',
                            sourceType: 'pdf_page',
                            page,
                            imagePath: `page${page}.png`
                        }
                    })
            )
        })
        const result = await f.run()
        const roots = result.chunks.filter((chunk) => !chunk.metadata.parentId)
        expect(roots.map((chunk) => chunk.metadata.chunkIndex)).toEqual(roots.map((_chunk, index) => index))
        if (splitter === 'parent-child') {
            const tree = buildChunkTree<ChunkMetadata>(
                result.chunks.map((chunk) => ({
                    ...chunk,
                    metadata: { ...chunk.metadata, chunkId: chunk.metadata.chunkId }
                }))
            )
            expect(tree.map((chunk) => chunk.metadata.page)).toEqual([2, 2, 3, 3])
            for (const parent of tree) {
                expect(parent.metadata.children.length).toBeGreaterThan(0)
                expect(parent.metadata.children.map((child) => child.metadata.chunkIndex)).toEqual(
                    parent.metadata.children.map((_child, index) => index)
                )
                expect(parent.metadata.children.every((child) => child.metadata.page === parent.metadata.page)).toBe(
                    true
                )
            }
        } else {
            const service: KnowledgeDocumentService = Object.create(KnowledgeDocumentService.prototype)
            Object.assign(service, {
                chunkService: { findAll: async () => ({ items: result.chunks, total: result.chunks.length }) }
            })
            const page = await service.getChunks('doc', { skip: 0, take: 100 })
            expect(page.items.map((chunk) => chunk.metadata.page)).toEqual(
                result.chunks.map((chunk) => chunk.metadata.page)
            )
        }
    }
)

it('preserves existing indexes and image behavior when there are no PDF page transcripts', async () => {
    const f = fixture(true, true, true)
    const chunks = [
        new Document<ChunkMetadata>({
            pageContent: 'Original native text.',
            metadata: { chunkId: 'native', chunkIndex: 12 }
        }),
        new Document<ChunkMetadata>({
            pageContent: 'Ordinary illustration description. '.repeat(30),
            metadata: { chunkId: 'image', chunkIndex: 7, mediaType: 'image', parser: 'vlm', parentId: 'native' }
        })
    ]
    f.understandImages.mockResolvedValue({ chunks })
    const result = await f.run()
    expect(result.chunks).toEqual(chunks)
})
