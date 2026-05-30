import { ListFilePageImagesQuery } from '../list-file-page-images.query'
import { ListFilePageImagesHandler } from './list-file-page-images.handler'

type MockArtifactRepository = {
    find: jest.Mock
}

function createHandler(artifactRepository: MockArtifactRepository): ListFilePageImagesHandler {
    return Reflect.construct(ListFilePageImagesHandler, [artifactRepository]) as ListFilePageImagesHandler
}

describe('ListFilePageImagesHandler', () => {
    it('returns safe page image file info with page filters', async () => {
        const artifactRepository = {
            find: jest.fn().mockResolvedValue([
                {
                    kind: 'page_image',
                    orderNo: 2,
                    mimeType: 'image/png',
                    anchor: { page: 1, path: 'page-0001.png' },
                    metadata: {
                        workspacePath: '/workspace/sessions/conversation-1/files/file-1/pages/page-0001.png',
                        fileName: 'page-0001.png'
                    }
                },
                {
                    kind: 'page_image',
                    orderNo: 4,
                    mimeType: 'image/png',
                    anchor: { page: 2, path: 'page-0002.png' },
                    metadata: {
                        storageKey: 'contexts/tenant-1/file-understanding/file-1/run-1/pages/page-0002.png',
                        workspacePath: '/workspace/sessions/conversation-1/files/file-1/pages/page-0002.png',
                        url: 'https://files.example/page-0002.png',
                        fileName: 'page-0002.png',
                        width: 800,
                        height: 1000,
                        size: 1234
                    }
                }
            ])
        }
        const handler = createHandler(artifactRepository)

        const result = await handler.execute(
            new ListFilePageImagesQuery('file-1', {
                pageStart: 2,
                pageEnd: 2,
                limit: 10
            })
        )

        expect(artifactRepository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    fileAssetId: 'file-1',
                    kind: 'page_image'
                },
                select: {
                    kind: true,
                    orderNo: true,
                    mimeType: true,
                    anchor: true,
                    metadata: true
                }
            })
        )
        expect(result).toEqual([
            {
                orderNo: 4,
                mimeType: 'image/png',
                anchor: { page: 2, path: 'page-0002.png' },
                file: {
                    workspacePath: '/workspace/sessions/conversation-1/files/file-1/pages/page-0002.png',
                    url: 'https://files.example/page-0002.png',
                    fileName: 'page-0002.png',
                    width: 800,
                    height: 1000,
                    size: 1234
                }
            }
        ])
        expect(JSON.stringify(result)).not.toContain('storageKey')
        expect(JSON.stringify(result)).not.toContain('contexts/tenant-1/file-understanding')
    })
})
