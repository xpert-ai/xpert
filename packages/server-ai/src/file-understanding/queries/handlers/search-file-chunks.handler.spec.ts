import { SearchFileChunksQuery } from '../search-file-chunks.query'
import { SearchFileChunksHandler } from './search-file-chunks.handler'

function createHandler(options?: {
    asset?: Record<string, unknown> | null
    vectorChunkIds?: string[]
    chunks?: Array<Record<string, unknown>>
}) {
    const fileAssetRepository = {
        findOne: jest.fn().mockResolvedValue(options?.asset ?? { id: 'file-1', tenantId: 'tenant-1' })
    }
    const repository = {
        find: jest.fn().mockResolvedValue(
            options?.chunks ?? [
                { id: 'chunk-1', fileAssetId: 'file-1', orderNo: 0, content: 'first' },
                { id: 'chunk-2', fileAssetId: 'file-1', orderNo: 1, content: 'second' }
            ]
        )
    }
    const fileVectorService = {
        searchChunkIds: jest.fn().mockResolvedValue(options?.vectorChunkIds ?? [])
    }
    const handler = Reflect.construct(SearchFileChunksHandler, [
        fileAssetRepository,
        repository,
        fileVectorService
    ]) as SearchFileChunksHandler
    return {
        handler,
        fileAssetRepository,
        repository,
        fileVectorService
    }
}

describe('SearchFileChunksHandler', () => {
    it('uses vector search first and preserves vector result ordering', async () => {
        const { handler, repository, fileVectorService } = createHandler({
            vectorChunkIds: ['chunk-2', 'chunk-1'],
            chunks: [
                { id: 'chunk-1', fileAssetId: 'file-1', orderNo: 0, content: 'first' },
                { id: 'chunk-2', fileAssetId: 'file-1', orderNo: 1, content: 'second' }
            ]
        })

        const result = await handler.execute(new SearchFileChunksQuery({ fileId: 'file-1', query: 'risk', limit: 2 }))

        expect(fileVectorService.searchChunkIds).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'file-1' }),
            'risk',
            2
        )
        expect(result.map((chunk) => chunk.id)).toEqual(['chunk-2', 'chunk-1'])
        expect(repository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    fileAssetId: 'file-1'
                })
            })
        )
    })

    it('falls back to text matching when vector search has no hydrated chunks', async () => {
        const { handler, repository } = createHandler({
            vectorChunkIds: ['missing-chunk'],
            chunks: []
        })
        repository.find
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ id: 'chunk-3', fileAssetId: 'file-1', orderNo: 2, content: 'risk text' }])

        const result = await handler.execute(new SearchFileChunksQuery({ fileId: 'file-1', query: 'risk', limit: 5 }))

        expect(result.map((chunk) => chunk.id)).toEqual(['chunk-3'])
        expect(repository.find).toHaveBeenCalledTimes(2)
        expect(repository.find.mock.calls[1][0]).toEqual(
            expect.objectContaining({
                where: expect.objectContaining({
                    fileAssetId: 'file-1',
                    content: expect.any(Object)
                }),
                order: { orderNo: 'ASC' },
                take: 5
            })
        )
    })

    it('keeps empty query behavior as orderNo preview reads', async () => {
        const { handler, fileAssetRepository, fileVectorService, repository } = createHandler()

        await handler.execute(new SearchFileChunksQuery({ fileId: 'file-1', limit: 3 }))

        expect(fileAssetRepository.findOne).not.toHaveBeenCalled()
        expect(fileVectorService.searchChunkIds).not.toHaveBeenCalled()
        expect(repository.find).toHaveBeenCalledWith({
            where: { fileAssetId: 'file-1' },
            order: { orderNo: 'ASC' },
            take: 3
        })
    })
})
