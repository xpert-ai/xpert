// Exercise the real Passport strategy and route guard; isolate credential storage and domain permissions.
jest.mock('../api-key/api-key.service', () => ({ ApiKeyService: class {} }))
jest.mock('../user', () => ({ UserService: class {} }))

import {
	Controller,
	ForbiddenException,
	Get,
	INestApplication,
	Injectable,
	Logger,
	NotFoundException,
	UseGuards
} from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { PassportModule, PassportStrategy } from '@nestjs/passport'
import { Test } from '@nestjs/testing'
import { ApiKeyBindingType, ISecretToken, SecretTokenBindingType, UserType } from '@xpert-ai/contracts'
import type { AddressInfo } from 'node:net'
import { DataSource, EntityNotFoundError } from 'typeorm'
import { Strategy } from 'passport'
import { AllowClientSecretBindings } from '../shared/decorators/allowed-client-secret-bindings.decorator'
import { ApiKeyService } from '../api-key/api-key.service'
import { UserService } from '../user'
import { ApiKeyOrClientSecretAuthGuard } from '../shared/guards/api-key-or-client-secret.guard'
import { SecretTokenService } from './secret-token.service'
import { SecretTokenStrategy } from './secret-token.strategy'

const secret = 'cs-x-private-test-value'
const digest = 'sha256:private-test-digest'
const credentialId = '10000000-0000-4000-8000-000000000099'
@Controller('diagnostics-test')
@UseGuards(ApiKeyOrClientSecretAuthGuard)
class TestController {
	@Get() read() {
		return { ok: true }
	}
	@Get('conversation')
	@AllowClientSecretBindings(SecretTokenBindingType.USER_CONVERSATION)
	conversation() {
		return { ok: true }
	}
}

@Injectable()
class RejectedApiKey extends PassportStrategy(Strategy, 'api-key') {
	validate() {
		return null
	}
	authenticate() {
		this.fail()
	}
}
@Injectable()
class AcceptedJwt extends PassportStrategy(Strategy, 'jwt') {
	validate() {
		return null
	}
	authenticate() {
		this.success({ id: 'jwt-user' })
	}
}

function record(overrides: Partial<ISecretToken> = {}) {
	return {
		id: credentialId,
		token: digest,
		type: SecretTokenBindingType.USER_XPERT,
		tenantId: 'tenant',
		organizationId: 'org',
		createdById: 'user',
		entityId: 'assistant',
		validUntil: new Date(Date.now() + 60_000),
		...overrides
	}
}

