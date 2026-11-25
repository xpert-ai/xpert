import { type IApiPrincipal, SecretTokenBindingType, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { isAssistantUserSession } from './assistant-user-session'

describe('isAssistantUserSession', () => {
    const owner = { id: 'member', type: UserType.USER }
    const delegation: IApiPrincipal = {
        ...owner,
        principalType: 'client_secret',
        clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
        requestedUserId: owner.id
    }

    afterEach(() => jest.restoreAllMocks())

    it('accepts the authenticated owner supplied by direct login or personal API key authentication', () => {
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue(owner)
        expect(isAssistantUserSession()).toBe(true)
    })

    it.each([{ type: UserType.USER }, { id: 'service', type: UserType.COMMUNICATION }])(
        'requires an identified human account for direct requests (%j)',
        (user) => {
            jest.spyOn(RequestContext, 'currentUser').mockReturnValue(user)
            expect(isAssistantUserSession()).toBe(false)
        }
    )

    it.each([SecretTokenBindingType.USER_XPERT, SecretTokenBindingType.ENTERPRISE_XPERT])(
        'accepts %s only for the bound acting user',
        (clientSecretBindingType) => {
            const principal = { ...delegation, clientSecretBindingType }
            const currentUser = jest.spyOn(RequestContext, 'currentUser').mockReturnValue(principal)
            expect(isAssistantUserSession()).toBe(true)
            currentUser.mockReturnValue({ ...principal, id: 'other' })
            expect(isAssistantUserSession()).toBe(false)
        }
    )

    it('rejects a resource API key even when it carries the owner as its acting user', () => {
        const principal: IApiPrincipal = { ...owner, principalType: 'api_key', requestedUserId: owner.id }
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue(principal)
        expect(isAssistantUserSession()).toBe(false)
    })

    it.each([SecretTokenBindingType.API_KEY, SecretTokenBindingType.USER_CONVERSATION])(
        'rejects the %s binding even when its user ID matches',
        (clientSecretBindingType) => {
            const principal = { ...delegation, clientSecretBindingType }
            jest.spyOn(RequestContext, 'currentUser').mockReturnValue(principal)
            expect(isAssistantUserSession()).toBe(false)
        }
    )
})
