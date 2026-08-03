import { GetFileUnderstandingStatusQuery } from '../get-file-understanding-status.query'
import { ValidateFileUnderstandingReferencesQuery } from '../validate-file-understanding-references.query'
import { GetFileUnderstandingStatusHandler } from './get-file-understanding-status.handler'
import { ValidateFileUnderstandingReferencesHandler } from './validate-file-understanding-references.handler'

const scope = {
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    projectId: 'project-1',
    xpertId: 'xpert-1'
}

describe('File Understanding runtime queries', () => {
    it('returns compact deep-understanding and vector readiness in the requested scope', async () => {
        const assetRepository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'file-1',
                status: 'ready',
                parseMode: 'deep',
                capabilities: ['preview', 'read', 'search'],
                parsedAt: new Date('2026-08-02T01:00:00.000Z'),
                metadata: {}
            })
        }
        const chunkRepository = { count: jest.fn().mockResolvedValue(12) }
        const embeddingRepository = { count: jest.fn().mockResolvedValue(12) }
        const handler = new GetFileUnderstandingStatusHandler(
            assetRepository as never,
            chunkRepository as never,
            embeddingRepository as never
        )

        const result = await handler.execute(new GetFileUnderstandingStatusQuery('file-1', scope))

        expect(assetRepository.findOne).toHaveBeenCalledWith({
            where: {
                id: 'file-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                projectId: 'project-1',
                xpertId: 'xpert-1'
            }
        })
        expect(result).toMatchObject({
            fileAssetId: 'file-1',
            parseMode: 'deep',
            chunkCount: 12,
            indexedChunkCount: 12,
            vectorIndexStatus: 'ready'
        })
        expect(result).not.toHaveProperty('content')
    })

    it('validates each chunk against its declared scoped FileAsset and bounds the excerpt', async () => {
        const assetRepository = {
            findOne: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => ({ id: where.id }))
        }
        const chunkRepository = {
            find: jest.fn().mockResolvedValue([
                {
                    id: 'chunk-1',
                    fileAssetId: 'file-1',
                    orderNo: 3,
                    anchor: { page: 2 },
                    content: '原文 '.repeat(500)
                }
            ])
        }
        const handler = new ValidateFileUnderstandingReferencesHandler(
            assetRepository as never,
            chunkRepository as never
        )

        const result = await handler.execute(
            new ValidateFileUnderstandingReferencesQuery([{ fileAssetId: 'file-1', chunkId: 'chunk-1' }], 120, scope)
        )

        expect(result[0]).toMatchObject({
            fileAssetId: 'file-1',
            chunkId: 'chunk-1',
            orderNo: 3,
            anchor: { page: 2 }
        })
        expect(result[0].excerpt.length).toBeLessThanOrEqual(121)

        await expect(
            handler.execute(
                new ValidateFileUnderstandingReferencesQuery(
                    [{ fileAssetId: 'file-2', chunkId: 'chunk-1' }],
                    120,
                    scope
                )
            )
        ).rejects.toThrow('not found in its declared FileAsset')
    })
})
