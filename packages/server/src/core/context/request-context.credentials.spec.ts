import { IApiPrincipal, SecretTokenBindingType } from '@xpert-ai/contracts'
import { RequestContext } from './request-context'

describe('RequestContext conversation credentials', () => {
	afterEach(() => jest.restoreAllMocks())
	it('recognizes a conversation principal without promoting it to an unrestricted login', () => {
		const principal = {
			id: 'A',
			principalType: 'client_secret',
			clientSecretBindingType: SecretTokenBindingType.USER_CONVERSATION,
			resourceScope: { kind: 'conversation', conversationId: 'D' }
		} as IApiPrincipal
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue(principal)
		expect(RequestContext.currentApiPrincipal()).toBe(principal)
		expect(RequestContext.currentApiKey()).toBeNull()
	})
})
