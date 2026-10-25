jest.mock('@xpert-ai/server-core', () => ({
    AssertUserXpertGrantQuery: jest.requireActual('../../../server/src/secret-token/assert-user-xpert-grant.query')
        .AssertUserXpertGrantQuery
}))
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

    it('rejects a user delegation used to read or control another assistant conversation', async () => {
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue({
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
            resourceScope: { kind: 'assistant', xpertId: 'allowed' }
        })
        queryBus.execute.mockResolvedValue(false)
        await expect(
            assertPublicXpertSessionConversationAccess(
                { createdById: 'communication-user-1', xpertId: 'unrelated' },
                queryBus
            )
        ).rejects.toThrow(ForbiddenException)
    })

    it('preserves authorized Project sharing for a user delegation in the bound assistant family', async () => {
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue({
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
            resourceScope: { kind: 'assistant', xpertId: 'current' }
        })
        queryBus.execute.mockResolvedValue(true)
        await expect(
            assertPublicXpertSessionConversationAccess(
                { createdById: 'another-project-member', xpertId: 'previous' },
                queryBus
            )
        ).resolves.toBeUndefined()
        expect(queryBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                candidateXpertId: 'previous',
                referenceXpertId: 'current'
            })
        )
    })

    it('rejects an unbound conversation and malformed audience for a user delegation', async () => {
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue({
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
            resourceScope: { kind: 'assistant', xpertId: 'allowed' }
        })
        await expect(
            assertPublicXpertSessionConversationAccess({ createdById: 'communication-user-1' }, queryBus)
        ).rejects.toThrow(ForbiddenException)
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue({
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
            resourceScope: { kind: 'assistant', xpertId: '' }
        })
        await expect(assertPublicXpertSessionConversationAccess({ xpertId: 'allowed' }, queryBus)).rejects.toThrow(
            ForbiddenException
        )
    })

    it('scopes an enterprise assistant session to its employee and assistant family', async () => {
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue({
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.ENTERPRISE_XPERT,
            resourceScope: { kind: 'assistant', xpertId: 'xpert-1' },
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
            resourceScope: { kind: 'assistant', xpertId: 'xpert-current' },
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
