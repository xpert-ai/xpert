import { IndexFileChunksCommand } from '../index-file-chunks.command'
import { IndexFileChunksHandler } from './index-file-chunks.handler'

describe('IndexFileChunksHandler', () => {
    it('rebuilds chunks and anchors through the unified index path', async () => {
        const asset = {
            id: 'file-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            xpertId: 'xpert-1'
        }
        const fileAssetRepository = {
            findOneByOrFail: jest.fn().mockResolvedValue(asset)
        }
        const fileArtifactRepository = {
            find: jest.fn().mockResolvedValue([
                {
                    id: 'artifact-1',
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    fileAssetId: 'file-1',
                    kind: 'page_text',
                    content: 'hello world',
                    anchor: { page: 1 },
                    metadata: { parser: 'pdf' }
                }
            ])
        }
        const fileChunkRepository = {
            delete: jest.fn().mockResolvedValue({ affected: 1 }),
            create: jest.fn((entity) => entity),
            save: jest.fn(async (chunks) =>
                chunks.map((chunk, index) => ({
                    id: `chunk-${index + 1}`,
                    ...chunk
                }))
            )
        }
        const fileCitationAnchorRepository = {
            delete: jest.fn().mockResolvedValue({ affected: 1 }),
            create: jest.fn((entity) => entity),
            save: jest.fn(async (anchors) => anchors)
        }
        const fileEmbeddingRepository = {
            delete: jest.fn().mockResolvedValue({ affected: 1 })
        }
        const fileVectorService = {
            deleteFileVectors: jest.fn().mockResolvedValue(undefined),
            indexChunks: jest.fn().mockResolvedValue([])
        }
        const handler = Reflect.construct(IndexFileChunksHandler, [
            fileAssetRepository,
            fileArtifactRepository,
            fileChunkRepository,
            fileCitationAnchorRepository,
            fileEmbeddingRepository,
            fileVectorService
        ]) as IndexFileChunksHandler

        const result = await handler.execute(new IndexFileChunksCommand('file-1'))

        expect(fileVectorService.deleteFileVectors).toHaveBeenCalledWith('file-1', asset)
        expect(fileEmbeddingRepository.delete).toHaveBeenCalledWith({ fileAssetId: 'file-1' })
        expect(fileChunkRepository.save).toHaveBeenCalledWith([
            expect.objectContaining({
                fileAssetId: 'file-1',
                artifactId: 'artifact-1',
                content: 'hello world',
                anchor: { page: 1, chunk: 0 }
            })
        ])
        expect(fileCitationAnchorRepository.save).toHaveBeenCalledWith([
            expect.objectContaining({
                fileAssetId: 'file-1',
                chunkId: 'chunk-1',
                anchorKey: 'page:1:chunk:0',
                label: 'Page 1'
            })
        ])
        expect(fileVectorService.indexChunks).toHaveBeenCalledWith(asset, result)
    })
})
