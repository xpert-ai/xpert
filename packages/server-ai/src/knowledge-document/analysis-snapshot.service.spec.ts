import { Document } from '@langchain/core/documents'
import { IKnowledgeDocument, KnowledgeDocumentMetadata } from '@xpert-ai/contracts'
import { ChunkMetadata } from '@xpert-ai/plugin-sdk'
import { RequestContext } from '@xpert-ai/server-core'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { KnowledgeDocumentAnalysisSnapshotService } from './analysis-snapshot.service'

describe('KnowledgeDocumentAnalysisSnapshotService', () => {
    let rootPath: string
    let service: KnowledgeDocumentAnalysisSnapshotService

    beforeEach(async () => {
        rootPath = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-analysis-snapshot-'))
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        service = new KnowledgeDocumentAnalysisSnapshotService({
            resolve: jest.fn(async () => ({
                volume: {
                    path: (filePath: string) => path.join(rootPath, filePath)
                },
                statePath: { relativePath: '.knowledge' }
            }))
        })
    })

    afterEach(async () => {
        jest.restoreAllMocks()
        await fsPromises.rm(rootPath, { recursive: true, force: true })
    })

    it('writes page snapshots and reads one page without loading the others', async () => {
        const document = sourceDocument()
        const imagePath = 'baidu-ocr/doc-1/images/chart.png'
        await fsPromises.mkdir(path.dirname(path.join(rootPath, imagePath)), { recursive: true })
        await fsPromises.writeFile(path.join(rootPath, imagePath), 'image')
        const transformed = [
            {
                id: document.id,
                metadata: {
                    chunkId: 'document-1',
                    documentAnalysis: {
                        schemaVersion: 1,
                        provider: 'baidu-cloud',
                        engine: 'paddleocr-vl',
                        pageCount: 815,
                        coordinateSystem: 'page-top-left'
                    }
                },
                chunks: [
                    analysisChunk(1, 'title-1', 0, '# First page', 'title'),
                    analysisChunk(660, 'table-660', 1, '| A | B |', 'table', {
                        asset: { type: 'image', filePath: imagePath, url: 'https://assets.example/chart.png' },
                        raw: { position: [10, 20, 200, 100], table: { cells: 4 } }
                    })
                ]
            }
        ] as Partial<IKnowledgeDocument<ChunkMetadata>>[]
        const transformer = { provider: 'baidu-paddleocr-vl', integrationId: 'integration-1' }

        const reference = await service.save(document, transformed, transformer)
        if (!reference) throw new Error('Expected an analysis snapshot')
        const storedDocument = { ...document, metadata: { analysisSnapshot: reference } }

        await expect(service.getPreview(storedDocument)).resolves.toMatchObject({
            available: true,
            pageCount: 815,
            pages: [1, 660],
            views: ['markdown', 'structure', 'tables', 'json']
        })
        await expect(service.getPage(storedDocument, 660)).resolves.toMatchObject({
            page: 660,
            width: 1000,
            height: 1400,
            markdown: '| A | B |',
            blocks: [
                expect.objectContaining({
                    id: 'table-660',
                    type: 'table',
                    assetId: expect.any(String),
                    bounds: { x: 10, y: 20, width: 200, height: 100 }
                })
            ]
        })
        await expect(service.getRawPage(storedDocument, 660)).resolves.toEqual([
            expect.objectContaining({ blockId: 'table-660', data: expect.objectContaining({ table: { cells: 4 } }) })
        ])
        const page = await service.getPage(storedDocument, 660)
        const assetId = page.blocks[0].assetId
        if (!assetId) throw new Error('Expected a protected asset id')
        await expect(service.resolveAsset(storedDocument, assetId)).resolves.toMatchObject({
            absolutePath: path.join(rootPath, imagePath),
            mimeType: 'image/png'
        })
        await expect(service.resolveAsset(storedDocument, '../outside')).rejects.toMatchObject({ status: 404 })
    })

    it('materializes preview pages from a converter-owned analysis sidecar', async () => {
        const document = sourceDocument()
        const analysisPath = 'baidu-ocr/doc-1/paddleocr-vl/analysis-source.json'
        await fsPromises.mkdir(path.dirname(path.join(rootPath, analysisPath)), { recursive: true })
        await fsPromises.writeFile(
            path.join(rootPath, analysisPath),
            JSON.stringify({
                schemaVersion: 1,
                pages: [
                    {
                        schemaVersion: 1,
                        page: 1,
                        width: 1000,
                        height: 1400,
                        blocks: [
                            {
                                id: 'title-1',
                                order: 0,
                                type: 'title',
                                providerType: 'doc_title',
                                markdown: '# Contract',
                                bounds: { x: 10, y: 20, width: 300, height: 40 },
                                raw: { position: [10, 20, 300, 40] }
                            },
                            {
                                id: 'text-1',
                                order: 1,
                                type: 'text',
                                markdown: 'Body text',
                                bounds: { x: 10, y: 80, width: 600, height: 60 }
                            }
                        ]
                    }
                ]
            })
        )
        const transformed = [
            {
                id: document.id,
                metadata: {
                    chunkId: 'document-1',
                    documentAnalysis: {
                        schemaVersion: 1,
                        provider: 'baidu-cloud',
                        engine: 'paddleocr-vl',
                        pageCount: 1,
                        coordinateSystem: 'page-top-left',
                        analysisAsset: {
                            type: 'file',
                            filePath: analysisPath,
                            url: 'https://assets.example/analysis-source.json'
                        }
                    }
                },
                chunks: [
                    new Document<ChunkMetadata>({
                        pageContent: '# Contract\n\nBody text',
                        metadata: { chunkId: 'merged-1', contentFormat: 'markdown' }
                    })
                ]
            }
        ] as Partial<IKnowledgeDocument<ChunkMetadata>>[]

        const reference = await service.save(document, transformed, { provider: 'baidu-paddleocr-vl' })
        if (!reference) throw new Error('Expected an analysis snapshot')
        const storedDocument = { ...document, metadata: { analysisSnapshot: reference } }

        await expect(service.getPage(storedDocument, 1)).resolves.toMatchObject({
            page: 1,
            markdown: '# Contract\n\nBody text',
            blocks: [
                expect.objectContaining({ id: 'title-1', type: 'title' }),
                expect.objectContaining({ id: 'text-1', type: 'text' })
            ]
        })
        await expect(service.getRawPage(storedDocument, 1)).resolves.toEqual([
            expect.objectContaining({ blockId: 'title-1', data: { position: [10, 20, 300, 40] } }),
            expect.objectContaining({ blockId: 'text-1' })
        ])
    })

    it('reports stale or corrupt snapshots without exposing filesystem paths', async () => {
        const document = sourceDocument()
        const transformed = [
            {
                metadata: {
                    chunkId: 'document-1',
                    documentAnalysis: {
                        schemaVersion: 1,
                        provider: 'baidu-cloud',
                        engine: 'paddleocr-vl',
                        pageCount: 1,
                        coordinateSystem: 'page-top-left'
                    }
                },
                chunks: [analysisChunk(1, 'text-1', 0, 'Text', 'text')]
            }
        ] as Partial<IKnowledgeDocument<ChunkMetadata>>[]
        const reference = await service.save(document, transformed, { provider: 'baidu-paddleocr-vl' })
        if (!reference) throw new Error('Expected an analysis snapshot')

        await expect(
            service.getPreview({ ...document, sourceHash: 'changed', metadata: { analysisSnapshot: reference } })
        ).resolves.toEqual({ available: false, reason: 'stale' })

        await fsPromises.appendFile(path.join(rootPath, reference.manifestPath), '\n{}')
        await expect(service.getPreview({ ...document, metadata: { analysisSnapshot: reference } })).resolves.toEqual({
            available: false,
            reason: 'corrupt'
        })

        const tampered = {
            ...reference,
            manifestPath: '.knowledge/documents/doc-1/analyses/../../outside/manifest.json'
        }
        await expect(service.getPreview({ ...document, metadata: { analysisSnapshot: tampered } })).resolves.toEqual({
            available: false,
            reason: 'corrupt'
        })
    })
})

function analysisChunk(
    page: number,
    blockId: string,
    order: number,
    pageContent: string,
    type: 'text' | 'title' | 'table',
    extra: Partial<ChunkMetadata['documentLayout']> = {}
) {
    return new Document<ChunkMetadata>({
        pageContent,
        metadata: {
            chunkId: blockId,
            page,
            documentLayout: {
                schemaVersion: 1,
                page,
                pageWidth: 1000,
                pageHeight: 1400,
                blockId,
                order,
                type,
                bounds: { x: 10, y: 20, width: 200, height: 100 },
                ...extra
            }
        }
    })
}

function sourceDocument(): Partial<IKnowledgeDocument<KnowledgeDocumentMetadata>> & {
    id: string
    knowledgebaseId: string
} {
    return {
        id: 'doc-1',
        knowledgebaseId: 'kb-1',
        name: 'manual.pdf',
        type: 'pdf',
        mimeType: 'application/pdf',
        filePath: 'files/manual.pdf',
        sourceHash: 'source-hash',
        metadata: {}
    }
}
