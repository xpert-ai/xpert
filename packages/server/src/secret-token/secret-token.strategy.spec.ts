import { SecretTokenStrategy } from './secret-token.strategy'
import { SecretTokenBindingType } from '@xpert-ai/contracts'

jest.mock('../api-key/api-key.service', () => ({
	ApiKeyService: class ApiKeyService {}
}))

jest.mock('./secret-token.service', () => ({
	SecretTokenService: class SecretTokenService {}
}))

describe('SecretTokenStrategy', () => {
	const ORGANIZATION_SCOPE = 'organization'
	const TENANT_SCOPE = 'tenant'

	function createStrategy(requestedOrganizationId: string | null) {
		const secretTokenService = {
			findOneByOptions: jest.fn().mockResolvedValue({
				entityId: 'api-key-1',
				createdById: 'end-user-1',
				validUntil: new Date(Date.now() + 60_000),
				expired: false
			})
		}
		const apiKeyService = {
			findOneOrFailByIdString: jest.fn().mockResolvedValue({
				record: {
					id: 'api-key-1',
					tenantId: 'tenant-1',
					createdById: 'owner-user-1'
				}
			}),
			update: jest.fn().mockResolvedValue(undefined),
			resolvePrincipal: jest.fn().mockResolvedValue({
				id: 'end-user-1',
				tenantId: 'tenant-1',
				requestedOrganizationId,
				principalType: 'client_secret'
			})
		}
		const userService = {
			findOneByIdWithinTenant: jest.fn().mockResolvedValue({
				id: 'end-user-1',
				tenantId: 'tenant-1',
				type: 'communication'
			})
		}

		return {
			strategy: new SecretTokenStrategy(secretTokenService as any, apiKeyService as any, userService as any),
			secretTokenService,
			apiKeyService,
			userService
		}
	}

	async function authenticate(strategy: SecretTokenStrategy, req: Record<string, unknown>) {
		return new Promise<unknown>((resolve, reject) => {
			;(strategy as any).success = jest.fn((principal: unknown) => {
				resolve(principal)
			})
			;(strategy as any).fail = jest.fn((error: unknown) => {
				reject(error)
			})
			;(strategy as any).error = jest.fn((error: unknown) => {
				reject(error)
			})

			strategy.authenticate(req as any, { session: false })
		})
	}

	it('restores organization scope headers after resolving the business principal', async () => {
		const { strategy, apiKeyService } = createStrategy('org-1')
		const req = {
			headers: {
				'x-client-secret': 'cs-x-1',
				'organization-id': ' org-1 '
			}
		}

		const principal = await authenticate(strategy, req)

		expect(apiKeyService.resolvePrincipal).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'api-key-1' }),
			expect.objectContaining({
				requestedUserId: 'end-user-1',
				requestedOrganizationId: 'org-1',
				principalType: 'client_secret'
			})
		)
		expect(principal).toMatchObject({
			requestedOrganizationId: 'org-1',
			principalType: 'client_secret'
		})
		expect(req.headers).toMatchObject({
			'organization-id': 'org-1',
			'x-scope-level': ORGANIZATION_SCOPE
		})
	})

	it('falls back to tenant scope when the resolved principal has no organization context', async () => {
		const { strategy } = createStrategy(null)
		const req = {
			headers: {
				'x-client-secret': 'cs-x-1',
				'organization-id': 'org-1'
			}
		}

		await authenticate(strategy, req)

		expect(req.headers['organization-id']).toBeUndefined()
		expect(req.headers['x-scope-level']).toBe(TENANT_SCOPE)
	})

	it('resolves public xpert client secrets without loading an api key', async () => {
		const { strategy, secretTokenService, apiKeyService, userService } = createStrategy(null)
		secretTokenService.findOneByOptions.mockResolvedValue({
			id: 'secret-token-1',
			type: SecretTokenBindingType.PUBLIC_XPERT,
			entityId: 'xpert-1',
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			createdById: 'anonymous-user-1',
			validUntil: new Date(Date.now() + 60_000),
			expired: false
		})
		userService.findOneByIdWithinTenant.mockResolvedValue({
			id: 'anonymous-user-1',
			tenantId: 'tenant-1',
			type: 'communication'
		})
		const req = {
			headers: {
				'x-client-secret': 'cs-x-public',
				'organization-id': 'org-other'
			}
		}

		const principal = await authenticate(strategy, req)

		expect(apiKeyService.findOneOrFailByIdString).not.toHaveBeenCalled()
		expect(userService.findOneByIdWithinTenant).toHaveBeenCalledWith(
			'anonymous-user-1',
			'tenant-1',
			expect.objectContaining({
				relations: ['role', 'role.rolePermissions', 'employee']
			})
		)
		expect(principal).toMatchObject({
			id: 'anonymous-user-1',
			tenantId: 'tenant-1',
			principalType: 'client_secret',
			clientSecretBindingType: 'public_xpert',
			clientSecretId: 'secret-token-1',
			requestedOrganizationId: 'org-1',
			apiKey: {
				type: 'assistant',
				entityId: 'xpert-1'
			}
		})
		expect(req.headers).toMatchObject({
			'organization-id': 'org-1',
			'x-scope-level': ORGANIZATION_SCOPE
		})
	})
})
