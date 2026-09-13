import { Document } from '@langchain/core/documents'
import { IKnowledgeDocument, KBDocumentCategoryEnum, KBDocumentStatusEnum } from '@xpert-ai/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { KnowledgeDocLoadCommand } from '../load.command'
import { resolveKnowledgeDocumentParserConfig } from '../../parser-config'
import { KnowledgebaseService } from '../../../knowledgebase/knowledgebase.service'
import { KnowledgeDocLoadHandler } from './load.handler'
import { RecursiveCharacterStrategy } from '../../../knowledgebase/plugins/textsplitter-common/recursive-character.strategy'
import { countTextTokens } from '@xpert-ai/plugin-sdk'
import { computeObjectHash } from '@xpert-ai/server-core'
import { pick } from '@xpert-ai/server-common'
import * as language from '../../chunk-language'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as XLSX from 'xlsx'

describe('KnowledgeDocLoadHandler', () => {
    it('parses native Excel headers and table sources together while retaining the legacy first worksheet', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'knowledge-table-load-'))
        try {
            const workbook = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(
                workbook,
                XLSX.utils.aoa_to_sheet([
                    ['Name', 'Value'],
                    ['First', 0]
                ]),
                'One'
            )
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Other'], ['Second']]), 'Two')
            const filePath = join(directory, 'table.xlsx')
            XLSX.writeFile(workbook, filePath)
            const handler = new KnowledgeDocLoadHandler({} as never, {} as never, {} as never)
            Object.assign(handler, {
                knowledgeWorkAreaResolver: { resolve: async () => ({ volume: { path: () => filePath } }) }
            })
            const result = await handler.execute(
                new KnowledgeDocLoadCommand({
                    stage: 'test',
                    doc: {
                        id: 'doc',
                        knowledgebaseId: 'kb',
                        type: 'xlsx',
                        category: KBDocumentCategoryEnum.Sheet,
                        name: 'table.xlsx',
                        filePath: 'table.xlsx',
                        parserConfig: { spreadsheet: { firstRowAsHeader: false } }
                    } as IKnowledgeDocument
                })
            )
            expect(result.chunks.map((chunk) => chunk.pageContent)).toEqual([
                '{"A":"Name","B":"Value"}',
                '{"A":"First","B":0}'
            ])
            expect(result).toMatchObject({ tables: [{ tableId: 'sheet:0', sheetName: 'One', rowCount: 2 }] })
            expect(result.chunks[0].metadata.tableSource).toEqual({ tableId: 'sheet:0', rowNumber: 1, range: 'A1:B1' })
            const selected = await handler.execute(
                new KnowledgeDocLoadCommand({
                    stage: 'prod',
                    doc: {
                        id: 'doc',
                        knowledgebaseId: 'kb',
                        type: 'xlsx',
                        category: KBDocumentCategoryEnum.Sheet,
                        name: 'table.xlsx',
                        filePath: 'table.xlsx',
                        parserConfig: { spreadsheet: { interpretation: 'records', includeSheets: ['Two'] } }
                    } as IKnowledgeDocument
                })
            )
            expect(selected.chunks.map((chunk) => chunk.pageContent)).toEqual(['{"Other":"Second"}'])
            expect(selected.tables).toMatchObject([{ tableId: 'sheet:1', sheetName: 'Two', headerRow: 1, rowCount: 1 }])
        } finally {
            await rm(directory, { recursive: true, force: true })
        }
    })
    it('keeps CSV column headers even when Excel first-row headers are disabled', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'knowledge-csv-load-'))
        try {
            const filePath = join(directory, 'table.csv')
            await writeFile(filePath, 'Name,Count\nAlice,0\n')
            const handler = new KnowledgeDocLoadHandler({} as never, {} as never, {} as never)
            Object.assign(handler, {
                knowledgeWorkAreaResolver: { resolve: async () => ({ volume: { path: () => filePath } }) }
            })
            const result = await handler.execute(
                new KnowledgeDocLoadCommand({
                    stage: 'test',
                    doc: {
                        id: 'doc',
                        knowledgebaseId: 'kb',
                        type: 'csv',
                        category: KBDocumentCategoryEnum.Sheet,
                        name: 'renamed.xlsx',
                        filePath: 'table.csv',
                        parserConfig: { spreadsheet: { firstRowAsHeader: false } }
                    } as IKnowledgeDocument
                })
            )
            expect(result.chunks.map((chunk) => chunk.pageContent)).toEqual(['{"Name":"Alice","Count":0}'])
            expect(result.tables[0]).toMatchObject({ headerRow: 1, rowCount: 1 })
        } finally {
            await rm(directory, { recursive: true, force: true })
        }
    })
    it('detects once across batches and invalidates batch caches when the public hint or document language changes', async () => {
        const detector = jest.spyOn(language, 'detectChunkLanguage')
        const handler = new KnowledgeDocLoadHandler({} as KnowledgebaseService, {} as CommandBus, {} as QueryBus)
        const first = new Document({ pageContent: 'Common introduction.', metadata: { chunkId: 'first' } })
        let body = 'This is the English body. It has multiple sentences. These sentences describe configuration.'
        const cache = new Map<string, Awaited<ReturnType<KnowledgeDocLoadHandler['splitDocuments']>>>()
        Object.assign(handler, {
            knowledgeWorkAreaResolver: { resolve: async () => ({ volume: {}, tmpPath: { serverPath: '/tmp' } }) },
            transformSnapshotService: {
                load: async () => [
                    { chunks: [first] },
                    { chunks: [new Document({ pageContent: body, metadata: { chunkId: 'body' } })] }
                ]
            },
            textSplitterRegistry: { get: () => new RecursiveCharacterStrategy() },
            cacheManager: {
                get: async (key: string) => cache.get(key),
                set: async (key: string, value: Awaited<ReturnType<KnowledgeDocLoadHandler['splitDocuments']>>) =>
                    cache.set(key, value)
            }
        })
        const split = jest.spyOn(handler, 'splitDocuments')
        const run = (chunkLanguageHint: 'auto' | 'Chinese' = 'auto') =>
            handler.execute(
                new KnowledgeDocLoadCommand({
                    doc: {
                        id: 'doc',
                        knowledgebaseId: 'kb',
                        type: 'txt',
                        name: 'text.txt',
                        filePath: 'text.txt',
                        parserConfig: {
                            chunkLanguageHint,
                            chunkSize: 80,
                            chunkOverlap: 0,
                            imageUnderstandingEnabled: false
                        }
                    } as IKnowledgeDocument,
                    mode: 'rechunk',
                    stage: 'test'
                })
            )
        await run()
        expect(detector).toHaveBeenCalledTimes(1)
        expect(split).toHaveBeenCalledTimes(2)
        await run()
        expect(split).toHaveBeenCalledTimes(2)
        await run('Chinese')
        expect(split).toHaveBeenCalledTimes(4)
        body = '\u8fd9\u662f\u4e2d\u6587\u6b63\u6587\u3002'.repeat(10)
        await run()
        // Even the unchanged introduction must use the new document-level language decision.
        expect(split).toHaveBeenCalledTimes(6)
        expect(detector).toHaveBeenCalledTimes(4)
    })
    it('reuses chunk cache only while the token cap is unchanged, including when disabling it', async () => {
        const handler = new KnowledgeDocLoadHandler(
            {} as unknown as KnowledgebaseService,
            {} as unknown as CommandBus,
            {} as unknown as QueryBus
        )
        const text = '中文 English 文档分块测试。'.repeat(20)
        const source = new Document({ pageContent: text, metadata: { chunkId: 'source' } })
        const cache = new Map<string, Awaited<ReturnType<KnowledgeDocLoadHandler['splitDocuments']>>>()
        Object.assign(handler, {
            knowledgeWorkAreaResolver: { resolve: async () => ({ volume: {}, tmpPath: { serverPath: '/tmp' } }) },
            transformSnapshotService: { load: async () => [{ chunks: [source] }] },
            textSplitterRegistry: { get: () => new RecursiveCharacterStrategy() },
            cacheManager: {
                get: async (key: string) => cache.get(key),
                set: async (key: string, value: Awaited<ReturnType<KnowledgeDocLoadHandler['splitDocuments']>>) =>
                    cache.set(key, value)
            }
        })
        const split = jest.spyOn(handler, 'splitDocuments')
        const run = (maxChunkTokens: number) =>
            handler.execute(
                new KnowledgeDocLoadCommand({
                    doc: {
                        id: 'doc',
                        knowledgebaseId: 'kb',
                        name: 'text.txt',
                        type: 'txt',
                        filePath: 'text.txt',
                        category: KBDocumentCategoryEnum.Text,
                        parserConfig: {
                            chunkSize: 1000,
                            chunkOverlap: 0,
                            maxChunkTokens,
                            imageUnderstandingEnabled: false
                        }
                    } as IKnowledgeDocument,
                    mode: 'rechunk',
                    stage: 'test'
                })
            )
        const first = await run(16)
        const cached = await run(16)
        expect(cached).toEqual(first)
        expect(split).toHaveBeenCalledTimes(1)
        const smaller = await run(8)
        expect(split).toHaveBeenCalledTimes(2)
        expect(smaller.chunks.length).toBeGreaterThan(first.chunks.length)
        expect(smaller.chunks.every((chunk) => countTextTokens(chunk.pageContent) <= 8)).toBe(true)
        const disabled = await run(0)
        expect(split).toHaveBeenCalledTimes(3)
        expect(disabled.chunks.map((chunk) => chunk.pageContent)).toEqual([text])
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('ignores legacy image results missing parents and reuses the refreshed complete result', async () => {
        const parent = new Document({
            pageContent: 'Full context',
            metadata: { chunkId: 'parent', type: 'parent' as const }
        })
        const child = new Document({
            pageContent: '![diagram](https://files.local/image.png)',
            metadata: { chunkId: 'child', type: 'child' as const, parentId: 'parent' }
        })
        const chunks = [parent, child]
        const transformed = {
            chunks: [parent],
            metadata: { assets: [{ type: 'image', url: 'https://files.local/image.png', filePath: 'image.png' }] }
        }
        const doc = {
            id: 'doc',
            knowledgebaseId: 'kb',
            name: 'manual.docx',
            type: 'docx',
            filePath: 'manual.docx',
            category: KBDocumentCategoryEnum.Text,
            parserConfig: { imageUnderstandingEnabled: true, imageUnderstandingType: 'vlm-default' }
        } as IKnowledgeDocument
        const parserConfig = resolveKnowledgeDocumentParserConfig(doc)
        const legacyKey =
            'knowledges:understanding:' +
            computeObjectHash({
                document: { ...transformed, chunks },
                parserConfig: pick(parserConfig, [
                    'imageUnderstandingType',
                    'imageUnderstandingIntegration',
                    'imageUnderstanding'
                ]),
                stage: 'test'
            })
        const cache = new Map<string, { chunks: Document[] }>([[legacyKey, { chunks: [child] }]])
        const understandImages = jest.fn(async () => ({ chunks }))
        const handler = new KnowledgeDocLoadHandler(
            {} as unknown as KnowledgebaseService,
            { execute: async () => ({}) } as unknown as CommandBus,
            {} as unknown as QueryBus
        )
        Object.assign(handler, {
            knowledgeWorkAreaResolver: { resolve: async () => ({ volume: {}, tmpPath: { serverPath: '/tmp' } }) },
            transformSnapshotService: { load: async () => [transformed] },
            imageUnderstandingRegistry: {
                get: () => ({ permissions: [], requiresVisionModel: async () => false, understandImages })
            },
            cacheManager: {
                get: async (key: string) => cache.get(key),
                set: async (key: string, value: { chunks: Document[] }) => cache.set(key, value)
            }
        })
        jest.spyOn(handler, 'splitDocuments').mockResolvedValue({ chunks })
        const run = () => handler.execute(new KnowledgeDocLoadCommand({ doc, mode: 'rechunk', stage: 'test' }))

        expect((await run()).chunks).toEqual(chunks)
        expect((await run()).chunks).toEqual(chunks)
        expect(understandImages).toHaveBeenCalledTimes(1)
        expect(cache.get(legacyKey)).toEqual({ chunks: [child] })
    })

    it('merges plugin image metadata without replacing host-owned snapshot references', async () => {
        const handler = new KnowledgeDocLoadHandler({} as any, {} as any, {} as any)
        const update = jest.fn()
        ;(handler as any).kbDocumentService = { update }
        const doc = {
            id: 'doc-1',
            metadata: {
                transformSnapshot: { sha256: 'host-transform' },
                analysisSnapshot: { sha256: 'host-analysis' },
                imageUnderstandingInvalidatedAt: '2026-08-30T00:00:00.000Z',
                retained: true
            }
        }

        await (handler as any).persistImageUnderstandingDocumentMetadata(doc, 'prod', {
            pluginImageUnderstanding: { strategy: 'plugin-image-policy', version: 1 },
            transformSnapshot: { sha256: 'plugin-transform' },
            analysisSnapshot: { sha256: 'plugin-analysis' }
        })

        expect(update).toHaveBeenCalledWith('doc-1', {
            metadata: {
                transformSnapshot: { sha256: 'host-transform' },
                analysisSnapshot: { sha256: 'host-analysis' },
                retained: true,
                pluginImageUnderstanding: { strategy: 'plugin-image-policy', version: 1 }
            }
        })
    })

    it('passes persisted document metadata into image reprocessing while keeping current assets authoritative', () => {
        const handler = new KnowledgeDocLoadHandler({} as any, {} as any, {} as any)
        const chunks = [new Document({ pageContent: 'manual retrieval text' }) as any]

        const result = (handler as any).createImageUnderstandingDocument(
            {
                id: 'doc-1',
                metadata: {
                    pluginImageUnderstanding: {
                        safety: { status: 'pass', confidence: 0.98 }
                    },
                    retained: 'persisted'
                }
            },
            {
                id: 'doc-1',
                metadata: {
                    assets: [{ type: 'image', filePath: 'images/current.png' }],
                    retained: 'transformed'
                }
            },
            chunks
        )

        expect(result.metadata).toEqual({
            pluginImageUnderstanding: {
                safety: { status: 'pass', confidence: 0.98 }
            },
            retained: 'transformed',
            assets: [{ type: 'image', filePath: 'images/current.png' }]
        })
        expect(result.chunks).toBe(chunks)
    })

    it('uses the default text splitter when parserConfig is null', async () => {
        const handler = new KnowledgeDocLoadHandler({} as any, {} as any, {} as any)
        const chunks = [
            new Document({
                pageContent: 'A short PDF page.',
                metadata: {
                    page: 1
                }
            }) as any
        ]
        const splitDocuments = jest.fn(async () => ({ chunks }))
        const textSplitterRegistry = {
            get: jest.fn(() => ({ splitDocuments }))
        }
        ;(handler as any).textSplitterRegistry = textSplitterRegistry

        const result = await handler.splitDocuments(
            {
                id: 'doc-1',
                parserConfig: null
            } as any,
            chunks
        )

        expect(textSplitterRegistry.get).toHaveBeenCalledWith('auto')
        expect(splitDocuments).toHaveBeenCalledWith(
            chunks,
            expect.objectContaining({
                chunkSize: 1000,
                chunkOverlap: 200,
                separators: undefined
            })
        )
        expect(result).toEqual({ chunks })
    })

    it('preserves Markdown line structure when whitespace replacement is enabled', async () => {
        const handler = new KnowledgeDocLoadHandler({} as any, {} as any, {} as any)
        const markdown = new Document({
            pageContent: '# Title\n\n| A | B |\n|---|---|',
            metadata: { chunkId: 'markdown-1', contentFormat: 'markdown' }
        }) as any
        const plainText = new Document({
            pageContent: 'Plain\n\ntext',
            metadata: { chunkId: 'text-1', contentFormat: 'text' }
        }) as any
        const splitDocuments = jest.fn(async (chunks) => ({ chunks }))
        ;(handler as any).textSplitterRegistry = { get: jest.fn(() => ({ splitDocuments })) }

        await handler.splitDocuments(
            {
                id: 'doc-1',
                type: 'txt',
                parserConfig: { replaceWhitespace: true }
            } as any,
            [markdown, plainText]
        )

        expect(markdown.pageContent).toBe('# Title\n\n| A | B |\n|---|---|')
        expect(plainText.pageContent).toBe('Plain text')
    })

    it('enables default VLM understanding for PDF, DOCX, and image documents', () => {
        expect(resolveKnowledgeDocumentParserConfig({ type: 'pdf' }).imageUnderstandingType).toBe('vlm-default')
        expect(resolveKnowledgeDocumentParserConfig({ type: 'docx' }).imageUnderstandingType).toBe('vlm-default')
        expect(
            resolveKnowledgeDocumentParserConfig({ type: 'png', category: KBDocumentCategoryEnum.Image })
                .imageUnderstandingType
        ).toBe('vlm-default')
    })

    it('falls back to text chunks and records a warning when image understanding cannot resolve a vision model', async () => {
        const transformedChunk = new Document({
            pageContent: 'Page text\n\n![Page 1](https://files.local/page-1.png)',
            metadata: {
                chunkId: 'page-1',
                chunkIndex: 0
            }
        }) as any
        const splitChunk = new Document({
            pageContent: 'Page text',
            metadata: {
                chunkId: 'split-1',
                chunkIndex: 0
            }
        }) as any
        const transformer = {
            permissions: [],
            transformDocuments: jest.fn(async () => [
                {
                    id: 'doc-1',
                    chunks: [transformedChunk],
                    metadata: {
                        assets: [
                            {
                                type: 'image',
                                url: 'https://files.local/page-1.png',
                                filePath: 'images/page-1.png',
                                sourceType: 'pdf_page',
                                page: 1,
                                order: 0
                            }
                        ]
                    }
                }
            ])
        }
        const commandBus = {
            execute: jest.fn(async () => ({ fileSystem: {} }))
        }
        const knowledgebaseService = {
            getVisionModel: jest.fn(async () => {
                throw new Error('Copilot model is not available for the current membership plan.')
            })
        }
        const kbDocumentService = {
            update: jest.fn()
        }
        const handler = new KnowledgeDocLoadHandler(knowledgebaseService as any, commandBus as any, {} as any)
        ;(handler as any).knowledgeWorkAreaResolver = {
            resolve: jest.fn(async () => ({
                volume: {},
                tmpPath: {
                    serverPath: '/tmp'
                }
            }))
        }
        ;(handler as any).transformerRegistry = {
            get: jest.fn(() => transformer)
        }
        ;(handler as any).imageUnderstandingRegistry = {
            get: jest.fn(() => ({ permissions: [], understandImages: jest.fn() }))
        }
        ;(handler as any).cacheManager = {
            get: jest.fn(async () => undefined),
            set: jest.fn()
        }
        ;(handler as any).kbDocumentService = kbDocumentService
        ;(handler as any).transformSnapshotService = {
            save: jest.fn(async () => ({
                schemaVersion: 1,
                filePath: '.knowledge/documents/doc-1/transforms/fingerprint/documents.ndjson',
                manifestPath: '.knowledge/documents/doc-1/transforms/fingerprint/manifest.json',
                sha256: 'snapshot-hash',
                size: 100,
                itemCount: 1,
                chunkCount: 1,
                transformFingerprint: 'fingerprint',
                transformer: { provider: 'pdf-visual', config: {} },
                createdAt: '2026-08-08T00:00:00.000Z'
            }))
        }
        ;(handler as any).analysisSnapshotService = { save: jest.fn(async () => undefined) }
        jest.spyOn(handler, 'splitDocuments').mockResolvedValue({ chunks: [splitChunk] })

        const result = await handler.execute(
            new KnowledgeDocLoadCommand({
                doc: {
                    id: 'doc-1',
                    name: 'manual.pdf',
                    type: 'pdf',
                    category: KBDocumentCategoryEnum.Text,
                    knowledgebaseId: 'kb-1',
                    filePath: 'manual.pdf',
                    status: KBDocumentStatusEnum.RUNNING
                } as any,
                stage: 'prod'
            })
        )

        expect(result.chunks).toEqual([splitChunk])
        expect(knowledgebaseService.getVisionModel).toHaveBeenCalledWith('kb-1', undefined)
        expect(kbDocumentService.update).toHaveBeenCalledWith(
            'doc-1',
            expect.objectContaining({
                metadata: expect.objectContaining({
                    imageUnderstandingWarnings: [
                        expect.objectContaining({
                            type: 'image_understanding_skipped',
                            assetCount: 1,
                            message: 'Copilot model is not available for the current membership plan.'
                        })
                    ]
                })
            })
        )
    })

    it('runs a deterministic image-understanding branch without resolving a vision model', async () => {
        const transformedChunk = new Document({
            pageContent: 'Original image',
            metadata: { chunkId: 'source-1', chunkIndex: 0 }
        }) as any
        const splitChunk = new Document({
            pageContent: 'Fallback text',
            metadata: { chunkId: 'split-1', chunkIndex: 0 }
        }) as any
        const understoodChunk = new Document({
            pageContent: 'Human-authored semantic retrieval text',
            metadata: { chunkId: 'understood-1', chunkIndex: 0 }
        }) as any
        const transformer = {
            permissions: [],
            transformDocuments: jest.fn(async () => [
                {
                    id: 'doc-1',
                    chunks: [transformedChunk],
                    metadata: {
                        assets: [{ type: 'image', filePath: 'images/source.png' }]
                    }
                }
            ])
        }
        const strategy = {
            permissions: [],
            requiresVisionModel: jest.fn(async () => false),
            understandImages: jest.fn(async (_document, config) => {
                expect(config.visionModel).toBeUndefined()
                return { chunks: [understoodChunk] }
            })
        }
        const knowledgebaseService = {
            getVisionModel: jest.fn(async () => {
                throw new Error('Vision model must not be resolved')
            })
        }
        const handler = new KnowledgeDocLoadHandler(
            knowledgebaseService as any,
            { execute: jest.fn(async () => ({ fileSystem: {} })) } as any,
            {} as any
        )
        ;(handler as any).knowledgeWorkAreaResolver = {
            resolve: jest.fn(async () => ({ volume: {}, tmpPath: { serverPath: '/tmp' } }))
        }
        ;(handler as any).transformerRegistry = { get: jest.fn(() => transformer) }
        ;(handler as any).imageUnderstandingRegistry = { get: jest.fn(() => strategy) }
        ;(handler as any).cacheManager = {
            get: jest.fn(async () => undefined),
            set: jest.fn()
        }
        jest.spyOn(handler, 'splitDocuments').mockResolvedValue({ chunks: [splitChunk] })

        const result = await handler.execute(
            new KnowledgeDocLoadCommand({
                doc: {
                    id: 'doc-1',
                    name: 'image.png',
                    type: 'png',
                    category: KBDocumentCategoryEnum.Image,
                    knowledgebaseId: 'kb-1',
                    filePath: 'image.png',
                    parserConfig: {
                        imageUnderstandingType: 'plugin-image-policy',
                        imageUnderstanding: { semanticSource: 'manual' }
                    },
                    status: KBDocumentStatusEnum.RUNNING
                } as any,
                stage: 'test'
            })
        )

        expect(result.chunks).toEqual([understoodChunk])
        expect(strategy.requiresVisionModel).toHaveBeenCalledWith(
            expect.objectContaining({ stage: 'test', semanticSource: 'manual' })
        )
        expect(strategy.understandImages).toHaveBeenCalledTimes(1)
        expect(knowledgebaseService.getVisionModel).not.toHaveBeenCalled()
    })

    it('loads a saved transform snapshot without resolving or calling the transformer in rechunk mode', async () => {
        const transformedChunk = new Document({
            pageContent: 'Saved conversion output',
            metadata: { chunkId: 'transformed-1', chunkIndex: 0 }
        })
        const splitChunk = new Document({
            pageContent: 'Re-chunked output',
            metadata: { chunkId: 'split-1', chunkIndex: 0 }
        })
        const snapshotLoad = jest.fn(async () => [
            {
                id: 'doc-1',
                chunks: [transformedChunk],
                metadata: {}
            }
        ])
        const handler = new KnowledgeDocLoadHandler(
            {} as unknown as KnowledgebaseService,
            {} as unknown as CommandBus,
            {} as unknown as QueryBus
        )
        Reflect.set(handler, 'knowledgeWorkAreaResolver', {
            resolve: jest.fn(async () => ({ volume: {}, tmpPath: { serverPath: '/tmp' } }))
        })
        Reflect.set(handler, 'transformSnapshotService', { load: snapshotLoad })
        const transformerRegistry = {
            get: jest.fn(() => {
                throw new Error('Transformer must not be resolved')
            })
        }
        Reflect.set(handler, 'transformerRegistry', transformerRegistry)
        Reflect.set(handler, 'kbDocumentService', { update: jest.fn() })
        Reflect.set(handler, 'cacheManager', {
            get: jest.fn(async () => undefined),
            set: jest.fn()
        })
        jest.spyOn(handler, 'splitDocuments').mockResolvedValue({ chunks: [splitChunk] })

        const result = await handler.execute(
            new KnowledgeDocLoadCommand({
                doc: {
                    id: 'doc-1',
                    name: 'manual.pdf',
                    type: 'pdf',
                    category: KBDocumentCategoryEnum.Text,
                    knowledgebaseId: 'kb-1',
                    filePath: 'manual.pdf',
                    parserConfig: {
                        transformerType: 'unlimited-ocr',
                        transformerIntegration: 'integration-1',
                        transformer: { preserveRawOutput: true },
                        imageUnderstandingType: null
                    },
                    metadata: {
                        transformSnapshot: { transformFingerprint: 'fingerprint' }
                    },
                    status: KBDocumentStatusEnum.RUNNING
                } as unknown as IKnowledgeDocument,
                stage: 'prod',
                mode: 'rechunk'
            })
        )

        expect(result.chunks).toEqual([splitChunk])
        expect(snapshotLoad).toHaveBeenCalledTimes(1)
        expect(transformerRegistry.get).not.toHaveBeenCalled()
    })
})

