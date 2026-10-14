jest.mock('../../user/user.service', () => ({ UserService: class UserService {} }))
jest.mock('../../integration', () => ({ IntegrationService: class IntegrationService {} }))
jest.mock('../../user/factory-reset/factory-reset.service', () => ({
	FactoryResetService: class FactoryResetService {}
}))

import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Test } from '@nestjs/testing'
import { RequestContext, RequestContextMiddleware } from '@xpert-ai/plugin-sdk'
import { ApiKeyBindingType, IUser, UserType } from '@xpert-ai/contracts'
import { IncomingMessage } from 'node:http'
import { Strategy } from 'passport'
import { PassportStrategy } from '@nestjs/passport'
import { And, Equal, FindOneOptions, IsNull, Not, Or } from 'typeorm'
import { AllowPersonalApiKeys } from '../../shared/decorators/allow-personal-api-keys.decorator'
import { Public } from '../../shared/decorators/public.decorator'
import { AuthGuard } from '../../shared/guards/auth.guard'
import { PermissionGuard } from '../../shared/guards/permission.guard'
import { Permissions } from '../../shared/decorators/permissions'
import { RequestContextMiddleware as LegacyRequestContextMiddleware } from '../../core/context/request-context.middleware'
import { ApiKeyOrClientSecretAuthGuard } from '../../shared/guards/api-key-or-client-secret.guard'
import { PersonalApiKeyController } from './personal-api-key.controller'
import { ApiKeyService } from '../api-key.service'
import { ApiKeyController } from '../api-key.controller'
import { ApiKeyStrategy } from '../api-key.strategy'
import { ApiKey } from '../api-key.entity'
import { UseApiKeyHandler } from '../queries/handlers/api-key.use.handler'
import { UseApiKeyQuery } from '../queries/api-key.use.query'
import { UserController } from '../../user/user.controller'
import { FactoryResetService } from '../../user/factory-reset/factory-reset.service'
import { UserService } from '../../user/user.service'
import { IntegrationService } from '../../integration'
import { hashPersonalApiKey } from './personal-api-key-token'

const owner: IUser = { id: 'owner', tenantId: 'tenant', type: UserType.USER, roleId: 'role' }
const token = `sk-user-${'a'.repeat(43)}`

