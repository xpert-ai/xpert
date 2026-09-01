jest.mock('@xpert-ai/server-core', () => {
    const actual = jest.requireActual('@xpert-ai/server-core')
    return {
        ...actual,
        RequestContext: {
            currentTenantId: jest.fn(),
            currentUserId: jest.fn(),
            getOrganizationId: jest.fn()
        }
    }
})

import { RequestContext } from '@xpert-ai/server-core'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { FileAssetAccessService } from './file-asset-access.service'

describe('FileAssetAccessService', () => {
    const fileAssetRepository = { findOne: jest.fn() }
    const conversationFileLinkRepository = { find: jest.fn(), findOne: jest.fn() }
    const storageFileService = { findOneInOrganizationOrTenant: jest.fn() }
    const conversationService = { assertAccess: jest.fn(), findAll: jest.fn(), findOneByThreadId: jest.fn() }
    const projectAccessService = {
        assertCanRead: jest.fn(),
        assertCanUse: jest.fn(),
        assertCanEdit: jest.fn(),
        assertCanUseXpert: jest.fn()
    }
    const publishedXpertAccessService = {
        getAccessiblePublishedXpertFamilyIds: jest.fn(),
        getAccessiblePublishedXpert: jest.fn(),
        getPublishedXpertInTenant: jest.fn(),
        isPublishedXpertInFamily: jest.fn()
    }
    const service = new FileAssetAccessService(
        fileAssetRepository as never,
        conversationFileLinkRepository as never,
        storageFileService as never,
        conversationService as never,
        projectAccessService as never,
        publishedXpertAccessService as never
    )
    const conversation = {
        id: 'conversation-1',
        threadId: 'thread-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        createdById: 'user-1',
        xpertId: 'xpert-current',
        projectId: null
    }
    const ownedAsset = {
        id: 'asset-1',
        storageFileId: 'storage-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        createdById: 'user-1'
    }
    const ownedStorageFile = {
        id: 'storage-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        createdById: 'user-1',
        file: 'uploads/storage-1.png',
        storageProvider: 'LOCAL'
    }

    beforeEach(() => {
        jest.clearAllMocks()
        jest.mocked(RequestContext.currentTenantId).mockReturnValue('tenant-1')
        jest.mocked(RequestContext.currentUserId).mockReturnValue('user-1')
        jest.mocked(RequestContext.getOrganizationId).mockReturnValue('org-1')
        fileAssetRepository.findOne.mockResolvedValue(ownedAsset)
        storageFileService.findOneInOrganizationOrTenant.mockResolvedValue(ownedStorageFile)
        conversationFileLinkRepository.findOne.mockResolvedValue(null)
        conversationFileLinkRepository.find.mockResolvedValue([])
        conversationService.assertAccess.mockResolvedValue(conversation)
        conversationService.findAll.mockResolvedValue({ items: [] })
        conversationService.findOneByThreadId.mockResolvedValue(conversation)
        projectAccessService.assertCanRead.mockResolvedValue({})
        projectAccessService.assertCanUse.mockResolvedValue({})
        projectAccessService.assertCanEdit.mockResolvedValue({})
        projectAccessService.assertCanUseXpert.mockResolvedValue({})
        publishedXpertAccessService.getAccessiblePublishedXpertFamilyIds.mockResolvedValue(['xpert-current'])
        publishedXpertAccessService.getAccessiblePublishedXpert.mockResolvedValue({
            id: 'xpert-current',
            workspaceDataScope: 'shared'
        })
        publishedXpertAccessService.getPublishedXpertInTenant.mockResolvedValue({
            id: 'xpert-current',
            workspaceDataScope: 'shared'
        })
        publishedXpertAccessService.isPublishedXpertInFamily.mockResolvedValue(false)
    })

    it('limits the first lookup to the current tenant', async () => {
        fileAssetRepository.findOne.mockResolvedValue(null)

        await expect(
            service.resolve({
                locator: { fileAssetId: 'foreign-asset' },
                authority: { kind: 'current-owner' },
                operation: 'read'
            })
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(fileAssetRepository.findOne).toHaveBeenCalledWith({
            where: { id: 'foreign-asset', tenantId: 'tenant-1' }
        })
    })

    it('returns the centrally validated StorageFile for a managed FileAsset', async () => {
        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'current-owner' },
                operation: 'read'
            })
        ).resolves.toMatchObject({
            asset: { id: 'asset-1' },
            storageFile: { id: 'storage-1' }
        })

        expect(storageFileService.findOneInOrganizationOrTenant).toHaveBeenCalledWith('storage-1')
    })

    it.each([
        ['tenant', { ...ownedStorageFile, tenantId: 'tenant-2' }],
        ['organization', { ...ownedStorageFile, organizationId: 'org-2' }]
    ])('rejects a StorageFile from a different %s', async (_scope, storageFile) => {
        storageFileService.findOneInOrganizationOrTenant.mockResolvedValue(storageFile)

        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'current-owner' },
                operation: 'read'
            })
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('allows a workspace-only FileAsset without a StorageFile', async () => {
        fileAssetRepository.findOne.mockResolvedValue({ ...ownedAsset, storageFileId: null })

        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'current-owner' },
                operation: 'read'
            })
        ).resolves.toMatchObject({ asset: { id: 'asset-1' } })

        expect(storageFileService.findOneInOrganizationOrTenant).not.toHaveBeenCalled()
    })

    it('rejects a non-Project asset owned by another user', async () => {
        fileAssetRepository.findOne.mockResolvedValue({ ...ownedAsset, userId: 'user-2', createdById: 'user-2' })

        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'current-owner' },
                operation: 'read'
            })
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it("allows a Project editor to attach another member's Project file", async () => {
        fileAssetRepository.findOne.mockResolvedValue({
            ...ownedAsset,
            userId: 'user-2',
            projectId: 'project-1'
        })
        conversationService.assertAccess.mockResolvedValue({ ...conversation, projectId: 'project-1' })

        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1', storageFileId: 'storage-1' },
                authority: { kind: 'conversation', conversationId: 'conversation-1' },
                operation: 'attach'
            })
        ).resolves.toMatchObject({ asset: { id: 'asset-1' }, conversation: { id: 'conversation-1' } })

        expect(projectAccessService.assertCanEdit).toHaveBeenCalledWith('project-1')
        expect(projectAccessService.assertCanUse).not.toHaveBeenCalled()
    })

    it('rejects a read-only Project member before an attachment link or projection can be created', async () => {
        fileAssetRepository.findOne.mockResolvedValue({
            ...ownedAsset,
            userId: 'user-2',
            projectId: 'project-1'
        })
        conversationService.assertAccess.mockResolvedValue({ ...conversation, projectId: 'project-1' })
        conversationFileLinkRepository.findOne.mockResolvedValue({
            conversationId: 'conversation-1',
            fileAssetId: 'asset-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
        projectAccessService.assertCanEdit.mockRejectedValueOnce(new ForbiddenException())

        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1', storageFileId: 'storage-1' },
                authority: { kind: 'conversation', conversationId: 'conversation-1' },
                operation: 'attach'
            })
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(projectAccessService.assertCanEdit).toHaveBeenCalledWith('project-1')
        expect(conversationFileLinkRepository.findOne).not.toHaveBeenCalled()
    })

    it('keeps parsing an existing Project file available to read-only members', async () => {
        fileAssetRepository.findOne.mockResolvedValue({
            ...ownedAsset,
            userId: 'user-2',
            projectId: 'project-1'
        })

        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'current-owner' },
                operation: 'parse'
            })
        ).resolves.toMatchObject({ asset: { id: 'asset-1' } })

        expect(projectAccessService.assertCanUse).toHaveBeenCalledWith('project-1')
        expect(projectAccessService.assertCanEdit).not.toHaveBeenCalled()
    })

    it('rejects linking one FileAsset to a different Project without changing its first projection', async () => {
        const projectedAsset = {
            ...ownedAsset,
            metadata: {
                workspace: {
                    catalog: 'projects',
                    scopeId: 'project-1',
                    relativePath: 'sessions/conversation-1/files/asset-1/report.docx'
                }
            }
        }
        fileAssetRepository.findOne.mockResolvedValue(projectedAsset)
        conversationFileLinkRepository.find.mockResolvedValue([
            {
                conversationId: 'conversation-1',
                fileAssetId: 'asset-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            }
        ])
        conversationService.findAll.mockResolvedValue({
            items: [{ id: 'conversation-1', projectId: 'project-1' }]
        })

        await expect(
            service.assertCanLinkToConversation('asset-1', {
                ...conversation,
                id: 'conversation-2',
                projectId: 'project-2'
            } as never)
        ).rejects.toBeInstanceOf(ConflictException)

        expect(projectedAsset.metadata.workspace).toEqual({
            catalog: 'projects',
            scopeId: 'project-1',
            relativePath: 'sessions/conversation-1/files/asset-1/report.docx'
        })

        conversationService.assertAccess.mockResolvedValue({ ...conversation, projectId: 'project-1' })
        conversationFileLinkRepository.findOne.mockResolvedValue({
            conversationId: 'conversation-1',
            fileAssetId: 'asset-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'conversation', conversationId: 'conversation-1' },
                operation: 'read'
            })
        ).resolves.toMatchObject({
            asset: {
                metadata: {
                    workspace: {
                        catalog: 'projects',
                        scopeId: 'project-1'
                    }
                }
            },
            link: { conversationId: 'conversation-1' }
        })
    })

    it('allows one FileAsset to be linked by multiple conversations in the same Project', async () => {
        conversationFileLinkRepository.find.mockResolvedValue([
            {
                conversationId: 'conversation-1',
                fileAssetId: 'asset-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            }
        ])
        conversationService.findAll.mockResolvedValue({
            items: [{ id: 'conversation-1', projectId: 'project-1' }]
        })

        await expect(
            service.assertCanLinkToConversation('asset-1', {
                ...conversation,
                id: 'conversation-2',
                projectId: 'project-1'
            } as never)
        ).resolves.toBeUndefined()
    })

    it('uses an authorized conversation link instead of the mutable asset conversationId', async () => {
        fileAssetRepository.findOne.mockResolvedValue({
            ...ownedAsset,
            userId: 'user-2',
            createdById: 'user-2',
            conversationId: 'forged-conversation'
        })
        conversationFileLinkRepository.findOne.mockResolvedValue({
            conversationId: 'conversation-1',
            fileAssetId: 'asset-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })

        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'conversation', threadId: 'thread-1' },
                operation: 'read'
            })
        ).resolves.toMatchObject({ link: { conversationId: 'conversation-1' } })
        expect(conversationService.assertAccess).toHaveBeenCalledWith('conversation-1', 'read')
    })

    it('does not let an existing link bypass a user-isolated conversation owner', async () => {
        fileAssetRepository.findOne.mockResolvedValue({
            ...ownedAsset,
            userId: 'user-1',
            createdById: 'user-1'
        })
        conversationService.assertAccess.mockResolvedValue({
            ...conversation,
            createdById: 'user-2',
            xpert: {
                id: 'xpert-current',
                workspaceDataScope: 'user'
            }
        })
        conversationFileLinkRepository.findOne.mockResolvedValue({
            conversationId: 'conversation-1',
            fileAssetId: 'asset-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })

        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'conversation', conversationId: 'conversation-1' },
                operation: 'read'
            })
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(conversationFileLinkRepository.findOne).not.toHaveBeenCalled()
    })

    it("does not let an Xpert owner read the principal user's user-isolated conversation asset", async () => {
        jest.mocked(RequestContext.currentUserId).mockReturnValue('xpert-owner')
        fileAssetRepository.findOne.mockResolvedValue({
            ...ownedAsset,
            userId: 'principal-user',
            createdById: 'principal-user'
        })
        conversationService.assertAccess.mockResolvedValue({
            ...conversation,
            createdById: 'principal-user',
            xpert: {
                id: 'xpert-current',
                createdById: 'xpert-owner',
                userId: 'principal-user',
                workspaceDataScope: 'user'
            }
        })
        conversationFileLinkRepository.findOne.mockResolvedValue({
            conversationId: 'conversation-1',
            fileAssetId: 'asset-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })

        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'conversation', conversationId: 'conversation-1' },
                operation: 'read'
            })
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(conversationFileLinkRepository.findOne).not.toHaveBeenCalled()
    })

    it('does not accept a forged conversationId without an authorized link or owner scope', async () => {
        fileAssetRepository.findOne.mockResolvedValue({
            ...ownedAsset,
            userId: 'user-2',
            createdById: 'user-2',
            conversationId: 'conversation-1'
        })

        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'conversation', conversationId: 'conversation-1' },
                operation: 'attach'
            })
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('rejects a FileAsset and StorageFile id pair that does not match', async () => {
        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1', storageFileId: 'storage-2' },
                authority: { kind: 'current-owner' },
                operation: 'read'
            })
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('does not let an uploader move a Project-scoped file into another Project', async () => {
        fileAssetRepository.findOne.mockResolvedValue({ ...ownedAsset, projectId: 'project-1' })
        conversationService.assertAccess.mockResolvedValue({ ...conversation, projectId: 'project-2' })

        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'conversation', conversationId: 'conversation-1' },
                operation: 'attach'
            })
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it("does not let a Project member attach another user's unlinked personal Xpert file", async () => {
        jest.mocked(RequestContext.currentUserId).mockReturnValue('user-2')
        fileAssetRepository.findOne.mockResolvedValue({
            ...ownedAsset,
            userId: 'user-1',
            createdById: 'user-1',
            xpertId: 'xpert-current',
            metadata: {
                workspace: {
                    catalog: 'user-xperts',
                    scopeId: 'xpert-current',
                    relativePath: 'private/report.docx'
                }
            }
        })
        conversationService.assertAccess.mockResolvedValue({
            ...conversation,
            projectId: 'project-1',
            xpertId: 'xpert-current'
        })

        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'conversation', conversationId: 'conversation-1' },
                operation: 'attach'
            })
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('shares a personal Xpert file with Project members only after its owner creates a conversation link', async () => {
        fileAssetRepository.findOne.mockResolvedValue({
            ...ownedAsset,
            xpertId: 'xpert-current',
            metadata: {
                workspace: {
                    catalog: 'projects',
                    scopeId: 'project-1',
                    relativePath: 'sessions/conversation-1/files/asset-1/report.docx'
                }
            }
        })
        publishedXpertAccessService.getPublishedXpertInTenant.mockResolvedValue({
            id: 'xpert-current',
            workspaceDataScope: 'user'
        })
        conversationService.assertAccess.mockResolvedValue({
            ...conversation,
            projectId: 'project-1',
            xpertId: 'xpert-current'
        })

        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'conversation', conversationId: 'conversation-1' },
                operation: 'attach'
            })
        ).resolves.toMatchObject({ asset: { id: 'asset-1' } })

        jest.mocked(RequestContext.currentUserId).mockReturnValue('user-2')
        conversationFileLinkRepository.findOne.mockResolvedValue({
            conversationId: 'conversation-1',
            fileAssetId: 'asset-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'conversation', conversationId: 'conversation-1' },
                operation: 'read'
            })
        ).resolves.toMatchObject({
            asset: { id: 'asset-1' },
            link: { conversationId: 'conversation-1' }
        })
    })

    it('does not let a Project projection grant the same personal Xpert asset to a different Project', async () => {
        jest.mocked(RequestContext.currentUserId).mockReturnValue('user-2')
        fileAssetRepository.findOne.mockResolvedValue({
            ...ownedAsset,
            userId: 'user-1',
            createdById: 'user-1',
            conversationId: 'conversation-project-1',
            xpertId: 'xpert-current',
            metadata: {
                workspace: {
                    catalog: 'projects',
                    scopeId: 'project-1',
                    relativePath: 'sessions/conversation-project-1/files/asset-1/report.docx'
                }
            }
        })
        publishedXpertAccessService.getPublishedXpertInTenant.mockResolvedValue({
            id: 'xpert-current',
            workspaceDataScope: 'user'
        })
        conversationService.assertAccess.mockResolvedValue({
            ...conversation,
            id: 'conversation-project-2',
            projectId: 'project-2',
            xpertId: 'xpert-current'
        })
        conversationFileLinkRepository.findOne.mockResolvedValue(null)

        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'conversation', conversationId: 'conversation-project-2' },
                operation: 'read'
            })
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(conversationFileLinkRepository.findOne).toHaveBeenCalledWith({
            where: expect.objectContaining({ conversationId: 'conversation-project-2', fileAssetId: 'asset-1' })
        })
    })

    it('does not let a non-owner reparse a shared Xpert file', async () => {
        fileAssetRepository.findOne.mockResolvedValue({
            ...ownedAsset,
            userId: 'user-2',
            createdById: 'user-2',
            xpertId: 'xpert-current'
        })

        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'current-owner' },
                operation: 'parse'
            })
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it("does not expose another user's user-isolated Xpert asset through the same published family", async () => {
        fileAssetRepository.findOne.mockResolvedValue({
            ...ownedAsset,
            userId: 'user-2',
            createdById: 'user-2',
            xpertId: 'xpert-previous'
        })
        conversationService.assertAccess.mockResolvedValue({
            ...conversation,
            xpert: {
                id: 'xpert-current',
                workspaceDataScope: 'user'
            }
        })
        publishedXpertAccessService.isPublishedXpertInFamily.mockResolvedValue(true)

        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'conversation', conversationId: 'conversation-1' },
                operation: 'read'
            })
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it("does not expose another user's user-isolated Xpert asset through current-owner family access", async () => {
        fileAssetRepository.findOne.mockResolvedValue({
            ...ownedAsset,
            userId: 'user-2',
            createdById: 'user-2',
            xpertId: 'xpert-current'
        })
        publishedXpertAccessService.getAccessiblePublishedXpert.mockResolvedValue({
            id: 'xpert-current',
            workspaceDataScope: 'user'
        })

        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'current-owner' },
                operation: 'read'
            })
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('keeps shared Xpert family assets available to an authorized user', async () => {
        fileAssetRepository.findOne.mockResolvedValue({
            ...ownedAsset,
            userId: 'user-2',
            createdById: 'user-2',
            xpertId: 'xpert-current'
        })

        await expect(
            service.resolve({
                locator: { fileAssetId: 'asset-1' },
                authority: { kind: 'current-owner' },
                operation: 'read'
            })
        ).resolves.toMatchObject({ asset: { id: 'asset-1' } })
    })

    it('requires Project edit access and the stable Xpert binding before an upload', async () => {
        await service.assertUploadScope({ projectId: 'project-1', xpertId: 'xpert-current' })

        expect(projectAccessService.assertCanEdit).toHaveBeenCalledWith('project-1')
        expect(projectAccessService.assertCanUseXpert).toHaveBeenCalledWith('project-1', 'xpert-current')
    })

    it('keeps Project file understanding available to a read-only member', async () => {
        await service.assertUnderstandingScope({ projectId: 'project-1', xpertId: 'xpert-current' })

        expect(projectAccessService.assertCanUseXpert).toHaveBeenCalledWith('project-1', 'xpert-current')
        expect(projectAccessService.assertCanEdit).not.toHaveBeenCalled()
    })

    it('accepts current Xpert context for a conversation persisted on an older published family version', async () => {
        const historicalConversation = {
            ...conversation,
            xpertId: 'xpert-previous',
            xpert: {
                id: 'xpert-previous',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: 'workspace-1',
                type: 'agent',
                slug: 'assistant'
            }
        }
        publishedXpertAccessService.isPublishedXpertInFamily.mockResolvedValue(true)

        await expect(
            service.assertConversationInputScope(historicalConversation as never, {
                conversationId: conversation.id,
                xpertId: 'xpert-current'
            })
        ).resolves.toBeUndefined()

        expect(publishedXpertAccessService.isPublishedXpertInFamily).toHaveBeenCalledWith(
            'xpert-current',
            historicalConversation.xpert
        )
    })

    it('rejects Xpert context from another family for an authorized conversation', async () => {
        const historicalConversation = {
            ...conversation,
            xpertId: 'xpert-previous',
            xpert: {
                id: 'xpert-previous',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: 'workspace-1',
                type: 'agent',
                slug: 'assistant'
            }
        }
        publishedXpertAccessService.isPublishedXpertInFamily.mockResolvedValue(false)

        await expect(
            service.assertConversationInputScope(historicalConversation as never, {
                conversationId: conversation.id,
                xpertId: 'xpert-other-family'
            })
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it("rejects creating an asset in another principal user's user-isolated conversation", async () => {
        await expect(
            service.assertCanCreateConversationAsset({
                ...conversation,
                createdById: 'user-2',
                xpert: {
                    id: 'xpert-current',
                    workspaceDataScope: 'user'
                }
            } as never)
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('rejects a read-only Project member before uploading conversation bytes', async () => {
        projectAccessService.assertCanEdit.mockRejectedValueOnce(new ForbiddenException())

        await expect(
            service.assertCanCreateConversationAsset(
                {
                    ...conversation,
                    createdById: 'user-2',
                    projectId: 'project-1',
                    xpert: {
                        id: 'xpert-current',
                        workspaceDataScope: 'user'
                    }
                } as never,
                'upload'
            )
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(projectAccessService.assertCanEdit).toHaveBeenCalledWith('project-1')
    })

    it('allows a Project member to register an existing shared file for understanding', async () => {
        await expect(
            service.assertCanCreateConversationAsset(
                {
                    ...conversation,
                    createdById: 'user-2',
                    projectId: 'project-1',
                    xpert: {
                        id: 'xpert-current',
                        workspaceDataScope: 'user'
                    }
                } as never,
                'understand'
            )
        ).resolves.toBeUndefined()
        expect(projectAccessService.assertCanEdit).not.toHaveBeenCalled()
    })

    it('allows an editor to upload a conversation file into the Project scope', async () => {
        await expect(
            service.assertCanCreateConversationAsset({
                ...conversation,
                createdById: 'user-2',
                projectId: 'project-1',
                xpert: {
                    id: 'xpert-current',
                    workspaceDataScope: 'user'
                }
            } as never)
        ).resolves.toBeUndefined()
        expect(projectAccessService.assertCanEdit).toHaveBeenCalledWith('project-1')
    })
})