it('does not invoke image understanding when a PDF explicitly disables it', async () => {
    const getVisionModel = jest.fn()
    const understandImages = jest.fn()
    const chunk = new Document({
        pageContent: 'Text ![picture](https://files.local/image.png)',
        metadata: { chunkId: 'chunk' }
    })
    const handler = new KnowledgeDocLoadHandler(
        { getVisionModel } as unknown as KnowledgebaseService,
        { execute: jest.fn(async () => ({})) } as unknown as CommandBus,
        {} as QueryBus
    )
    Object.assign(handler, {
        knowledgeWorkAreaResolver: { resolve: jest.fn(async () => ({ volume: {}, tmpPath: { serverPath: '/tmp' } })) },
        transformerRegistry: {
            get: jest.fn(() => ({
                permissions: [],
                transformDocuments: async () => [
                    {
                        chunks: [chunk],
                        metadata: {
                            assets: [{ type: 'image', filePath: 'image.png', url: 'https://files.local/image.png' }]
                        }
                    }
                ]
            }))
        },
        imageUnderstandingRegistry: { get: jest.fn(() => ({ permissions: [], understandImages })) },
        cacheManager: { get: jest.fn(), set: jest.fn() },
        kbDocumentService: { update: jest.fn() }
    })
    jest.spyOn(handler, 'splitDocuments').mockResolvedValue({ chunks: [chunk] })
    const result = await handler.execute(
        new KnowledgeDocLoadCommand({
            doc: {
                id: 'doc',
                knowledgebaseId: 'kb',
                name: 'file.pdf',
                type: 'pdf',
                category: KBDocumentCategoryEnum.Text,
                filePath: 'file.pdf',
                parserConfig: { imageUnderstandingEnabled: false }
            } as IKnowledgeDocument,
            stage: 'test'
        })
    )
    expect(result.chunks).toEqual([chunk])
    expect(getVisionModel).not.toHaveBeenCalled()
    expect(understandImages).not.toHaveBeenCalled()
})
