import { ApiKeyBindingType, IApiPrincipal, IUser } from '@xpert-ai/contracts'
import { environment as env } from '@xpert-ai/server-config'
import { decode, verify, type JwtPayload } from 'jsonwebtoken'
import { RequestContext } from '../core/context'
import { LocalOutboundActorTokenProvider } from './outbound-actor-token.provider'

describe('LocalOutboundActorTokenProvider', () => {
	const originalJwtSecret = process.env.JWT_SECRET
	const originalEnvironmentJwtSecret = env.JWT_SECRET
	const originalAudience = process.env.XPERT_OUTBOUND_ACTOR_TOKEN_AUDIENCE
	const originalTtl = process.env.XPERT_OUTBOUND_ACTOR_TOKEN_TTL_SECONDS

	afterEach(() => {
		restoreEnv('JWT_SECRET', originalJwtSecret)
		env.JWT_SECRET = originalEnvironmentJwtSecret
		restoreEnv('XPERT_OUTBOUND_ACTOR_TOKEN_AUDIENCE', originalAudience)
		restoreEnv('XPERT_OUTBOUND_ACTOR_TOKEN_TTL_SECONDS', originalTtl)
		jest.restoreAllMocks()
	})

	it('mints a short-lived local actor JWT with delegated user and act claims', () => {
		process.env.JWT_SECRET = 'actor-test-secret'
		env.JWT_SECRET = undefined
		const user = {
			id: 'user-1',
			tenantId: 'tenant-1',
			email: 'user@example.test',
			username: 'user@example.test',
			firstName: 'Ada',
			lastName: 'Lovelace',
			employeeId: 'employee-1',
			role: {
				name: 'ADMIN',
				rolePermissions: [
					{
						permission: 'semantic-model.edit',
						enabled: true
					}
				]
			}
		} as IUser
		const principal = {
			id: 'technical-user-1',
			tenantId: 'tenant-1',
			principalType: 'api_key',
			apiKey: {
				id: 'api-key-1',
				token: 'redacted',
				type: ApiKeyBindingType.ASSISTANT,
				entityId: 'xpert-1'
			},
			apiKeyUserId: 'technical-user-1',
			requestedUserId: 'user-1'
		} as IApiPrincipal
		jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(principal)

		const result = new LocalOutboundActorTokenProvider().mint({
			user,
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			audience: 'local-api',
			ttlSeconds: 60,
			clientId: 'plugin-runtime',
			act: {
				sub: 'xpert_agent',
				xpert_id: 'xpert-1'
			}
		})

		const complete = decode(result.token, { complete: true }) as unknown as {
			header: { alg?: string }
		} | null
		expect(complete?.header).toMatchObject({ alg: 'HS256' })
		expect(result.audience).toBe('local-api')
		expect(result.expiresAt).toEqual(expect.any(String))

		const payload = verify(result.token, 'actor-test-secret', {
			algorithms: ['HS256'],
			audience: 'local-api'
		}) as JwtPayload

		expect(payload.sub).toBe('user-1')
		expect(payload.id).toBe('user-1')
		expect(payload.tenantId).toBe('tenant-1')
		expect(payload.tenant_id).toBe('tenant-1')
		expect(payload.org_id).toBe('org-1')
		expect(payload.client_id).toBe('plugin-runtime')
		expect(payload.email).toBe('user@example.test')
		expect(payload.name).toBe('Ada Lovelace')
		expect(payload.role).toBe('ADMIN')
		expect(payload.roles).toEqual(['ADMIN'])
		expect(payload.permissions).toEqual(['semantic-model.edit'])
		expect(payload.jti).toEqual(expect.any(String))
		expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBeLessThanOrEqual(60)
		expect(payload.act).toMatchObject({
			sub: 'xpert_agent',
			xpert_id: 'xpert-1',
			principal_type: 'api_key',
			api_key_id: 'api-key-1',
			api_key_type: ApiKeyBindingType.ASSISTANT,
			api_key_entity_id: 'xpert-1',
			technical_user_id: 'technical-user-1',
			requested_user_id: 'user-1'
		})
	})

	it('uses outbound audience override and caps ttl at fifteen minutes', () => {
		process.env.JWT_SECRET = 'actor-test-secret'
		env.JWT_SECRET = undefined
		process.env.XPERT_OUTBOUND_ACTOR_TOKEN_AUDIENCE = 'plugins'
		process.env.XPERT_OUTBOUND_ACTOR_TOKEN_TTL_SECONDS = '3600'

		const result = new LocalOutboundActorTokenProvider().mint({
			user: { id: 'user-1', tenantId: 'tenant-1' } as IUser
		})

		const payload = verify(result.token, 'actor-test-secret', {
			algorithms: ['HS256'],
			audience: 'plugins'
		}) as JwtPayload
		expect(result.audience).toBe('plugins')
		expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(900)
	})

	it('reports unavailable and fails clearly when signing config is missing', () => {
		delete process.env.JWT_SECRET
		env.JWT_SECRET = undefined
		const provider = new LocalOutboundActorTokenProvider()

		expect(provider.isAvailable()).toBe(false)
		expect(() =>
			provider.mint({
				user: { id: 'user-1', tenantId: 'tenant-1' } as IUser
			})
		).toThrow(/JWT_SECRET/)
	})
})

function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name]
		return
	}

	process.env[name] = value
}
