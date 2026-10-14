jest.mock('@xpert-ai/plugin-sdk', () => jest.requireActual('../../../../plugin-sdk/src/lib/core/context'))
jest.mock('../../user/user.entity', () => ({ User: class User {} }))

import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CommandBus } from '@nestjs/cqrs'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Test } from '@nestjs/testing'
import { RequestContext, RequestContextMiddleware } from '@xpert-ai/plugin-sdk'
import { IUser, UserType } from '@xpert-ai/contracts'
import { IncomingMessage } from 'node:http'
import { Strategy } from 'passport'
import { PassportStrategy } from '@nestjs/passport'
import { Public } from '../../shared/decorators/public.decorator'
import { AuthGuard } from '../../shared/guards/auth.guard'
import { PermissionGuard } from '../../shared/guards/permission.guard'
import { Permissions } from '../../shared/decorators/permissions'
import { RequestContextMiddleware as LegacyRequestContextMiddleware } from '../../core/context/request-context.middleware'
import { ApiKeyOrClientSecretAuthGuard } from '../../shared/guards/api-key-or-client-secret.guard'
import { PersonalApiKeyController } from './personal-api-key.controller'
import { PersonalApiKeyService } from './personal-api-key.service'
import { PersonalApiKeyStrategy } from './personal-api-key.strategy'

const owner: IUser = { id: 'owner', tenantId: 'tenant', type: UserType.USER, roleId: 'role' }
const token = `sk-user-${'a'.repeat(43)}`

@Controller('identity')
class IdentityController {
	@Get()
	me() {
		return {
			user: RequestContext.currentUser(),
			principal: RequestContext.currentApiPrincipal(),
			scope: RequestContext.getScope()
		}
	}

	@Public()
	@UseGuards(ApiKeyOrClientSecretAuthGuard)
	@Get('ai')
	ai() {
		return this.me()
	}

	@Get('protected')
	@UseGuards(PermissionGuard)
	@Permissions('personal-key-test-permission')
	protectedResource() {
		return this.me()
	}
}

/** Sentinel strategies check existing guard fallback ordering without depending on JWT signing configuration. */
class ExistingStrategy extends Strategy {
	constructor(private readonly family: string) {
		super()
	}
	authenticate(req: IncomingMessage) {
		if (req.headers.authorization === `${this.family} existing`) return this.success(owner)
		this.fail(401)
	}
}

