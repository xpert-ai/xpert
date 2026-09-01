jest.mock('@xpert-ai/server-core', () => {
    const actual = jest.requireActual('@xpert-ai/server-core')
    return {
        ...actual,
        RequestContext: {
            currentTenantId: jest.fn(() => 'tenant-1'),
            getOrganizationId: jest.fn(() => 'organization-1'),
            currentUserId: jest.fn(() => 'user-1')
        }
    }
})

import { CreateFileAssetCommand } from '../create-file-asset.command'
import { CreateFileAssetHandler } from './create-file-asset.handler'
import { ConflictException, ForbiddenException } from '@nestjs/common'

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
        const fileAssetAccessService = {
            assertStorageFileOwner: jest.fn().mockResolvedValue(storageFile),
            assertConversationAccess: jest.fn().mockResolvedValue({
                id: 'conversation-1',
                threadId: 'thread-1',
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                projectId: null,
                xpertId: 'xpert-previous'
            }),
            assertConversationInputScope: jest.fn(),
            assertCanCreateConversationAsset: jest.fn(),
            assertUploadScope: jest.fn(),
            resolve: jest.fn()
        }
        const handler = new CreateFileAssetHandler(
            fileAssetRepository as never,
            conversationFileLinkRepository as never,
            fileAssetAccessService as never
        )

        const result = await handler.execute(
            new CreateFileAssetCommand({
                storageFile,
                conversationId: 'conversation-1',
                threadId: 'thread-1',
                xpertId: 'xpert-current',
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
        expect(savedFileAssets[0].xpertId).toBe('xpert-previous')
        expect(savedLinks[0].metadata.storageFile.thumbUrl).toBe(storageFile.thumbUrl)
        expect(fileAssetAccessService.assertConversationInputScope).toHaveBeenCalledWith(
            expect.objectContaining({ xpertId: 'xpert-previous' }),
            expect.objectContaining({ xpertId: 'xpert-current' })
        )
        expect(fileAssetAccessService.assertStorageFileOwner).toHaveBeenCalledWith(storageFile.id)
        expect(fileAssetRepository.findOne).toHaveBeenCalledWith({
            where: { storageFileId: storageFile.id, tenantId: 'tenant-1' }
        })
    })

    it('rejects a Project scope that the uploader cannot use before creating the FileAsset', async () => {
        const storageFile = {
            id: 'storage-file-1',
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            createdById: 'user-1'
        }
        const fileAssetRepository = {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn()
        }
        const conversationFileLinkRepository = {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn()
        }
        const fileAssetAccessService = {
            assertStorageFileOwner: jest.fn().mockResolvedValue(storageFile),
            assertConversationAccess: jest.fn(),
            assertConversationInputScope: jest.fn(),
            assertCanCreateConversationAsset: jest.fn(),
            assertUploadScope: jest.fn().mockRejectedValue(new Error('Project access denied')),
            resolve: jest.fn()
        }
        const handler = new CreateFileAssetHandler(
            fileAssetRepository as never,
            conversationFileLinkRepository as never,
            fileAssetAccessService as never
        )

        await expect(
            handler.execute(
                new CreateFileAssetCommand({
                    storageFileId: storageFile.id,
                    projectId: 'project-other',
                    purpose: 'chat_attachment'
                })
            )
        ).rejects.toThrow('Project access denied')

        expect(fileAssetAccessService.assertUploadScope).toHaveBeenCalledWith({
            projectId: 'project-other',
            xpertId: undefined
        })
        expect(fileAssetRepository.findOne).not.toHaveBeenCalled()
        expect(fileAssetRepository.save).not.toHaveBeenCalled()
    })

    it('rejects another principal user before saving or linking a user-isolated conversation asset', async () => {
        const storageFile = {
            id: 'storage-file-1',
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            createdById: 'user-1'
        }
        const fileAssetRepository = {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn()
        }
        const conversationFileLinkRepository = {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn()
        }
        const conversation = {
            id: 'conversation-1',
            threadId: 'thread-1',
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            createdById: 'user-2',
            projectId: null,
            xpertId: 'xpert-1',
            xpert: {
                id: 'xpert-1',
                workspaceDataScope: 'user'
            }
        }
        const fileAssetAccessService = {
            assertStorageFileOwner: jest.fn().mockResolvedValue(storageFile),
            assertConversationAccess: jest.fn().mockResolvedValue(conversation),
            assertConversationInputScope: jest.fn(),
            assertCanCreateConversationAsset: jest.fn(() => {
                throw new ForbiddenException()
            }),
            assertUploadScope: jest.fn(),
            resolve: jest.fn()
        }
        const handler = new CreateFileAssetHandler(
            fileAssetRepository as never,
            conversationFileLinkRepository as never,
            fileAssetAccessService as never
        )

        await expect(
            handler.execute(
                new CreateFileAssetCommand({
                    storageFileId: storageFile.id,
                    conversationId: conversation.id,
                    threadId: conversation.threadId,
                    xpertId: conversation.xpertId,
                    purpose: 'chat_attachment'
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(fileAssetAccessService.assertCanCreateConversationAsset).toHaveBeenCalledWith(conversation, 'upload')
        expect(fileAssetRepository.findOne).not.toHaveBeenCalled()
        expect(fileAssetRepository.save).not.toHaveBeenCalled()
        expect(conversationFileLinkRepository.save).not.toHaveBeenCalled()
    })

    it('rejects conversation Xpert context from another stable family before saving', async () => {
        const storageFile = { id: 'storage-file-1' }
        const conversation = {
            id: 'conversation-1',
            threadId: 'thread-1',
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            projectId: null,
            xpertId: 'xpert-previous'
        }
        const fileAssetRepository = {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn()
        }
        const conversationFileLinkRepository = {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn()
        }
        const fileAssetAccessService = {
            assertStorageFileOwner: jest.fn().mockResolvedValue(storageFile),
            assertConversationAccess: jest.fn().mockResolvedValue(conversation),
            assertConversationInputScope: jest.fn().mockRejectedValue(new ForbiddenException()),
            assertCanCreateConversationAsset: jest.fn(),
            assertUploadScope: jest.fn(),
            resolve: jest.fn()
        }
        const handler = new CreateFileAssetHandler(
            fileAssetRepository as never,
            conversationFileLinkRepository as never,
            fileAssetAccessService as never
        )

        await expect(
            handler.execute(
                new CreateFileAssetCommand({
                    storageFileId: storageFile.id,
                    conversationId: conversation.id,
                    xpertId: 'xpert-other-family'
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(fileAssetRepository.save).not.toHaveBeenCalled()
        expect(conversationFileLinkRepository.save).not.toHaveBeenCalled()
    })

    it('rejects reusing an existing FileAsset in another Project before mutating it or creating a link', async () => {
        const storageFile = { id: 'storage-file-1' }
        const existing = {
            id: 'file-asset-1',
            storageFileId: storageFile.id,
            projectId: 'project-1',
            metadata: {
                workspace: { catalog: 'projects', scopeId: 'project-1' }
            }
        }
        const conversation = {
            id: 'conversation-2',
            threadId: 'thread-2',
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            projectId: 'project-2',
            xpertId: 'xpert-1'
        }
        const fileAssetRepository = {
            findOne: jest.fn().mockResolvedValue(existing),
            create: jest.fn(),
            save: jest.fn()
        }
        const conversationFileLinkRepository = {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn()
        }
        const fileAssetAccessService = {
            assertStorageFileOwner: jest.fn().mockResolvedValue(storageFile),
            assertConversationAccess: jest.fn().mockResolvedValue(conversation),
            assertConversationInputScope: jest.fn(),
            assertCanCreateConversationAsset: jest.fn(),
            assertCanLinkToConversation: jest.fn().mockRejectedValue(new ConflictException()),
            assertUploadScope: jest.fn(),
            resolve: jest.fn().mockResolvedValue({ asset: existing })
        }
        const handler = new CreateFileAssetHandler(
            fileAssetRepository as never,
            conversationFileLinkRepository as never,
            fileAssetAccessService as never
        )

        await expect(
            handler.execute(
                new CreateFileAssetCommand({
                    storageFileId: storageFile.id,
                    conversationId: conversation.id,
                    projectId: conversation.projectId
                })
            )
        ).rejects.toBeInstanceOf(ConflictException)

        expect(fileAssetAccessService.assertCanLinkToConversation).toHaveBeenCalledWith(existing.id, conversation)
        expect(existing.metadata.workspace.scopeId).toBe('project-1')
        expect(fileAssetRepository.save).not.toHaveBeenCalled()
        expect(conversationFileLinkRepository.save).not.toHaveBeenCalled()
    })
})
