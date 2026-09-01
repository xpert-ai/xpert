import { ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/server-core'
import fsPromises from 'node:fs/promises'
import { CreateWorkspaceFileAssetCommand } from '../create-workspace-file-asset.command'
import { CreateWorkspaceFileAssetHandler } from './create-workspace-file-asset.handler'

describe('CreateWorkspaceFileAssetHandler authorization', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('rejects a client-provided tenant or user scope before resolving a workspace path', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const volumeClient = { resolve: jest.fn() }
        const handler = new CreateWorkspaceFileAssetHandler(
            {} as never,
            {} as never,
            volumeClient as never,
            {} as never,
            {} as never
        )

        await expect(
            handler.execute(
                new CreateWorkspaceFileAssetCommand({
                    catalog: 'projects',
                    tenantId: 'foreign-tenant',
                    userId: 'user-1',
                    projectId: 'project-1',
                    filePath: 'shared/brief.pdf'
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(volumeClient.resolve).not.toHaveBeenCalled()
    })

    it('uses the authorized conversation scope and preserves the legacy absolutePath metadata', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization-1')
        jest.spyOn(fsPromises, 'stat').mockResolvedValue({ isFile: () => true, size: 42 } as never)
        const conversation = {
            id: 'conversation-1',
            threadId: 'thread-1',
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            createdById: 'user-1',
            projectId: 'project-canonical',
            xpertId: 'xpert-previous'
        }
        const fileAssetRepository = {
            create: jest.fn((value) => value),
            save: jest.fn(async (value) => ({ id: 'asset-1', ...value }))
        }
        const conversationFileLinkRepository = {
            create: jest.fn((value) => value),
            save: jest.fn(async (value) => value)
        }
        const volume = {
            ensureRoot: jest.fn(),
            path: jest.fn(() => '/srv/volumes/project-canonical/shared/brief.pdf'),
            publicUrl: jest.fn(() => 'https://files.example.test/shared/brief.pdf')
        }
        volume.ensureRoot.mockResolvedValue(volume)
        const volumeClient = { resolve: jest.fn(() => volume) }
        const fileAssetAccessService = {
            assertConversationAccess: jest.fn().mockResolvedValue(conversation),
            assertConversationInputScope: jest.fn(),
            assertCanCreateConversationAsset: jest.fn(),
            assertUnderstandingScope: jest.fn()
        }
        const handler = new CreateWorkspaceFileAssetHandler(
            fileAssetRepository as never,
            conversationFileLinkRepository as never,
            volumeClient as never,
            {} as never,
            fileAssetAccessService as never
        )

        const result = await handler.execute(
            new CreateWorkspaceFileAssetCommand({
                catalog: 'projects',
                conversationId: conversation.id,
                threadId: conversation.threadId,
                projectId: 'project-canonical',
                xpertId: 'xpert-current',
                filePath: 'shared/brief.pdf',
                parseMode: 'none'
            })
        )

        expect(fileAssetAccessService.assertConversationInputScope).toHaveBeenCalledWith(
            conversation,
            expect.objectContaining({ xpertId: 'xpert-current' })
        )
        expect(fileAssetAccessService.assertCanCreateConversationAsset).toHaveBeenCalledWith(conversation, 'understand')
        expect(result).toMatchObject({
            conversationId: conversation.id,
            projectId: conversation.projectId,
            xpertId: conversation.xpertId,
            metadata: {
                workspace: {
                    absolutePath: '/srv/volumes/project-canonical/shared/brief.pdf'
                }
            }
        })
        expect(fileAssetAccessService.assertUnderstandingScope).not.toHaveBeenCalled()
    })

    it('uses Project can-use authorization for standalone understanding without requiring an edit', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('member-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization-1')
        jest.spyOn(fsPromises, 'stat').mockResolvedValue({ isFile: () => true, size: 5 } as never)
        const volume = {
            ensureRoot: jest.fn(),
            path: jest.fn(() => '/srv/project/shared/note.txt'),
            publicUrl: jest.fn(() => undefined)
        }
        volume.ensureRoot.mockResolvedValue(volume)
        const fileAssetAccessService = {
            assertConversationAccess: jest.fn(),
            assertConversationInputScope: jest.fn(),
            assertCanCreateConversationAsset: jest.fn(),
            assertUnderstandingScope: jest.fn().mockResolvedValue(undefined)
        }
        const handler = new CreateWorkspaceFileAssetHandler(
            {
                create: jest.fn((value) => value),
                save: jest.fn(async (value) => ({ id: 'asset-1', ...value }))
            } as never,
            { create: jest.fn(), save: jest.fn() } as never,
            { resolve: jest.fn(() => volume) } as never,
            {} as never,
            fileAssetAccessService as never
        )

        await handler.execute(
            new CreateWorkspaceFileAssetCommand({
                catalog: 'projects',
                projectId: 'project-1',
                xpertId: 'xpert-1',
                filePath: 'shared/note.txt',
                parseMode: 'none'
            })
        )

        expect(fileAssetAccessService.assertUnderstandingScope).toHaveBeenCalledWith({
            projectId: 'project-1',
            xpertId: 'xpert-1'
        })
    })
})