describe('Personal API key HTTP authentication and validation', () => {
	let app: INestApplication
	let origin: string
	const keys = { authenticate: jest.fn(), list: jest.fn(), create: jest.fn(), revoke: jest.fn() }
	const authorization = { execute: jest.fn() }

	beforeAll(async () => {
		for (const [name, family] of [
			['jwt', 'Bearer'],
			['basic', 'Basic'],
			['api-key', 'Resource']
		]) {
			class RegisteredStrategy extends PassportStrategy(ExistingStrategy, name) {
				validate() {
					return owner
				}
			}
			new RegisteredStrategy(family)
		}
		const module = await Test.createTestingModule({
			controllers: [PersonalApiKeyController, IdentityController],
			providers: [
				PersonalApiKeyStrategy,
				{ provide: PersonalApiKeyService, useValue: keys },
				{ provide: CACHE_MANAGER, useValue: { get: async () => null, set: async () => undefined } },
				{ provide: CommandBus, useValue: authorization }
			]
		}).compile()
		app = module.createNestApplication({ logger: false })
		const middleware = new RequestContextMiddleware()
		const legacyMiddleware = new LegacyRequestContextMiddleware()
		app.use(legacyMiddleware.use.bind(legacyMiddleware))
		app.use(middleware.use.bind(middleware))
		app.useGlobalGuards(new AuthGuard(app.get(Reflector)))
		await app.listen(0, '127.0.0.1')
		origin = await app.getUrl()
	})
	afterAll(() => app?.close())
	beforeEach(() => {
		jest.resetAllMocks()
		keys.authenticate.mockResolvedValue(owner)
		keys.list.mockResolvedValue([])
	})

	it.each(['/identity', '/identity/ai'])('authenticates as the human through %s', async (path) => {
		const response = await fetch(origin + path, {
			headers: { authorization: `Bearer ${token}`, 'organization-id': 'org', 'x-scope-level': 'organization' }
		})
		expect(response.status).toBe(200)
		expect(await response.json()).toMatchObject({
			user: owner,
			principal: null,
			scope: { tenantId: owner.tenantId, organizationId: 'org' }
		})
		expect(keys.authenticate).toHaveBeenCalledWith(token)
	})

	it('accepts x-api-key without replacing tenant identity from untrusted headers', async () => {
		const response = await fetch(origin + '/identity', { headers: { 'x-api-key': token, 'tenant-id': 'foreign' } })
		expect(response.status).toBe(200)
		expect(await response.json()).toMatchObject({
			user: owner,
			principal: null,
			scope: { tenantId: owner.tenantId }
		})
	})

	it('enforces the existing permission guard with the human owner in both request contexts', async () => {
		const headers = { authorization: `Bearer ${token}` }
		authorization.execute.mockResolvedValueOnce(false)
		expect((await fetch(origin + '/identity/protected', { headers })).status).toBe(403)
		expect(authorization.execute).toHaveBeenCalledWith(
			expect.objectContaining({ tenantId: owner.tenantId, roleId: owner.roleId })
		)
		authorization.execute.mockResolvedValueOnce(true)
		expect((await fetch(origin + '/identity/protected', { headers })).status).toBe(200)
	})

	it('rejects identity overrides and expired/revoked authentication failures', async () => {
		const headers = { authorization: `Bearer ${token}`, 'x-principal-user-id': 'someone-else' }
		expect((await fetch(origin + '/identity', { headers })).status).toBe(401)
		keys.authenticate.mockRejectedValue(new Error('revoked'))
		expect((await fetch(origin + '/identity/ai', { headers: { 'x-api-key': token } })).status).toBe(401)
	})

	it('preserves existing JWT/basic strategy paths and denies technical keys on normal management APIs', async () => {
		for (const authorization of ['Bearer existing', 'Basic existing']) {
			expect((await fetch(origin + '/identity', { headers: { authorization } })).status).toBe(200)
		}
		expect((await fetch(origin + '/identity', { headers: { authorization: 'Resource existing' } })).status).toBe(
			401
		)
		expect((await fetch(origin + '/personal-api-keys')).status).toBe(401)
	})

	it('parses and defaults create input at the HTTP boundary, and never caches the secret response', async () => {
		keys.create.mockResolvedValue({ token: 'one-time-secret' })
		const response = await fetch(origin + '/personal-api-keys', {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ name: ' CLI ' })
		})
		expect(response.status).toBe(201)
		expect(response.headers.get('cache-control')).toBe('no-store')
		expect(keys.create).toHaveBeenCalledWith({ name: 'CLI', lifetime: '90' })
	})

	it.each([
		{ name: ' ' },
		{ name: 'x', lifetime: 'invalid' },
		{ name: 'x', userId: 'foreign' },
		{ name: 'x', token: 'sensitive-value' }
	])('rejects invalid input and ownership overrides', async (body) => {
		const response = await fetch(origin + '/personal-api-keys', {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
		expect(response.status).toBe(400)
		expect(await response.text()).not.toContain('sensitive-value')
		expect(keys.create).not.toHaveBeenCalled()
	})

	it('validates key IDs and returns no body after revoke', async () => {
		const headers = { authorization: `Bearer ${token}` }
		expect((await fetch(origin + '/personal-api-keys/not-uuid', { method: 'DELETE', headers })).status).toBe(400)
		expect(keys.revoke).not.toHaveBeenCalled()
		const id = '9becdf78-75b7-412f-8e25-190cc7e72bc3'
		expect((await fetch(origin + '/personal-api-keys/' + id, { method: 'DELETE', headers })).status).toBe(204)
		expect(keys.revoke).toHaveBeenCalledWith(id)
	})
})