describe('client-secret failure diagnostics over HTTP', () => {
	let app: INestApplication
	let endpoint: string
	let warnings: jest.SpyInstance
	const credentials = { findBySecret: jest.fn() }
	const users = { findOneByIdWithinTenant: jest.fn() }
	const queries = { execute: jest.fn() }
	const keys = { findOneOrFailByIdString: jest.fn(), recordUse: jest.fn(), resolvePrincipal: jest.fn() }

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			imports: [PassportModule.register({ session: false })],
			controllers: [TestController],
			providers: [
				SecretTokenStrategy,
				RejectedApiKey,
				AcceptedJwt,
				ApiKeyOrClientSecretAuthGuard,
				{ provide: SecretTokenService, useValue: credentials },
				{ provide: UserService, useValue: users },
				{ provide: ApiKeyService, useValue: keys },
				{ provide: DataSource, useValue: {} },
				{ provide: QueryBus, useValue: queries }
			]
		}).compile()
		app = module.createNestApplication({ logger: false })
		await app.listen(0, '127.0.0.1')
		endpoint = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/diagnostics-test`
	})
	beforeEach(() => {
		jest.resetAllMocks()
		credentials.findBySecret.mockResolvedValue(record({ validUntil: new Date(0) }))
		users.findOneByIdWithinTenant.mockResolvedValue({ id: 'user', tenantId: 'tenant', type: UserType.USER })
		warnings = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
	})
	afterEach(() => jest.restoreAllMocks())
	afterAll(async () => app?.close())

	it('correlates an expired credential rejection without exposing secret material', async () => {
		const response = await fetch(`${endpoint}?secret=${secret}`, {
			headers: { authorization: `Bearer ${secret}`, 'x-request-id': secret }
		})
		expect(response.status).toBe(401)
		expect(await response.json()).toMatchObject({ statusCode: 401, message: 'Unauthorized' })
		expect(warnings).toHaveBeenCalledTimes(1)
		const [line] = warnings.mock.calls[0]
		expect(JSON.parse(line)).toMatchObject({
			event: 'auth.client_secret.failed',
			reason: 'expired',
			stage: 'credential_validation',
			credentialId,
			requestId: response.headers.get('x-request-id')
		})
		expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
		expect(line).not.toContain(secret)
		expect(line).not.toContain(digest)
		expect(queries.execute).not.toHaveBeenCalled()
	})
	function expectFailure(response: Response, details: object) {
		expect(warnings).toHaveBeenCalledTimes(1)
		const [line] = warnings.mock.calls[0]
		expect(JSON.parse(line)).toMatchObject({
			event: 'auth.client_secret.failed',
			requestId: response.headers.get('x-request-id'),
			statusCode: response.status,
			...details
		})
		expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
		expect(line).not.toContain(secret)
		expect(line).not.toContain(digest)
		return JSON.parse(line)
	}

	it('distinguishes a missing credential without inventing its record ID', async () => {
		credentials.findBySecret.mockRejectedValue(new NotFoundException(`${secret} ${digest}`))
		const response = await fetch(endpoint, { headers: { 'x-client-secret': secret } })
		expect(response.status).toBe(401)
		expect(expectFailure(response, { reason: 'not_found', stage: 'credential_lookup' })).not.toHaveProperty(
			'credentialId'
		)
		expect(users.findOneByIdWithinTenant).not.toHaveBeenCalled()
	})

	it('distinguishes infrastructure errors without logging exception text or changing the 401 response', async () => {
		credentials.findBySecret.mockRejectedValue(new Error(`query failed for ${secret} ${digest}`))
		const response = await fetch(endpoint, { headers: { authorization: `Bearer ${secret}` } })
		expect(response.status).toBe(401)
		expectFailure(response, { reason: 'internal_error', stage: 'credential_lookup' })
	})

	it('distinguishes invalid credential metadata from expiry', async () => {
		credentials.findBySecret.mockResolvedValue(record({ validUntil: null }))
		const response = await fetch(endpoint, { headers: { 'x-client-secret': secret } })
		expect(response.status).toBe(401)
		expectFailure(response, { reason: 'invalid', stage: 'credential_validation', credentialId })
		expect(users.findOneByIdWithinTenant).not.toHaveBeenCalled()
	})

	it('identifies a missing principal without confusing it with a missing credential', async () => {
		credentials.findBySecret.mockResolvedValue(record())
		users.findOneByIdWithinTenant.mockRejectedValue(new NotFoundException(`${secret} ${digest}`))
		const response = await fetch(endpoint, { headers: { 'x-client-secret': secret } })
		expect(response.status).toBe(401)
		expectFailure(response, { reason: 'not_found', stage: 'principal', credentialId })
	})

	it('logs a route binding denial once and preserves the 403', async () => {
		credentials.findBySecret.mockResolvedValue(record({ type: SecretTokenBindingType.USER_CONVERSATION }))
		const response = await fetch(endpoint, { headers: { authorization: `Bearer ${secret}` } })
		expect(response.status).toBe(403)
		expectFailure(response, { reason: 'scope_denied', stage: 'route_binding', credentialId })
	})

	it('logs a revoked live grant without exposing the policy exception', async () => {
		credentials.findBySecret.mockResolvedValue(record())
		queries.execute.mockRejectedValue(new ForbiddenException(`${secret} ${digest}`))
		const response = await fetch(endpoint, { headers: { authorization: `Bearer ${secret}` } })
		expect(response.status).toBe(403)
		expectFailure(response, { reason: 'scope_denied', stage: 'grant', credentialId })
	})

	it.each([SecretTokenBindingType.USER_XPERT, SecretTokenBindingType.USER_CONVERSATION])(
		'keeps successful %s authentication silent',
		async (type) => {
			credentials.findBySecret.mockResolvedValue(record({ type }))
			const path = type === SecretTokenBindingType.USER_CONVERSATION ? '/conversation' : ''
			const response = await fetch(endpoint + path, { headers: { authorization: `Bearer ${secret}` } })
			expect(response.status).toBe(200)
			expect(await response.json()).toEqual({ ok: true })
			expect(warnings).not.toHaveBeenCalled()
		}
	)

	it('does not log a rejected API-key probe when JWT fallback succeeds', async () => {
		const response = await fetch(endpoint, { headers: { authorization: 'Bearer jwt-test-value' } })
		expect(response.status).toBe(200)
		expect(credentials.findBySecret).not.toHaveBeenCalled()
		expect(warnings).not.toHaveBeenCalled()
	})

	it('identifies an expired parent API key while retaining the client-secret record ID', async () => {
		credentials.findBySecret.mockResolvedValue(record({ type: SecretTokenBindingType.API_KEY }))
		keys.findOneOrFailByIdString.mockResolvedValue({
			record: {
				id: 'parent-key',
				type: ApiKeyBindingType.ASSISTANT,
				validUntil: new Date(0)
			}
		})
		const response = await fetch(endpoint, { headers: { authorization: `Bearer ${secret}` } })
		expect(response.status).toBe(401)
		expectFailure(response, { reason: 'expired', stage: 'api_key', credentialId })
		expect(keys.recordUse).not.toHaveBeenCalled()
	})

	it.each([
		['not_found', new EntityNotFoundError('ApiKey', { id: secret })],
		['internal_error', new Error(`query failed for ${secret} ${digest}`)]
	])('classifies a failed parent API-key lookup as %s', async (reason, error) => {
		credentials.findBySecret.mockResolvedValue(record({ type: SecretTokenBindingType.API_KEY }))
		keys.findOneOrFailByIdString.mockResolvedValue({ success: false, error })
		const response = await fetch(endpoint, { headers: { authorization: `Bearer ${secret}` } })
		expect(response.status).toBe(401)
		expect(await response.json()).toMatchObject({ statusCode: 401, message: 'Unauthorized' })
		expectFailure(response, { reason, stage: 'api_key', credentialId })
		expect(keys.recordUse).not.toHaveBeenCalled()
	})

	it('does not echo an invalid record ID into logs', async () => {
		credentials.findBySecret.mockResolvedValue(record({ id: secret, validUntil: new Date(0) }))
		const response = await fetch(endpoint, { headers: { authorization: `Bearer ${secret}` } })
		expect(response.status).toBe(401)
		expect(expectFailure(response, { reason: 'expired' })).not.toHaveProperty('credentialId')
	})

	it('keeps correlation and record identity isolated across overlapping requests', async () => {
		const secondId = '10000000-0000-4000-8000-000000000098'
		let release!: () => void
		let started!: () => void
		const pending = new Promise<void>((resolve) => {
			release = resolve
		})
		const firstLookup = new Promise<void>((resolve) => {
			started = resolve
		})
		credentials.findBySecret.mockImplementation(async (value: string) => {
			if (value === secret) {
				started()
				await pending
			}
			return record({ id: value === secret ? credentialId : secondId, validUntil: new Date(0) })
		})
		const first = fetch(endpoint, { headers: { authorization: `Bearer ${secret}` } })
		try {
			await firstLookup
			const second = await fetch(endpoint, { headers: { 'x-client-secret': 'cs-x-second-secret' } })
			release()
			const response = await first
			expect(response.status).toBe(401)
			expect(second.status).toBe(401)
			expect(response.headers.get('x-request-id')).not.toBe(second.headers.get('x-request-id'))
			expect(warnings).toHaveBeenCalledTimes(2)
			expect(warnings.mock.calls.map(([line]) => JSON.parse(line))).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ credentialId, requestId: response.headers.get('x-request-id') }),
					expect.objectContaining({ credentialId: secondId, requestId: second.headers.get('x-request-id') })
				])
			)
		} finally {
			release()
			await first
		}
	})
})