@Controller('user')
class CurrentUserController extends UserController {}

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
	@AllowPersonalApiKeys()
	@Get('ai')
	ai() {
		return this.me()
	}

	@Get('protected')
	@Public()
	@AllowPersonalApiKeys()
	@UseGuards(ApiKeyOrClientSecretAuthGuard, PermissionGuard)
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
	let keys: ApiKeyService
	let handler: UseApiKeyHandler
	const repository = {
		find: jest.fn(),
		findOne: jest.fn(),
		findAndCount: jest.fn(),
		count: jest.fn(),
		create: jest.fn(),
		save: jest.fn(),
		update: jest.fn(),
		delete: jest.fn(),
		softRemove: jest.fn(),
		recover: jest.fn()
	}
	const authorization = { execute: jest.fn() }

	beforeAll(async () => {
		for (const [name, family] of [
			['jwt', 'Bearer'],
			['basic', 'Basic']
		]) {
			class RegisteredStrategy extends PassportStrategy(ExistingStrategy, name) {
				validate() {
					return owner
				}
			}
			new RegisteredStrategy(family)
		}
		const module = await Test.createTestingModule({
			controllers: [PersonalApiKeyController, IdentityController, ApiKeyController, CurrentUserController],
			providers: [
				ApiKeyStrategy,
				ApiKeyService,
				UseApiKeyHandler,
				{ provide: getRepositoryToken(ApiKey), useValue: repository },
				{ provide: UserService, useValue: { findCurrentUser: jest.fn(async () => owner) } },
				{ provide: FactoryResetService, useValue: {} },
				{ provide: IntegrationService, useValue: {} },
				{ provide: QueryBus, useValue: { execute: (query: UseApiKeyQuery) => handler.execute(query) } },
				{ provide: CACHE_MANAGER, useValue: { get: async () => null, set: async () => undefined } },
				{ provide: CommandBus, useValue: authorization }
			]
		}).compile()
		keys = module.get(ApiKeyService)
		handler = module.get(UseApiKeyHandler)
		app = module.createNestApplication({ logger: false })
		app.setGlobalPrefix('api-key')
		const middleware = new RequestContextMiddleware()
		const legacyMiddleware = new LegacyRequestContextMiddleware()
		app.use(legacyMiddleware.use.bind(legacyMiddleware))
		app.use(middleware.use.bind(middleware))
		app.useGlobalGuards(new AuthGuard(app.get(Reflector)))
		await app.listen(0, '127.0.0.1')
		origin = (await app.getUrl()) + '/api-key'
	})
	afterAll(() => app?.close())
	beforeEach(() => {
		jest.restoreAllMocks()
		jest.resetAllMocks()
		repository.findOne.mockResolvedValue(
			Object.assign(new ApiKey(), {
				id: 'key',
				type: ApiKeyBindingType.USER,
				token: hashPersonalApiKey(token),
				entityId: owner.id,
				userId: owner.id,
				tenantId: owner.tenantId,
				user: { ...owner }
			})
		)
		repository.find.mockResolvedValue([])
		repository.findAndCount.mockResolvedValue([[], 0])
		repository.count.mockResolvedValue(0)
		repository.update.mockResolvedValue({ affected: 1 })
	})

	it.each(['authorization', 'x-api-key'])(
		'denies personal %s credentials on user and management APIs',
		async (header) => {
			const headers = {
				[header]: header === 'authorization' ? `Bearer ${token}` : token,
				'content-type': 'application/json'
			}
			for (const [method, path] of [
				['GET', '/user/me'],
				['GET', '/identity'],
				['GET', '/personal'],
				['POST', '/personal'],
				['DELETE', '/personal/9becdf78-75b7-412f-8e25-190cc7e72bc3'],
				['POST', '']
			]) {
				const response = await fetch(origin + path, {
					method,
					headers,
					...(method === 'POST' ? { body: JSON.stringify({ name: 'not allowed' }) } : {})
				})
				expect({ method, path, status: response.status }).toEqual({ method, path, status: 401 })
			}
			expect(repository.save).not.toHaveBeenCalled()
			expect(repository.update).not.toHaveBeenCalled()
		}
	)

	it.each(['/identity/ai'])('authenticates as the human through %s', async (path) => {
		const response = await fetch(origin + path, {
			headers: { authorization: `Bearer ${token}`, 'organization-id': 'org', 'x-scope-level': 'organization' }
		})
		expect(response.status).toBe(200)
		expect(await response.json()).toMatchObject({
			user: owner,
			principal: null,
			scope: { tenantId: owner.tenantId, organizationId: 'org' }
		})
		expect(repository.findOne).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ type: ApiKeyBindingType.USER, token: hashPersonalApiKey(token) })
			})
		)
	})

	it('accepts x-api-key without replacing tenant identity from untrusted headers', async () => {
		const response = await fetch(origin + '/identity/ai', {
			headers: { 'x-api-key': token, 'tenant-id': 'foreign' }
		})
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
		expect((await fetch(origin + '/identity/ai', { headers })).status).toBe(401)
		repository.update.mockResolvedValue({ affected: 0 })
		expect((await fetch(origin + '/identity/ai', { headers: { 'x-api-key': token } })).status).toBe(401)
	})

	it('preserves existing JWT/basic strategy paths and denies technical keys on normal management APIs', async () => {
		for (const authorization of ['Bearer existing', 'Basic existing']) {
			for (const path of ['/identity', '/identity/ai', '/user/me'])
				expect((await fetch(origin + path, { headers: { authorization } })).status).toBe(200)
		}
		expect((await fetch(origin + '/identity', { headers: { authorization: 'Resource existing' } })).status).toBe(
			401
		)
		expect((await fetch(origin + '/personal')).status).toBe(401)
	})

	it('parses and defaults create input at the HTTP boundary, and never caches the secret response', async () => {
		const create = jest.spyOn(keys, 'createPersonal').mockResolvedValue({ token: 'one-time-secret', key: null })
		const response = await fetch(origin + '/personal', {
			method: 'POST',
			headers: { authorization: 'Bearer existing', 'content-type': 'application/json' },
			body: JSON.stringify({ name: ' CLI ' })
		})
		expect(response.status).toBe(201)
		expect(response.headers.get('cache-control')).toBe('no-store')
		expect(create).toHaveBeenCalledWith({ name: 'CLI', lifetime: '90' })
	})

	it.each([
		{ name: ' ' },
		{ name: 'x', lifetime: 'invalid' },
		{ name: 'x', userId: 'foreign' },
		{ name: 'x', token: 'sensitive-value' }
	])('rejects invalid input and ownership overrides', async (body) => {
		const response = await fetch(origin + '/personal', {
			method: 'POST',
			headers: { authorization: 'Bearer existing', 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
		expect(response.status).toBe(400)
		expect(await response.text()).not.toContain('sensitive-value')
		expect(repository.save).not.toHaveBeenCalled()
	})

	it('validates key IDs and returns no body after revoke', async () => {
		const revoke = jest.spyOn(keys, 'revokePersonal').mockResolvedValue(undefined)
		const headers = { authorization: 'Bearer existing' }
		expect((await fetch(origin + '/personal/not-uuid', { method: 'DELETE', headers })).status).toBe(400)
		expect(revoke).not.toHaveBeenCalled()
		const id = '9becdf78-75b7-412f-8e25-190cc7e72bc3'
		expect((await fetch(origin + '/personal/' + id, { method: 'DELETE', headers })).status).toBe(204)
		expect(revoke).toHaveBeenCalledWith(id)
	})

	it.each([ApiKeyBindingType.ASSISTANT, ApiKeyBindingType.WORKSPACE])(
		'keeps %s keys on resource APIs without granting management access',
		async (type) => {
			const technical: IUser = { id: 'technical', tenantId: owner.tenantId, type: UserType.COMMUNICATION }
			repository.findOne.mockResolvedValue(
				Object.assign(new ApiKey(), {
					id: 'resource-key',
					token: 'sk-x-resource',
					type,
					entityId: 'resource',
					createdBy: owner,
					createdById: owner.id,
					user: technical,
					userId: technical.id
				})
			)
			const headers = { authorization: 'Bearer sk-x-resource' }
			const response = await fetch(origin + '/identity/ai', { headers })
			expect(response.status).toBe(200)
			expect(await response.json()).toMatchObject({
				principal: {
					id: technical.id,
					principalType: 'api_key',
					resourceScope:
						type === ApiKeyBindingType.ASSISTANT
							? { kind: 'assistant', xpertId: 'resource' }
							: { kind: 'workspace', workspaceId: 'resource' }
				}
			})
			expect((await fetch(origin + '/identity', { headers })).status).toBe(401)
			expect((await fetch(origin + '/personal', { headers })).status).toBe(401)
		}
	)

	it('does not fall back to a plaintext resource row when a personal key has been revoked', async () => {
		const collision = Object.assign(new ApiKey(), {
			id: 'legacy',
			token,
			type: ApiKeyBindingType.ASSISTANT,
			entityId: 'assistant',
			createdBy: owner
		})
		repository.findOne.mockImplementation(async (options: FindOneOptions<ApiKey>) =>
			!Array.isArray(options.where) && options.where.token === token ? collision : null
		)
		for (const path of ['/identity', '/identity/ai']) {
			expect((await fetch(origin + path, { headers: { authorization: `Bearer ${token}` } })).status).toBe(401)
		}
		expect(repository.update).not.toHaveBeenCalled()
	})

	it('rejects personal type/credential injection through the old create and update endpoints', async () => {
		const headers = { authorization: 'Bearer existing', 'content-type': 'application/json' }
		for (const body of [{ type: ApiKeyBindingType.USER }, { token }, { revokedAt: null }, { id: owner.id }]) {
			expect((await fetch(origin, { method: 'POST', headers, body: JSON.stringify(body) })).status).toBe(400)
		}
		expect(
			(
				await fetch(origin + '/9becdf78-75b7-412f-8e25-190cc7e72bc3', {
					method: 'PUT',
					headers,
					body: JSON.stringify({ type: ApiKeyBindingType.USER })
				})
			).status
		).toBe(400)
		expect(repository.save).not.toHaveBeenCalled()
	})

	it('excludes personal rows on legacy list, count, pagination and OR-filtered my routes', async () => {
		const headers = { authorization: 'Bearer existing', 'organization-id': 'org' }
		const excluded = Or(IsNull(), Not(ApiKeyBindingType.USER))
		const selectedUser = And(Equal(ApiKeyBindingType.USER), excluded)
		const params = new URLSearchParams({
			$where: JSON.stringify({ type: ApiKeyBindingType.USER }),
			$select: JSON.stringify({ token: true })
		})
		expect((await fetch(origin + '?' + params, { headers })).status).toBe(200)
		expect(repository.findAndCount).toHaveBeenLastCalledWith(
			expect.objectContaining({
				select: { token: true },
				where: { type: selectedUser, tenantId: owner.tenantId, organizationId: 'org' }
			})
		)
		expect((await fetch(origin + '/count?type=user', { headers })).status).toBe(200)
		expect(repository.count).toHaveBeenLastCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					type: expect.anything(),
					tenantId: owner.tenantId,
					organizationId: 'org'
				})
			})
		)
		const my = new URLSearchParams({
			data: JSON.stringify({ where: [{ type: ApiKeyBindingType.USER }, { id: 'key' }] })
		})
		expect((await fetch(origin + '/my?' + my, { headers })).status).toBe(200)
		expect(repository.findAndCount).toHaveBeenLastCalledWith(
			expect.objectContaining({
				where: [
					{ type: selectedUser, tenantId: owner.tenantId, organizationId: 'org', createdById: owner.id },
					{
						id: 'key',
						type: excluded,
						tenantId: owner.tenantId,
						organizationId: 'org',
						createdById: owner.id
					}
				]
			})
		)
		expect((await fetch(origin + '/pagination', { headers })).status).toBe(200)
		expect(repository.findAndCount).toHaveBeenLastCalledWith(
			expect.objectContaining({ where: expect.objectContaining({ type: excluded }) })
		)
	})

	it('denies legacy read, update, delete, soft-delete and recover for personal rows', async () => {
		const id = '9becdf78-75b7-412f-8e25-190cc7e72bc3'
		const headers = {
			authorization: 'Bearer existing',
			'organization-id': 'org',
			'content-type': 'application/json'
		}
		repository.findOne.mockResolvedValue(null)
		for (const [method, suffix] of [
			['GET', ''],
			['PUT', ''],
			['DELETE', ''],
			['DELETE', '/soft'],
			['PUT', '/recover']
		]) {
			const response = await fetch(origin + '/' + id + suffix, {
				method,
				headers,
				...(method === 'PUT' ? { body: JSON.stringify({ name: 'changed' }) } : {})
			})
			expect(response.status).toBe(404)
			expect(repository.findOne).toHaveBeenLastCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						id,
						tenantId: owner.tenantId,
						organizationId: 'org',
						type: expect.anything()
					})
				})
			)
		}
		for (const mutation of [repository.update, repository.delete, repository.softRemove, repository.recover])
			expect(mutation).not.toHaveBeenCalled()
	})

	it('preserves resource key creation and its trusted tenant/organization scope', async () => {
		repository.create.mockImplementation((value: Partial<ApiKey>) => Object.assign(new ApiKey(), value))
		repository.save.mockImplementation(async (value: ApiKey) => value)
		const response = await fetch(origin, {
			method: 'POST',
			headers: { authorization: 'Bearer existing', 'organization-id': 'org', 'content-type': 'application/json' },
			body: JSON.stringify({
				type: ApiKeyBindingType.WORKSPACE,
				entityId: 'workspace',
				token: 'custom-resource-token',
				tenantId: 'foreign',
				organizationId: 'foreign'
			})
		})
		expect(response.status).toBe(201)
		expect(repository.save).toHaveBeenCalledWith(
			expect.objectContaining({
				type: ApiKeyBindingType.WORKSPACE,
				entityId: 'workspace',
				token: 'custom-resource-token',
				tenantId: owner.tenantId,
				organizationId: 'org'
			})
		)
	})

	it('rejects the next request after the personal key is revoked through its management route', async () => {
		const id = '9becdf78-75b7-412f-8e25-190cc7e72bc3'
		const row = Object.assign(new ApiKey(), {
			id,
			type: ApiKeyBindingType.USER,
			token: hashPersonalApiKey(token),
			entityId: owner.id,
			userId: owner.id,
			tenantId: owner.tenantId,
			user: owner
		})
		repository.findOne.mockResolvedValue(row)
		repository.update.mockImplementation(async (_criteria: unknown, patch: Partial<ApiKey>) => {
			Object.assign(row, patch)
			return { affected: 1 }
		})
		const headers = { authorization: `Bearer ${token}` }
		expect((await fetch(origin + '/identity/ai', { headers })).status).toBe(200)
		expect(
			(
				await fetch(origin + '/personal/' + id, {
					method: 'DELETE',
					headers: { authorization: 'Bearer existing' }
				})
			).status
		).toBe(204)
		for (const path of ['/identity', '/identity/ai'])
			expect((await fetch(origin + path, { headers })).status).toBe(401)
	})

	it.each([{ validUntil: new Date(0) }, { revokedAt: new Date() }])(
		'rejects expired or revoked rows before recording usage: %j',
		async (change) => {
			repository.findOne.mockResolvedValue(
				Object.assign(new ApiKey(), {
					type: ApiKeyBindingType.USER,
					entityId: owner.id,
					userId: owner.id,
					tenantId: owner.tenantId,
					user: owner,
					...change
				})
			)
			for (const path of ['/identity', '/identity/ai'])
				expect((await fetch(origin + path, { headers: { authorization: `Bearer ${token}` } })).status).toBe(401)
			expect(repository.update).not.toHaveBeenCalled()
		}
	)
})
