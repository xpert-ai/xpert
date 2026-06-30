jest.mock('@xpert-ai/server-core', () => ({
    TenantOrganizationBaseEntity: class TenantOrganizationBaseEntity {},
    RequestContext: {
        currentTenantId: jest.fn(() => 'tenant-1'),
        getOrganizationId: jest.fn(() => 'organization-1'),
        currentUserId: jest.fn(() => 'user-1')
    }
}))

import { CreateFileAssetCommand } from '../create-file-asset.command'
import { CreateFileAssetHandler } from './create-file-asset.handler'

describe('CreateFileAssetHandler', () => {
    it('stores a storage file snapshot in metadata for message previews', async () => {
        const storageFile = {
            id: 'storage-file-1',
            file: 'contexts/tenant/files-1.png',
            url: 'https://files.example.com/files-1.png',
            fileUrl: 'https://files.example.com/file-url/files-1.png',
            thumbUrl: 'https://files.example.com/thumbs/files-1.png',
            originalName: 'wechat-image.png',
            size: 123,
            mimetype: 'image/png',
            storageProvider: 'LOCAL'
        }
        const savedFileAssets: any[] = []
        const savedLinks: any[] = []
        const fileAssetRepository = {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((entity) => entity),
            save: jest.fn(async (entity) => {
                const saved = {
                    id: 'file-asset-1',
                    ...entity
                }
                savedFileAssets.push(saved)
                return saved
            })
        }
        const conversationFileLinkRepository = {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((entity) => entity),
            save: jest.fn(async (entity) => {
                savedLinks.push(entity)
                return entity
            })
        }
        const handler = new CreateFileAssetHandler(fileAssetRepository as any, conversationFileLinkRepository as any)

        const result = await handler.execute(
            new CreateFileAssetCommand({
                storageFile,
                conversationId: 'conversation-1',
                threadId: 'thread-1',
                xpertId: 'xpert-1',
                purpose: 'chat_attachment',
                metadata: {
                    source: 'chat_request_data_url',
                    fileKey: 'wx-file-1'
                }
            })
        )

        expect(result.metadata).toMatchObject({
            source: 'chat_request_data_url',
            fileKey: 'wx-file-1',
            storageFile: {
                id: storageFile.id,
                file: storageFile.file,
                url: storageFile.url,
                fileUrl: storageFile.fileUrl,
                thumbUrl: storageFile.thumbUrl,
                originalName: storageFile.originalName,
                size: storageFile.size,
                mimetype: storageFile.mimetype,
                storageProvider: storageFile.storageProvider
            }
        })
        expect(savedFileAssets[0].metadata.storageFile.url).toBe(storageFile.url)
        expect(savedLinks[0].metadata.storageFile.thumbUrl).toBe(storageFile.thumbUrl)
    })
})
