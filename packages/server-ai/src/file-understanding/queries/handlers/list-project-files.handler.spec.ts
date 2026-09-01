jest.mock('@xpert-ai/server-core', () => {
    const actual = jest.requireActual('@xpert-ai/server-core')
    return {
        ...actual,
        RequestContext: {
            currentTenantId: jest.fn(() => 'tenant-1'),
            currentUserId: jest.fn(() => 'user-1'),
            getOrganizationId: jest.fn(() => 'organization-1')
        }
    }
})

import { ForbiddenException } from '@nestjs/common'
import { ListProjectFilesQuery } from '../list-project-files.query'
import { ListProjectFilesHandler } from './list-project-files.handler'

describe('ListProjectFilesHandler', () => {
    it('keeps centrally authorized Project files and linked member attachments visible', async () => {
        const projectFile = { id: 'project-file', createdAt: new Date('2026-08-28T01:00:00Z') }
        const linkedMemberFile = { id: 'linked-member-file', createdAt: new Date('2026-08-28T02:00:00Z') }
        const linkRepository = {
            find: jest.fn().mockResolvedValue([{ fileAssetId: linkedMemberFile.id }])
        }
        const fileAssetRepository = {
            find: jest.fn().mockResolvedValueOnce([projectFile]).mockResolvedValueOnce([linkedMemberFile])
        }
        const projectAccessService = {
            assertCanRead: jest.fn().mockResolvedValue({
                project: { id: 'project-1', members: [] },
                role: 'editor'
            })
        }
        const fileAssetAccessService = {
            resolve: jest.fn().mockImplementation(({ locator }: { locator: { fileAssetId: string } }) => ({
                asset: locator.fileAssetId === projectFile.id ? projectFile : linkedMemberFile
            }))
        }
        const handler = new ListProjectFilesHandler(
            linkRepository as never,
            fileAssetRepository as never,
            projectAccessService as never,
            fileAssetAccessService as never
        )

        await expect(handler.execute(new ListProjectFilesQuery('project-1', 'conversation-1'))).resolves.toEqual([
            linkedMemberFile,
            projectFile
        ])
        expect(fileAssetAccessService.resolve).toHaveBeenCalledWith({
            locator: { fileAssetId: projectFile.id },
            authority: { kind: 'current-owner' },
            operation: 'read'
        })
        expect(fileAssetAccessService.resolve).toHaveBeenCalledWith({
            locator: { fileAssetId: linkedMemberFile.id },
            authority: { kind: 'conversation', conversationId: 'conversation-1' },
            operation: 'read'
        })
        expect(projectAccessService.assertCanRead).toHaveBeenCalledWith('project-1')
    })

    it('returns an empty set when the Project membership access service denies the actor', async () => {
        const linkRepository = { find: jest.fn() }
        const fileAssetRepository = { find: jest.fn() }
        const projectAccessService = {
            assertCanRead: jest.fn().mockRejectedValue(new ForbiddenException())
        }
        const fileAssetAccessService = { resolve: jest.fn() }
        const handler = new ListProjectFilesHandler(
            linkRepository as never,
            fileAssetRepository as never,
            projectAccessService as never,
            fileAssetAccessService as never
        )

        await expect(handler.execute(new ListProjectFilesQuery('project-1'))).resolves.toEqual([])

        expect(fileAssetRepository.find).not.toHaveBeenCalled()
        expect(fileAssetAccessService.resolve).not.toHaveBeenCalled()
    })
})
