import { CanActivate, ExecutionContext, INestApplication, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { IUser, TagCategoryEnum } from '@xpert-ai/contracts'
import { RequestContextMiddleware } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { RequestContextMiddleware as LegacyContext } from '../core/context/request-context.middleware'
import { Organization } from '../organization/organization.entity'
import { EndpointPermissionInterceptor } from '../shared/guards/endpoint-permission.interceptor'
import { createAuthorizationDatabase, seedAuthorizationDatabase } from '../shared/testing/authorization-db.test-fixture'
import { ResolveUserOrganizationAccessHandler } from '../user-organization/commands/handlers/resolve-user-organization-access.handler'
import { ResolveUserOrganizationAccessCommand } from '../user-organization/commands/resolve-user-organization-access.command'
import { UserOrganization } from '../user-organization/user-organization.entity'
import { ExecutionUserLoader } from '../user/execution-identity/execution-user-loader'
import { User } from '../user/user.entity'
import { TagController } from './tag.controller'
import { Tag } from './tag.entity'
import { TagManagementService } from './tag-management.service'
import { TagService } from './tag.service'

@Injectable()
class FixtureLogin implements CanActivate {
	constructor(private readonly users: ExecutionUserLoader) {}
	async canActivate(context: ExecutionContext) {
		const req = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: IUser }>()
		const id = req.headers.authorization
		if (!id) throw new UnauthorizedException()
		req.user = await this.users.load(id, id === 'foreign' ? 'tenant-b' : 'tenant-a')
		if (!req.user || req.user.isActive === false) throw new UnauthorizedException()
		return true
	}
}

