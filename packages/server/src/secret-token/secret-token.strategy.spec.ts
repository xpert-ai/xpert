import { SecretTokenStrategy } from './secret-token.strategy'

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

		return {
			strategy: new SecretTokenStrategy(
				secretTokenService as any,
				apiKeyService as any
			),
			secretTokenService,
			apiKeyService
		}
	}

	async function authenticate(strategy: SecretTokenStrategy, req: Record<string, unknown>) {
		return new Promise<unknown>((resolve, reject) => {
			jest.spyOn(strategy as any, 'success').mockImplementation((principal: unknown) => {
				resolve(principal)
			})
			jest.spyOn(strategy as any, 'fail').mockImplementation((error: unknown) => {
				reject(error)
			})
			jest.spyOn(strategy as any, 'error').mockImplementation((error: unknown) => {
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
})
