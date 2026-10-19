import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { UserGroupController } from './user-group.controller'
import { UserGroupService } from './user-group.service'
import { PermissionGuard } from '../shared/guards'
import { TransformInterceptor } from '../core/interceptors'

jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))

const groupId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'

describe('User group HTTP validation', () => {
	let app: INestApplication
	let origin: string
	const service = {
		create: jest.fn(),
		update: jest.fn(),
		updateMembers: jest.fn(),
		findOne: jest.fn(),
		findMemberCandidates: jest.fn()
	}

	function write(method: string, path: string, body: unknown) {
		return fetch(origin + path, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		})
	}

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [UserGroupController],
			providers: [{ provide: UserGroupService, useValue: service }]
		})
			.overrideGuard(PermissionGuard)
			.useValue({ canActivate: () => true })
			.overrideInterceptor(TransformInterceptor)
			.useValue({ intercept: (_context, next) => next.handle() })
			.compile()
		app = module.createNestApplication()
		await app.listen(0, '127.0.0.1')
		origin = await app.getUrl()
	})
	beforeEach(() => {
		jest.clearAllMocks()
		service.create.mockResolvedValue({ id: groupId })
		service.findOne.mockResolvedValue({ id: groupId })
		service.updateMembers.mockResolvedValue({ id: groupId })
		service.findMemberCandidates.mockResolvedValue([{ id: userId }])
	})
	afterAll(async () => app?.close())

	it('routes candidate lookup before the generic ID route', async () => {
		const response = await fetch(origin + '/member-candidates?organizationId=org-a')
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual([{ id: userId }])
		expect(service.findMemberCandidates).toHaveBeenCalledWith('org-a')
		expect(service.findOne).not.toHaveBeenCalled()
	})

	it('parses create and update bodies and strips client-supplied scope and identity', async () => {
		const body = {
			name: '  Group  ',
			members: [{ id: userId, email: 'spoofed' }],
			organizationId: 'org-b',
			tenantId: 'tenant-b',
			id: 'group-b'
		}
		const expected = { name: 'Group', members: [{ id: userId }] }
		expect((await write('POST', '/', body)).status).toBe(201)
		expect(service.create).toHaveBeenCalledWith(expected)
		expect((await write('PUT', `/${groupId}`, body)).status).toBe(200)
		expect(service.update).toHaveBeenCalledWith(groupId, expected)
	})

	it.each([null, {}, [null], [{ id: 'not-a-uuid' }], ['not-an-object']])(
		'rejects malformed inline members %j on both writes',
		async (members) => {
			expect((await write('POST', '/', { name: 'Group', members })).status).toBe(400)
			expect((await write('PUT', `/${groupId}`, { members })).status).toBe(400)
			expect(service.create).not.toHaveBeenCalled()
			expect(service.update).not.toHaveBeenCalled()
		}
	)

	it.each([{}, { memberIds: [userId] }, [null], ['bad-id'], [42]])(
		'rejects malformed member ID payloads %j',
		async (body) => {
			expect((await write('PUT', `/${groupId}/members`, body)).status).toBe(400)
			expect(service.updateMembers).not.toHaveBeenCalled()
		}
	)

	it('allows empty member lists to remove all existing memberships', async () => {
		expect((await write('PUT', `/${groupId}/members?organizationId=org-a`, [])).status).toBe(200)
		expect(service.updateMembers).toHaveBeenCalledWith(groupId, [], 'org-a')
	})
})
