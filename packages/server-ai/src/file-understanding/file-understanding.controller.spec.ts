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

import { ForbiddenException } from '@nestjs/common'
import { getPublicXpertSessionConversationScope } from '../ai/public-xpert-principal'
import { FileUnderstandingController } from './file-understanding.controller'

describe('FileUnderstandingController restricted assistant access', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(getPublicXpertSessionConversationScope as jest.Mock).mockReturnValue({
            createdById: 'employee-1',
            xpertId: 'xpert-1'
        })
    })

    it('returns a file owned by the current employee and bound assistant', async () => {
        const queryBus = {
            execute: jest.fn().mockResolvedValue({
                id: 'file-1',
                userId: 'employee-1',
                xpertId: 'xpert-1'
            })
        }
        const controller = new FileUnderstandingController({} as never, queryBus as never)

        await expect(controller.getFile('file-1')).resolves.toMatchObject({ id: 'file-1' })
    })

    it('rejects a file owned by another employee before reading its preview', async () => {
        const queryBus = {
            execute: jest.fn().mockResolvedValue({
                id: 'file-other',
                userId: 'employee-other',
                xpertId: 'xpert-1'
            })
        }
        const controller = new FileUnderstandingController({} as never, queryBus as never)

        await expect(controller.getPreview('file-other')).rejects.toBeInstanceOf(ForbiddenException)
        expect(queryBus.execute).toHaveBeenCalledTimes(1)
    })

    it('rejects a file bound to another assistant', async () => {
        const queryBus = {
            execute: jest.fn().mockResolvedValue({
                id: 'file-other',
                userId: 'employee-1',
                xpertId: 'xpert-other'
            })
        }
        const controller = new FileUnderstandingController({} as never, queryBus as never)

        await expect(controller.readFile('file-other', {})).rejects.toBeInstanceOf(ForbiddenException)
    })
})
