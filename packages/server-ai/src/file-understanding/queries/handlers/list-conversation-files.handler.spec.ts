jest.mock('@xpert-ai/server-core', () => {
    const actual = jest.requireActual('@xpert-ai/server-core')
    return {
        ...actual,
        RequestContext: {
            currentTenantId: jest.fn(() => 'tenant-1'),
            getOrganizationId: jest.fn(() => 'organization-1')
        }
    }
})

import { ForbiddenException } from '@nestjs/common'
import { ListConversationFilesQuery } from '../list-conversation-files.query'
import { ListConversationFilesHandler } from './list-conversation-files.handler'

describe('ListConversationFilesHandler', () => {
    it('omits a linked asset that the central conversation authority rejects', async () => {
        const visibleFile = { id: 'file-visible', createdAt: new Date('2026-08-28T01:00:00Z') }
        const rejectedFile = { id: 'file-rejected', createdAt: new Date('2026-08-28T00:00:00Z') }
        const linkRepository = {
            find: jest.fn().mockResolvedValue([{ fileAssetId: visibleFile.id }, { fileAssetId: rejectedFile.id }])
        }
        const fileAssetRepository = {
            find: jest.fn().mockResolvedValue([visibleFile, rejectedFile])
        }
        const fileAssetAccessService = {
            resolve: jest.fn().mockImplementation(({ locator }: { locator: { fileAssetId: string } }) => {
                if (locator.fileAssetId === rejectedFile.id) {
                    throw new ForbiddenException()
                }
                return { asset: visibleFile }
            })
        }
        const handler = new ListConversationFilesHandler(
            linkRepository as never,
            fileAssetRepository as never,
            fileAssetAccessService as never
        )

        await expect(handler.execute(new ListConversationFilesQuery('conversation-1'))).resolves.toEqual([visibleFile])
        expect(fileAssetAccessService.resolve).toHaveBeenCalledWith({
            locator: { fileAssetId: rejectedFile.id },
            authority: { kind: 'conversation', conversationId: 'conversation-1' },
            operation: 'read'
        })
    })

    it('propagates resolver failures that are not access denials', async () => {
        const linkRepository = { find: jest.fn().mockResolvedValue([{ fileAssetId: 'file-1' }]) }
        const fileAssetRepository = { find: jest.fn().mockResolvedValue([{ id: 'file-1' }]) }
        const fileAssetAccessService = {
            resolve: jest.fn().mockRejectedValue(new Error('Database unavailable'))
        }
        const handler = new ListConversationFilesHandler(
            linkRepository as never,
            fileAssetRepository as never,
            fileAssetAccessService as never
        )

        await expect(handler.execute(new ListConversationFilesQuery('conversation-1'))).rejects.toThrow(
            'Database unavailable'
        )
    })
})