describe('Scoped tag catalog HTTP access', () => {
	let db: DataSource, app: INestApplication, origin: string
	let management: TagManagementService
	const localId = '0ec4f223-dba3-4ed0-b768-90600c2747be'
	beforeAll(async () => {
		db = await createAuthorizationDatabase()
		const access = new ResolveUserOrganizationAccessHandler(
			db.getRepository(User),
			db.getRepository(UserOrganization),
			db.getRepository(Organization)
		)
		const module = await Test.createTestingModule({
			controllers: [TagController],
			providers: [
				TagService,
				TagManagementService,
				ExecutionUserLoader,
				FixtureLogin,
				{ provide: getRepositoryToken(Tag), useValue: db.getRepository(Tag) },
				{ provide: getRepositoryToken(User), useValue: db.getRepository(User) },
				{
					provide: CommandBus,
					useValue: { execute: (command: ResolveUserOrganizationAccessCommand) => access.execute(command) }
				}
			]
		}).compile()
		management = module.get(TagManagementService)
		app = module.createNestApplication({ logger: false })
		app.setGlobalPrefix('tags')
		for (const middleware of [new LegacyContext(), new RequestContextMiddleware()])
			app.use(middleware.use.bind(middleware))
		app.useGlobalGuards(module.get(FixtureLogin))
		app.useGlobalInterceptors(new EndpointPermissionInterceptor(module.get(Reflector)))
		await app.listen(0, '127.0.0.1')
		origin = (await app.getUrl()) + '/tags'
	})
	afterAll(async () => {
		await app?.close()
		await db?.destroy()
	})
	beforeEach(async () => {
		jest.restoreAllMocks()
		await db.synchronize(true)
		await seedAuthorizationDatabase(db)
		await db.getRepository(Tag).save([
			{
				id: localId,
				tenantId: 'tenant-a',
				organizationId: 'org-a',
				name: 'Local',
				category: TagCategoryEnum.XPERT,
				createdById: 'private-creator'
			},
			{
				id: 'shared',
				tenantId: 'tenant-a',
				organizationId: null,
				name: 'Shared',
				category: TagCategoryEnum.TOOLSET
			},
			{
				id: 'other-org',
				tenantId: 'tenant-a',
				organizationId: 'org-other',
				name: 'Other organization',
				category: TagCategoryEnum.STORY
			},
			{
				id: 'foreign-shared',
				tenantId: 'tenant-b',
				organizationId: null,
				name: 'Foreign shared',
				category: TagCategoryEnum.INDICATOR
			},
			{
				id: 'foreign-org',
				tenantId: 'tenant-b',
				organizationId: 'org-foreign',
				name: 'Foreign organization',
				category: TagCategoryEnum.INDICATOR
			}
		])
	})
	function request(path = '', extra: Record<string, string> = {}, method = 'GET') {
		return fetch(origin + path, {
			method,
			headers: { authorization: 'reader', 'organization-id': 'org-a', ...extra }
		})
	}

	it('allows an ordinary reader only current organization and tenant-shared catalog definitions', async () => {
		const response = await request()
		expect(response.status).toBe(200)
		const result = await response.json()
		expect(result.total).toBe(2)
		expect(result.items.map((tag: { id: string }) => tag.id)).toEqual([localId, 'shared'])
		expect(JSON.stringify(result)).not.toContain('private-creator')
		expect(result.items[0]).not.toHaveProperty('createdById')
		const categories = await request('/categories')
		expect(categories.status).toBe(200)
		expect(await categories.json()).toEqual(
			expect.arrayContaining([{ category: TagCategoryEnum.XPERT }, { category: TagCategoryEnum.TOOLSET }])
		)
	})

	it('never accepts caller-selected relations, fields or scope filters in the ordinary catalog', async () => {
		const query = new URLSearchParams({
			data: JSON.stringify({
				where: [{ tenantId: 'tenant-b' }, { organizationId: 'org-other' }],
				relations: ['users'],
				select: ['createdById']
			}),
			$relations: JSON.stringify(['users']),
			$select: JSON.stringify({ createdById: true })
		})
		const response = await request('?' + query)
		expect(response.status).toBe(200)
		const result = await response.json()
		expect(result.items.map((tag: { id: string }) => tag.id)).toEqual([localId, 'shared'])
		for (const item of result.items) {
			expect(item).not.toHaveProperty('users')
			expect(item).not.toHaveProperty('createdById')
		}
	})

	it('keeps tenant scope limited to shared definitions in the authenticated tenant', async () => {
		for (const [actor, expected] of [
			['reader', 'shared'],
			['foreign', 'foreign-shared']
		]) {
			const response = await fetch(origin, { headers: { authorization: actor, 'x-scope-level': 'tenant' } })
			expect(response.status).toBe(200)
			expect((await response.json()).items.map((tag: { id: string }) => tag.id)).toEqual([expected])
		}
	})

	it('rejects anonymous, cross-tenant and unauthorized organization reads', async () => {
		expect((await fetch(origin)).status).toBe(401)
		for (const path of ['', '/categories']) {
			expect((await request(path, { 'tenant-id': 'tenant-b' })).status).toBe(403)
			for (const organizationId of ['org-other', 'org-foreign'])
				expect((await request(path, { 'organization-id': organizationId })).status).toBe(403)
		}
		await db.getRepository(UserOrganization).update('reader', { isActive: false })
		expect((await request()).status).toBe(403)
	})

	it('keeps directory, inherited CRUD reads and every mutation management-only', async () => {
		const write = jest.spyOn(management, 'write'),
			remove = jest.spyOn(management, 'remove')
		for (const path of ['/directory', '/count', '/pagination', '/my', '/' + localId])
			expect((await request(path)).status).toBe(403)
		for (const [method, path] of [
			['POST', ''],
			['PUT', '/' + localId],
			['DELETE', '/' + localId],
			['DELETE', '/' + localId + '/soft'],
			['PUT', '/' + localId + '/recover']
		])
			expect((await request(path, {}, method)).status).toBe(403)
		expect(write).not.toHaveBeenCalled()
		expect(remove).not.toHaveBeenCalled()
		expect(await db.getRepository(Tag).count()).toBe(5)
	})

	it('retains authorized management directory access and shared-tag write protection', async () => {
		const response = await request('/directory', { authorization: 'manager' })
		expect(response.status).toBe(200)
		const result = await response.json()
		expect(result.map((tag: { id: string }) => tag.id)).toEqual([localId, 'shared'])
		expect(result.find((tag: { id: string }) => tag.id === localId).editable).toBe(true)
		expect(result.find((tag: { id: string }) => tag.id === 'shared').editable).toBe(false)
	})
})
