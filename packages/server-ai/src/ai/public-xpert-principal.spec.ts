jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: {
        currentApiPrincipal: jest.fn(),
        currentUserId: jest.fn()
    }
}))

import { ApiKeyBindingType, SecretTokenBindingType } from '@xpert-ai/contracts'
import { ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import {
    assertPublicXpertSessionConversationAccess,
    getPublicXpertSessionConversationScope
} from './public-xpert-principal'

describe('restricted xpert conversation scope', () => {
    const queryBus = {
        execute: jest.fn()
    }

    beforeEach(() => {
        jest.clearAllMocks()
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('communication-user-1')
    })

    it('scopes an enterprise assistant session to its employee and assistant family', async () => {
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue({
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.ENTERPRISE_XPERT,
            apiKey: {
                type: ApiKeyBindingType.ASSISTANT,
                entityId: 'xpert-1'
            }
        })

        expect(getPublicXpertSessionConversationScope()).toEqual({
            createdById: 'communication-user-1',
            xpertId: 'xpert-1'
        })
        await expect(
            assertPublicXpertSessionConversationAccess(
                {
                    createdById: 'communication-user-2',
                    xpertId: 'xpert-1'
                },
                queryBus
            )
        ).rejects.toThrow(ForbiddenException)

        queryBus.execute.mockResolvedValueOnce(false)
        await expect(
            assertPublicXpertSessionConversationAccess(
                {
                    createdById: 'communication-user-1',
                    xpertId: 'xpert-2'
                },
                queryBus
            )
        ).rejects.toThrow(ForbiddenException)
    })

    it('accepts a conversation bound to an older published version in the same assistant family', async () => {
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue({
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.PUBLIC_XPERT,
            apiKey: {
                type: ApiKeyBindingType.ASSISTANT,
                entityId: 'xpert-current'
            }
        })
        queryBus.execute.mockResolvedValueOnce(true)

        await expect(
            assertPublicXpertSessionConversationAccess(
                {
                    createdById: 'communication-user-1',
                    xpertId: 'xpert-previous'
                },
                queryBus
            )
        ).resolves.toBeUndefined()

        expect(queryBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                candidateXpertId: 'xpert-previous',
                referenceXpertId: 'xpert-current'
            })
        )
    })
})
