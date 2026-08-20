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
    beforeEach(() => {
        jest.clearAllMocks()
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('communication-user-1')
    })

    it('scopes an enterprise assistant session to its employee and single assistant', () => {
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
        expect(() =>
            assertPublicXpertSessionConversationAccess({
                createdById: 'communication-user-2',
                xpertId: 'xpert-1'
            })
        ).toThrow(ForbiddenException)
        expect(() =>
            assertPublicXpertSessionConversationAccess({
                createdById: 'communication-user-1',
                xpertId: 'xpert-2'
            })
        ).toThrow(ForbiddenException)
    })
})
