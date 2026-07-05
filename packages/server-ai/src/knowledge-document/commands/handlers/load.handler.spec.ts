import { Document } from '@langchain/core/documents'
import { KBDocumentCategoryEnum, KBDocumentStatusEnum } from '@xpert-ai/contracts'
import { KnowledgeDocLoadCommand } from '../load.command'
import { resolveKnowledgeDocumentParserConfig } from '../../parser-config'
import { KnowledgeDocLoadHandler } from './load.handler'

describe('KnowledgeDocLoadHandler', () => {
    afterEach(() => {
        jest.restoreAllMocks()
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

        expect(textSplitterRegistry.get).toHaveBeenCalledWith('recursive-character')
        expect(splitDocuments).toHaveBeenCalledWith(
            chunks,
            expect.objectContaining({
                chunkSize: 1000,
                chunkOverlap: 200,
                separators: '\\n\\n,\\n, ,'
            })
        )
        expect(result).toEqual({ chunks })
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
        ;(handler as any).cacheManager = {
            get: jest.fn(async () => undefined),
            set: jest.fn()
        }
        ;(handler as any).kbDocumentService = kbDocumentService
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
})
