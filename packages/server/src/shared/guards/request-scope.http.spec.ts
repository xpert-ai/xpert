import {
	Body,
	CanActivate,
	Controller,
	ExecutionContext,
	Get,
	INestApplication,
	Injectable,
	Post,
	UseGuards,
	UnauthorizedException
} from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import type { IUser } from '@xpert-ai/contracts'
import { TenantScopeGuard } from './tenant-scope.guard'
import { resolveAuthenticatedRequestScope } from './request-scope'

@Injectable()
class Identity implements CanActivate {
	canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: Partial<IUser> }>()
		if (request.headers.authorization !== 'scope-fixture') throw new UnauthorizedException()
		request.user = { id: 'user', tenantId: 'tenant', isActive: true }
		return true
	}
}
@Controller('scope')
@UseGuards(TenantScopeGuard)
class ScopedController {
	@Get() read() {
		return { ok: true }
	}
	@Post() write(@Body() _body: unknown) {
		return { ok: true }
	}
}

describe('authenticated request scope', () => {
	let app: INestApplication, origin: string
	const execute = jest.fn()
	const headers = { authorization: 'scope-fixture' }
	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [ScopedController],
			providers: [Identity, TenantScopeGuard, { provide: CommandBus, useValue: { execute } }]
		}).compile()
		app = module.createNestApplication({ logger: false })
		app.useGlobalGuards(module.get(Identity))
		await app.listen(0, '127.0.0.1')
		origin = await app.getUrl()
	})
	afterAll(() => app.close())
	beforeEach(() => execute.mockReset().mockResolvedValue({ id: 'user' }))
	it('uses authenticated tenant when omitted and handles HTTP header casing', async () => {
		expect((await fetch(`${origin}/scope`, { headers })).status).toBe(200)
		expect((await fetch(`${origin}/scope`, { headers: { ...headers, 'TENANT-ID': 'tenant' } })).status).toBe(200)
		expect(execute).not.toHaveBeenCalled()
	})
	it('rejects anonymous access and foreign header, query and body tenant scopes', async () => {
		expect((await fetch(`${origin}/scope`)).status).toBe(401)
		for (const query of [
			'',
			'?tenantId=other',
			'?data=' + encodeURIComponent(JSON.stringify({ findInput: { tenantId: 'other' } }))
		]) {
			expect(
				(
					await fetch(`${origin}/scope${query}`, {
						headers: { ...headers, 'tenant-id': query ? 'tenant' : 'other' }
					})
				).status
			).toBe(403)
		}
		expect(
			(
				await fetch(`${origin}/scope`, {
					method: 'POST',
					headers: { ...headers, 'tenant-id': 'tenant', 'content-type': 'application/json' },
					body: JSON.stringify({ tenant: { id: 'other' } })
				})
			).status
		).toBe(403)
		expect(execute).not.toHaveBeenCalled()
	})
	it('revalidates organization access without replacing the principal or its effective grants', async () => {
		for (const allowed of [true, false, true]) {
			execute.mockResolvedValue(
				allowed ? { id: 'user', role: { rolePermissions: ['broader-database-policy'] } } : null
			)
			expect(
				(
					await fetch(`${origin}/scope`, {
						headers: { ...headers, 'organization-id': 'org', 'x-scope-level': 'organization' }
					})
				).status
			).toBe(allowed ? 200 : 403)
		}
		expect(execute).toHaveBeenLastCalledWith(
			expect.objectContaining({
				input: { tenantId: 'tenant', organizationId: 'org', userId: 'user', allowServiceAccounts: true }
			})
		)
	})
	it.each([
		{ 'x-scope-level': 'organization' },
		{ 'x-scope-level': 'unknown' },
		{ 'x-scope-level': 'tenant', 'organization-id': 'org' }
	])('rejects inconsistent scope headers %j', async (scope) => {
		expect((await fetch(`${origin}/scope`, { headers: { ...headers, ...scope } })).status).toBe(400)
	})
	it('rejects ambiguous headers before trusting a scope', () => {
		expect(() =>
			resolveAuthenticatedRequestScope(
				{ id: 'user', tenantId: 'tenant' },
				{ headers: { 'tenant-id': ['tenant', 'other'] } }
			)
		).toThrow()
		expect(() =>
			resolveAuthenticatedRequestScope(
				{ id: 'user', tenantId: 'tenant' },
				{ headers: { 'tenant-id': 'tenant', 'Tenant-Id': 'other' } }
			)
		).toThrow()
	})
})
