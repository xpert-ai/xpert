import { API_PRINCIPAL_USER_ID_HEADER, UserType } from '@xpert-ai/contracts'
import {
	buildApiKeyPrincipal,
	resolveApiKeyRequestedOrganizationId,
	resolveApiKeyRequestedUserId
} from './api-key-principal'

describe('api-key principal helpers', () => {
	it('builds an api principal with requested user metadata', () => {
		const principal = buildApiKeyPrincipal(
			{
				id: 'api-key-1',
				token: 'sk-x-token',
				tenantId: 'tenant-1',
				userId: 'api-user-1',
				createdById: 'owner-user-1'
			} as any,
			{
				actingUser: {
					id: 'end-user-1',
					tenantId: 'tenant-1',
					type: UserType.USER,
					username: 'end-user'
				},
				requestedUserId: 'end-user-1',
				requestedOrganizationId: 'org-1'
			}
		)

		expect(principal).toMatchObject({
			id: 'end-user-1',
			tenantId: 'tenant-1',
			type: UserType.USER,
			apiKeyUserId: 'api-user-1',
			ownerUserId: 'owner-user-1',
			requestedUserId: 'end-user-1',
			requestedOrganizationId: 'org-1',
			principalType: 'api_key'
		})
	})

	it('reads the requested principal user id from the shared header', () => {
		expect(
			resolveApiKeyRequestedUserId({
				headers: {
					[API_PRINCIPAL_USER_ID_HEADER]: 'user-from-header'
				}
			} as any)
		).toBe('user-from-header')
	})

	it('reads the requested organization id from the original organization header', () => {
		expect(
			resolveApiKeyRequestedOrganizationId({
				headers: {
					'organization-id': [' ', 'org-from-header ']
				}
			} as any)
		).toBe('org-from-header')
	})
})
