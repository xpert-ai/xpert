import { RequestContext } from '@xpert-ai/plugin-sdk'
import { UserType } from '@xpert-ai/contracts'
import { authenticatedRuntimeUserHeaders } from './runtime-user-headers'
describe('Authenticated runtime user marker', () => {
    afterEach(() => jest.restoreAllMocks())
    it('marks only a regular authenticated principal and excludes API/resource-scoped identities', () => {
        const current = jest.spyOn(RequestContext, 'currentUser')
        current.mockReturnValue({ id: 'human', type: UserType.USER })
        expect(authenticatedRuntimeUserHeaders()).toEqual({ authenticatedUserId: 'human' })
        current.mockReturnValue({ id: 'machine', type: UserType.COMMUNICATION })
        expect(authenticatedRuntimeUserHeaders()).toEqual({})
        current.mockReturnValue(Object.assign({ id: 'human', type: UserType.USER }, { apiKey: {} }))
        expect(authenticatedRuntimeUserHeaders()).toEqual({})
        current.mockReturnValue(Object.assign({ id: 'human', type: UserType.USER }, { resourceScope: {} }))
        expect(authenticatedRuntimeUserHeaders()).toEqual({})
    })
})
