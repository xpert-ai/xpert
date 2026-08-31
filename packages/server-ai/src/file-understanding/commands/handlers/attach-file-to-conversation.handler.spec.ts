import { ConflictException, ForbiddenException } from '@nestjs/common'
import { AttachFileToConversationCommand } from '../attach-file-to-conversation.command'
import { AttachFileToConversationHandler } from './attach-file-to-conversation.handler'

describe('AttachFileToConversationHandler', () => {
    const asset = {
        id: 'asset-1',
        storageFileId: 'storage-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1'
    }
    const conversation = {
        id: 'conversation-1',
        threadId: 'thread-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        projectId: 'project-1',
        xpertId: 'xpert-previous'
    }

    function createHandler() {
        const repository = {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((value) => value),
            save: jest.fn(async (value) => value)
        }
        const projectionService = { projectFileAsset: jest.fn().mockResolvedValue(asset) }
        const fileAssetAccessService = {
            resolve: jest.fn().mockResolvedValue({ asset, conversation }),
            assertConversationInputScope: jest.fn(),
            assertCanLinkToConversation: jest.fn()
        }
        return {
            handler: new AttachFileToConversationHandler(
                repository as never,
                projectionService as never,
                fileAssetAccessService as never
            ),
            repository,
            projectionService,
            fileAssetAccessService
        }
    }

    it('persists only canonical FileAsset and conversation scope returned by the access resolver', async () => {
        const { handler, repository, projectionService, fileAssetAccessService } = createHandler()

        await handler.execute(
            new AttachFileToConversationCommand({
                fileAssetId: 'asset-1',
                storageFileId: 'storage-1',
                conversationId: 'conversation-1',
                threadId: 'thread-1',
                projectId: 'project-1',
                xpertId: 'xpert-current'
            })
        )

        expect(fileAssetAccessService.resolve).toHaveBeenCalledWith({
            locator: { fileAssetId: 'asset-1', storageFileId: 'storage-1' },
            authority: { kind: 'conversation', conversationId: 'conversation-1' },
            operation: 'attach'
        })
        expect(fileAssetAccessService.assertConversationInputScope).toHaveBeenCalledWith(
            conversation,
            expect.objectContaining({ xpertId: 'xpert-current' })
        )
        expect(fileAssetAccessService.assertCanLinkToConversation).toHaveBeenCalledWith(asset.id, conversation)
        expect(repository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                conversationId: 'conversation-1',
                fileAssetId: 'asset-1',
                storageFileId: 'storage-1',
                threadId: 'thread-1'
            })
        )
        expect(projectionService.projectFileAsset).toHaveBeenCalledWith(
            expect.objectContaining({
                fileAssetId: asset.id,
                storageFileId: asset.storageFileId,
                conversationId: 'conversation-1',
                projectId: 'project-1',
                xpertId: 'xpert-previous'
            })
        )
    })

    it('rejects client Project metadata that disagrees with the persisted conversation', async () => {
        const { handler, repository, fileAssetAccessService } = createHandler()
        fileAssetAccessService.assertConversationInputScope.mockRejectedValue(new ForbiddenException())

        await expect(
            handler.execute(
                new AttachFileToConversationCommand({
                    fileAssetId: 'asset-1',
                    conversationId: 'conversation-1',
                    projectId: 'foreign-project'
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(repository.save).not.toHaveBeenCalled()
    })

    it('rejects client Xpert metadata from another stable family', async () => {
        const { handler, repository, fileAssetAccessService } = createHandler()
        fileAssetAccessService.assertConversationInputScope.mockRejectedValue(new ForbiddenException())

        await expect(
            handler.execute(
                new AttachFileToConversationCommand({
                    fileAssetId: 'asset-1',
                    conversationId: 'conversation-1',
                    xpertId: 'xpert-other-family'
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(repository.save).not.toHaveBeenCalled()
    })

    it('does not create a link or project bytes when Project attach authorization is rejected', async () => {
        const { handler, repository, projectionService, fileAssetAccessService } = createHandler()
        fileAssetAccessService.resolve.mockRejectedValue(new ForbiddenException())

        await expect(
            handler.execute(
                new AttachFileToConversationCommand({
                    fileAssetId: 'asset-1',
                    conversationId: 'conversation-1',
                    projectId: 'project-1'
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(repository.findOne).not.toHaveBeenCalled()
        expect(repository.create).not.toHaveBeenCalled()
        expect(repository.save).not.toHaveBeenCalled()
        expect(projectionService.projectFileAsset).not.toHaveBeenCalled()
    })

    it('does not replace the first Project link or projection when cross-Project reuse conflicts', async () => {
        const { handler, repository, projectionService, fileAssetAccessService } = createHandler()
        const originalMetadata = {
            workspace: {
                catalog: 'projects',
                scopeId: 'project-1',
                relativePath: 'sessions/conversation-1/files/asset-1/report.docx'
            }
        }
        const projectedAsset = { ...asset, metadata: originalMetadata }
        fileAssetAccessService.resolve.mockResolvedValue({ asset: projectedAsset, conversation })
        fileAssetAccessService.assertCanLinkToConversation.mockRejectedValue(new ConflictException())

        await expect(
            handler.execute(
                new AttachFileToConversationCommand({
                    fileAssetId: 'asset-1',
                    conversationId: 'conversation-2',
                    projectId: 'project-2'
                })
            )
        ).rejects.toBeInstanceOf(ConflictException)

        expect(repository.findOne).not.toHaveBeenCalled()
        expect(repository.save).not.toHaveBeenCalled()
        expect(projectionService.projectFileAsset).not.toHaveBeenCalled()
        expect(projectedAsset.metadata).toEqual(originalMetadata)
    })
})
