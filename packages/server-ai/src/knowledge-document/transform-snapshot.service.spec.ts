import { Document } from '@langchain/core/documents'
import { IKnowledgeDocument, KnowledgeDocumentMetadata } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { ChunkMetadata } from '@xpert-ai/plugin-sdk'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
    KnowledgeDocumentTransformSnapshotService,
    TransformSnapshotUnavailableError
} from './transform-snapshot.service'

describe('KnowledgeDocumentTransformSnapshotService', () => {
    let rootPath: string
    let service: KnowledgeDocumentTransformSnapshotService

    beforeEach(async () => {
        rootPath = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'xpert-transform-snapshot-'))
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        service = new KnowledgeDocumentTransformSnapshotService({
            resolve: jest.fn(async () => ({
                volume: {
                    path: (filePath: string) => path.join(rootPath, filePath)
                },
                statePath: {
                    relativePath: '.knowledge'
                }
            }))
        })
    })

    afterEach(async () => {
        jest.restoreAllMocks()
        await fsPromises.rm(rootPath, { recursive: true, force: true })
    })

    it('round-trips normalized transformed documents with metadata and assets', async () => {
        const document = sourceDocument()
        const transformed = [
            {
                id: document.id,
                metadata: {
                    chunkId: 'document-metadata',
                    assets: [
                        {
                            type: 'file' as const,
                            filePath: 'unlimited-ocr/doc-1/result.md',
                            url: 'https://files.local/unlimited-ocr/doc-1/result.md'
                        }
                    ]
                },
                chunks: [
                    new Document<ChunkMetadata>({
                        pageContent: '# Parsed document',
                        metadata: {
                            chunkId: 'converted-1',
                            chunkIndex: 0,
                            page: 1,
                            unlimitedOcr: {
                                provider: 'baidu-cloud',
                                blockType: 'markdown'
                            }
                        }
                    })
                ]
            }
        ] satisfies Partial<IKnowledgeDocument<ChunkMetadata>>[]
        const transformer = {
            provider: 'unlimited-ocr',
            integrationId: 'integration-1',
            config: { preserveRawOutput: true }
        }

        const snapshot = await service.save(document, transformed, transformer)
        const loaded = await service.load(
            {
                ...document,
                metadata: { transformSnapshot: snapshot }
            },
            transformer
        )

        expect(snapshot).toMatchObject({ itemCount: 1, chunkCount: 1, size: expect.any(Number) })
        expect(loaded[0].chunks?.[0]).toMatchObject({
            pageContent: '# Parsed document',
            metadata: {
                chunkId: 'converted-1',
                page: 1,
                unlimitedOcr: {
                    provider: 'baidu-cloud',
                    blockType: 'markdown'
                }
            }
        })
        expect(loaded[0].metadata?.assets).toHaveLength(1)
    })

    it('rejects a snapshot after transformer settings change', async () => {
        const document = sourceDocument()
        const transformer = {
            provider: 'unlimited-ocr',
            integrationId: 'integration-1',
            config: { preserveRawOutput: true }
        }
        const snapshot = await service.save(document, [], transformer)

        await expect(
            service.load(
                { ...document, metadata: { transformSnapshot: snapshot } },
                { ...transformer, config: { preserveRawOutput: false } }
            )
        ).rejects.toMatchObject({ code: 'stale' })
    })

    it('rejects snapshot content that fails its integrity hash', async () => {
        const document = sourceDocument()
        const transformer = { provider: 'unlimited-ocr', integrationId: 'integration-1' }
        const snapshot = await service.save(document, [], transformer)
        await fsPromises.appendFile(path.join(rootPath, snapshot.filePath), 'tampered')

        await expect(
            service.load({ ...document, metadata: { transformSnapshot: snapshot } }, transformer)
        ).rejects.toBeInstanceOf(TransformSnapshotUnavailableError)
        await expect(
            service.inspect({ ...document, metadata: { transformSnapshot: snapshot } }, transformer)
        ).resolves.toMatchObject({ rechunk: { available: false, reason: 'corrupt' } })
    })
})

function sourceDocument(): Partial<IKnowledgeDocument<KnowledgeDocumentMetadata>> & {
    id: string
    knowledgebaseId: string
} {
    return {
        id: 'doc-1',
        knowledgebaseId: 'kb-1',
        name: 'manual.pdf',
        type: 'pdf',
        filePath: 'files/manual.pdf',
        sourceHash: 'source-hash',
        metadata: {}
    }
}
