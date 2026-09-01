jest.mock('@xpert-ai/server-core', () => ({
    AllowClientSecretBindings: () => () => undefined,
    ApiKeyOrClientSecretAuthGuard: class {},
    Public: () => () => undefined,
    TransformInterceptor: class {}
}))

jest.mock('../chat-conversation', () => ({
    GetChatConversationQuery: class GetChatConversationQuery {}
}))

jest.mock('../ai/public-xpert-principal', () => ({
    assertPublicXpertSessionConversationAccess: jest.fn(),
    getPublicXpertSessionConversationScope: jest.fn()
}))

jest.mock('./file-asset-access.service', () => ({
    FileAssetAccessService: class FileAssetAccessService {}
}))

import { ForbiddenException } from '@nestjs/common'
import {
    assertPublicXpertSessionConversationAccess,
    getPublicXpertSessionConversationScope
} from '../ai/public-xpert-principal'
import { FileUnderstandingController } from './file-understanding.controller'

describe('FileUnderstandingController restricted assistant access', () => {
    const createController = (overrides?: {
        commandBus?: { execute: jest.Mock }
        queryBus?: { execute: jest.Mock }
        fileAssetAccessService?: { resolve: jest.Mock; assertConversationAccess: jest.Mock }
    }) => {
        const commandBus = overrides?.commandBus ?? { execute: jest.fn() }
        const queryBus = overrides?.queryBus ?? { execute: jest.fn() }
        const fileAssetAccessService = overrides?.fileAssetAccessService ?? {
            resolve: jest.fn().mockResolvedValue({
                asset: {
                    id: 'file-1',
                    userId: 'employee-1',
                    xpertId: 'xpert-1'
                }
            }),
            assertConversationAccess: jest.fn().mockResolvedValue({
                id: 'conversation-1',
                userId: 'employee-1',
                xpertId: 'xpert-1'
            })
        }
        return {
            controller: new FileUnderstandingController(
                commandBus as never,
                queryBus as never,
                fileAssetAccessService as never
            ),
            commandBus,
            queryBus,
            fileAssetAccessService
        }
    }

    beforeEach(() => {
        jest.clearAllMocks()
        ;(assertPublicXpertSessionConversationAccess as jest.Mock).mockResolvedValue(undefined)
        ;(getPublicXpertSessionConversationScope as jest.Mock).mockReturnValue({
            createdById: 'employee-1',
            xpertId: 'xpert-1'
        })
    })

    it('returns a file owned by the current employee and bound assistant', async () => {
        const { controller, fileAssetAccessService } = createController()

        await expect(controller.getFile('file-1')).resolves.toMatchObject({ id: 'file-1' })
        expect(fileAssetAccessService.resolve).toHaveBeenCalledWith({
            locator: { fileAssetId: 'file-1' },
            authority: { kind: 'current-owner' },
            operation: 'read'
        })
    })

    it('rejects a file owned by another employee before reading its preview', async () => {
        const fileAssetAccessService = {
            resolve: jest.fn().mockRejectedValue(new ForbiddenException()),
            assertConversationAccess: jest.fn()
        }
        const { controller, queryBus } = createController({ fileAssetAccessService })

        await expect(controller.getPreview('file-other')).rejects.toBeInstanceOf(ForbiddenException)
        expect(queryBus.execute).not.toHaveBeenCalled()
    })

    it('rejects a file bound to another assistant', async () => {
        const fileAssetAccessService = {
            resolve: jest.fn().mockResolvedValue({
                asset: { id: 'file-other', userId: 'employee-1', xpertId: 'xpert-other' }
            }),
            assertConversationAccess: jest.fn()
        }
        const { controller } = createController({ fileAssetAccessService })
        ;(assertPublicXpertSessionConversationAccess as jest.Mock).mockRejectedValueOnce(new ForbiddenException())

        await expect(controller.readFile('file-other', {})).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('accepts a file from an older assistant version after the family check succeeds', async () => {
        const fileAssetAccessService = {
            resolve: jest.fn().mockResolvedValue({
                asset: { id: 'file-previous', userId: 'employee-1', xpertId: 'xpert-previous' }
            }),
            assertConversationAccess: jest.fn()
        }
        const { controller, queryBus } = createController({ fileAssetAccessService })

        await expect(controller.getFile('file-previous')).resolves.toMatchObject({ id: 'file-previous' })
        expect(assertPublicXpertSessionConversationAccess).toHaveBeenCalledWith(
            { createdById: 'employee-1', xpertId: 'xpert-previous' },
            queryBus
        )
    })

    it.each([
        ['status', (controller: FileUnderstandingController) => controller.getFileStatus('file-1'), 'read'],
        ['retry', (controller: FileUnderstandingController) => controller.retryParse('file-1'), 'parse'],
        ['search', (controller: FileUnderstandingController) => controller.searchFile('file-1', {}), 'read'],
        ['preview', (controller: FileUnderstandingController) => controller.getPreview('file-1'), 'read'],
        ['read', (controller: FileUnderstandingController) => controller.readFile('file-1', {}), 'read'],
        ['delete', (controller: FileUnderstandingController) => controller.deleteFile('file-1'), 'delete']
    ])('authorizes %s before executing the file operation', async (_name, invoke, operation) => {
        ;(getPublicXpertSessionConversationScope as jest.Mock).mockReturnValue(undefined)
        const { controller, fileAssetAccessService } = createController()

        await invoke(controller)

        expect(fileAssetAccessService.resolve).toHaveBeenCalledWith({
            locator: { fileAssetId: 'file-1' },
            authority: { kind: 'current-owner' },
            operation
        })
    })

    it('authorizes the persisted conversation before listing its files', async () => {
        ;(getPublicXpertSessionConversationScope as jest.Mock).mockReturnValue(undefined)
        const { controller, fileAssetAccessService, queryBus } = createController()

        await controller.listConversationFiles('conversation-1')

        expect(fileAssetAccessService.assertConversationAccess).toHaveBeenCalledWith(
            { kind: 'conversation', conversationId: 'conversation-1' },
            'read'
        )
        expect(queryBus.execute).toHaveBeenCalledTimes(1)
    })
})
