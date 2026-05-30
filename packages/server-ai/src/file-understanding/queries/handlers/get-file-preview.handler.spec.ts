import { GetFilePreviewQuery } from '../get-file-preview.query'
import { GetFilePreviewHandler } from './get-file-preview.handler'

type MockFileRepository = {
    findOne: jest.Mock
}

type MockArtifactRepository = {
    find: jest.Mock
}

type MockChunkRepository = {
    find: jest.Mock
}

function createHandler(
    fileRepository: MockFileRepository,
    artifactRepository: MockArtifactRepository,
    chunkRepository: MockChunkRepository
): GetFilePreviewHandler {
    return Reflect.construct(GetFilePreviewHandler, [
        fileRepository,
        artifactRepository,
        chunkRepository
    ]) as GetFilePreviewHandler
}

describe('GetFilePreviewHandler', () => {
    it('returns a compact preview without entity audit fields or artifact content', async () => {
        const fileRepository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'file-1',
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                storageFileId: 'storage-1',
                originalName: 'resume.pdf',
                mimeType: 'application/pdf',
                size: 123,
                status: 'ready',
                capabilities: ['preview', 'read', 'search'],
                workspacePath: '/workspace/sessions/conversation-1/files/file-1/resume.pdf',
                summary: 'A'.repeat(1200),
                metadata: {
                    parser: 'pdf',
                    chunkCount: 4,
                    source: '/private/source.pdf'
                }
            })
        }
        const artifactRepository = {
            find: jest.fn().mockResolvedValue([
                {
                    id: 'artifact-summary',
                    kind: 'summary',
                    orderNo: 0,
                    content: 'large summary content'
                },
                {
                    id: 'artifact-page-1',
                    kind: 'page_text',
                    orderNo: 1,
                    mimeType: 'text/plain',
                    content: 'FULL_PAGE_TEXT_SHOULD_NOT_RETURN',
                    metadata: {
                        source: '/private/source.pdf'
                    },
                    anchor: { page: 1 }
                }
            ])
        }
        const chunkRepository = {
            find: jest.fn().mockResolvedValue([
                {
                    id: 'chunk-1',
                    orderNo: 0,
                    content: 'FULL_CHUNK_TEXT_SHOULD_NOT_RETURN',
                    tokenCount: 200,
                    anchor: { page: 1, chunk: 0 }
                }
            ])
        }
        const handler = createHandler(fileRepository, artifactRepository, chunkRepository)

        const preview = await handler.execute(new GetFilePreviewQuery('file-1'))

        expect(fileRepository.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                select: expect.objectContaining({
                    summary: true,
                    metadata: true
                })
            })
        )
        expect(fileRepository.findOne.mock.calls[0][0].select).not.toHaveProperty('tenantId')
        expect(fileRepository.findOne.mock.calls[0][0].select).not.toHaveProperty('organizationId')
        expect(artifactRepository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                select: {
                    kind: true,
                    orderNo: true,
                    mimeType: true,
                    anchor: true,
                    metadata: true
                }
            })
        )
        expect(chunkRepository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                select: {
                    id: true,
                    orderNo: true,
                    anchor: true,
                    tokenCount: true
                }
            })
        )
        expect(preview).toEqual({
            file: expect.objectContaining({
                id: 'file-1',
                storageFileId: 'storage-1',
                originalName: 'resume.pdf',
                status: 'ready',
                summary: `${'A'.repeat(900)}...`,
                metadata: {
                    parser: 'pdf',
                    chunkCount: 4,
                    fileCount: undefined,
                    pdfPageImages: undefined
                }
            }),
            artifacts: [
                {
                    kind: 'page_text',
                    orderNo: 1,
                    mimeType: 'text/plain',
                    anchor: { page: 1 }
                }
            ],
            chunks: [
                {
                    chunkId: 'chunk-1',
                    orderNo: 0,
                    anchor: { page: 1, chunk: 0 },
                    tokenCount: 200
                }
            ]
        })
        expect(JSON.stringify(preview)).not.toContain('FULL_PAGE_TEXT_SHOULD_NOT_RETURN')
        expect(JSON.stringify(preview)).not.toContain('FULL_CHUNK_TEXT_SHOULD_NOT_RETURN')
        expect(JSON.stringify(preview)).not.toContain('tenant-1')
        expect(JSON.stringify(preview)).not.toContain('/private/source.pdf')
    })

    it('returns safe PDF page image file info without storage internals', async () => {
        const fileRepository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'file-1',
                storageFileId: 'storage-1',
                originalName: 'deck.pdf',
                mimeType: 'application/pdf',
                size: 456,
                status: 'ready',
                capabilities: ['preview', 'read', 'page_images', 'vision'],
                workspacePath: '/workspace/sessions/conversation-1/files/file-1/deck.pdf',
                summary: 'Deck summary',
                metadata: {
                    parser: 'pdf',
                    pdfPageImages: {
                        pageCount: 1,
                        renderedPageCount: 1,
                        truncated: false
                    }
                }
            })
        }
        const artifactRepository = {
            find: jest.fn().mockResolvedValue([
                {
                    kind: 'page_image',
                    orderNo: 2,
                    mimeType: 'image/png',
                    anchor: { page: 1, path: 'page-0001.png' },
                    metadata: {
                        storageKey: 'contexts/tenant-1/file-understanding/file-1/run-1/pages/page-0001.png',
                        serverPath: '/private/server/page-0001.png',
                        workspacePath: '/workspace/sessions/conversation-1/files/file-1/pages/page-0001.png',
                        url: 'https://files.example/page-0001.png',
                        fileName: 'page-0001.png',
                        width: 800,
                        height: 1000,
                        size: 1234
                    }
                }
            ])
        }
        const chunkRepository = {
            find: jest.fn().mockResolvedValue([])
        }
        const handler = createHandler(fileRepository, artifactRepository, chunkRepository)

        const preview = await handler.execute(new GetFilePreviewQuery('file-1'))

        expect(preview?.artifacts).toEqual([
            {
                kind: 'page_image',
                orderNo: 2,
                mimeType: 'image/png',
                anchor: { page: 1, path: 'page-0001.png' },
                file: {
                    workspacePath: '/workspace/sessions/conversation-1/files/file-1/pages/page-0001.png',
                    url: 'https://files.example/page-0001.png',
                    fileName: 'page-0001.png',
                    width: 800,
                    height: 1000,
                    size: 1234
                }
            }
        ])
        expect(JSON.stringify(preview)).not.toContain('storageKey')
        expect(JSON.stringify(preview)).not.toContain('contexts/tenant-1/file-understanding')
        expect(JSON.stringify(preview)).not.toContain('/private/server/page-0001.png')
    })
})
