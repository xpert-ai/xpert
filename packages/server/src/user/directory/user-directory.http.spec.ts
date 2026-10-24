jest.mock('../user.entity', () => ({ User: class User {} }))

import { type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PermissionsEnum, UserType } from '@xpert-ai/contracts'
import { PermissionGuard } from '../../shared/guards/permission.guard'
import { TenantPermissionGuard } from '../../shared/guards/tenant-permission.guard'
import { UserDirectoryController } from './user-directory.controller'
import { UserDirectoryService } from './user-directory.service'

describe('user directory HTTP query validation', () => {
	let app: INestApplication
	let origin: string
	const directory = { list: jest.fn(async () => ({ items: [], total: 0 })) }

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [UserDirectoryController],
			providers: [{ provide: UserDirectoryService, useValue: directory }]
		})
			.overrideGuard(TenantPermissionGuard)
			.useValue({ canActivate: () => true })
			.overrideGuard(PermissionGuard)
			.useValue({ canActivate: () => true })
			.compile()
		app = module.createNestApplication({ logger: false })
		app.setGlobalPrefix('user')
		await app.listen(0, '127.0.0.1')
		origin = await app.getUrl()
	})
	beforeEach(() => jest.clearAllMocks())
	afterAll(() => app?.close())

	const request = (data: unknown) =>
		fetch(`${origin}/user/directory?data=${encodeURIComponent(JSON.stringify(data))}`)

	it('parses defaults and numeric paging strings through the HTTP pipe', async () => {
		const response = await request({ take: '50', skip: '100' })
		expect(response.status).toBe(200)
		expect(directory.list).toHaveBeenCalledWith({
			take: 50,
			skip: 100,
			search: '',
			types: [UserType.USER],
			status: 'all',
			roles: [],
			organizationIds: []
		})
		expect(await response.json()).toEqual({ items: [], total: 0 })
	})

	it.each([
		{ take: 0 },
		{ take: 101 },
		{ skip: -1 },
		{ skip: 1.5 },
		{ take: 'all' },
		{ status: 'unknown' },
		{ organizationIds: ['bad-id'] },
		{ types: ['admin'] },
		{ tenantId: 'other' },
		{ relations: ['hash'] }
	])('rejects invalid or unexpected query fields: %j', async (data) => {
		expect((await request(data)).status).toBe(400)
		expect(directory.list).not.toHaveBeenCalled()
	})

	it('retains tenant and user-directory permission guards', () => {
		const handler = UserDirectoryController.prototype.list
		expect(Reflect.getMetadata('__guards__', handler)).toEqual([TenantPermissionGuard, PermissionGuard])
		expect(Reflect.getMetadata('permissions', handler)).toEqual([
			PermissionsEnum.ALL_ORG_VIEW,
			PermissionsEnum.ALL_ORG_EDIT,
			PermissionsEnum.ORG_USERS_VIEW,
			PermissionsEnum.ORG_USERS_EDIT
		])
	})
})
