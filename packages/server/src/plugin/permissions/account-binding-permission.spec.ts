import { UnauthorizedException } from '@nestjs/common'
import {
	ACCOUNT_BINDING_PERMISSION_SERVICE_TOKEN,
	type Permissions
} from '@xpert-ai/plugin-sdk'

jest.mock('@xpert-ai/plugin-sdk', () => {
	const actual = jest.requireActual('@xpert-ai/plugin-sdk')

	return {
		...actual,
		RequestContext: {
			getScope: jest.fn(),
			currentUserId: jest.fn()
		}
	}
})

const { RequestContext } = require('@xpert-ai/plugin-sdk')
const {
	assertPermissionForToken
} = require('./index')
const {
	createGuardedAccountBindingPermissionService,
	PluginAccountBindingPermissionService
} = require('./account-binding-permission')

describe('Account binding plugin permissions', () => {
	let accountBindingService: {
		bindUser: jest.Mock
		resolveUser: jest.Mock
		unbindUser: jest.Mock
	}
	let moduleRef: {
		get: jest.Mock
	}
	let service: InstanceType<typeof PluginAccountBindingPermissionService>

	beforeEach(() => {
		jest.clearAllMocks()
		accountBindingService = {
			bindUser: jest.fn().mockResolvedValue({
				provider: 'lark',
				subjectId: 'union-1'
			}),
			resolveUser: jest.fn().mockResolvedValue({
				id: 'user-1'
			}),
			unbindUser: jest.fn().mockResolvedValue(undefined)
		}
		moduleRef = {
			get: jest.fn().mockReturnValue(accountBindingService)
		}
		service = new PluginAccountBindingPermissionService(moduleRef as any)

		RequestContext.getScope.mockReturnValue({
			tenantId: 'tenant-1',
			level: 'tenant',
			organizationId: null
		})
		RequestContext.currentUserId.mockReturnValue('user-1')
	})

	it('blocks token resolution when account_binding permission is not declared', () => {
		expect(() =>
			assertPermissionForToken(
				'demo-plugin',
				ACCOUNT_BINDING_PERMISSION_SERVICE_TOKEN,
				new Set(['user'])
			)
		).toThrow(/without declaring 'account_binding' permission/)
	})

	it('denies bind and unbind when only read operation is declared', async () => {
		const guardedService = createGuardedAccountBindingPermissionService(
			'demo-plugin',
			service,
			[
				{
					type: 'account_binding',
					operations: ['read']
				}
			] as Permissions
		)

		expect(() =>
			guardedService.bindCurrentUser({
				provider: 'lark',
				subjectId: 'union-1'
			})
		).toThrow(/operation 'write'/)
		expect(() => guardedService.unbindCurrentUser('lark')).toThrow(/operation 'delete'/)
	})

	it('denies providers that are not declared in account_binding.providers', async () => {
		const guardedService = createGuardedAccountBindingPermissionService(
			'demo-plugin',
			service,
			[
				{
					type: 'account_binding',
					operations: ['read'],
					providers: ['lark']
				}
			] as Permissions
		)

		expect(() =>
			guardedService.resolveBoundUser({
				provider: 'github',
				subjectId: 'subject-1'
			})
		).toThrow(/account_binding\.providers/)
	})

	it('returns null from resolveBoundUser when there is no tenant scope', async () => {
		RequestContext.getScope.mockReturnValue({
			tenantId: null,
			level: 'tenant',
			organizationId: null
		})

		await expect(
			service.resolveBoundUser({
				provider: 'lark',
				subjectId: 'union-1'
			})
		).resolves.toBeNull()
		expect(accountBindingService.resolveUser).not.toHaveBeenCalled()
	})

	it('resolves bound user with explicit tenantId even when request context has no tenant scope', async () => {
		RequestContext.getScope.mockReturnValue({
			tenantId: null,
			level: 'tenant',
			organizationId: null
		})

		await expect(
			service.resolveBoundUser({
				provider: 'lark',
				subjectId: 'union-1',
				tenantId: 'tenant-from-input'
			})
		).resolves.toEqual({
			id: 'user-1'
		})
		expect(accountBindingService.resolveUser).toHaveBeenCalledWith({
			tenantId: 'tenant-from-input',
			provider: 'lark',
			subjectId: 'union-1'
		})
	})

	it('fails bindCurrentUser when there is no logged-in user', async () => {
		RequestContext.currentUserId.mockReturnValue(null)

		await expect(
			service.bindCurrentUser({
				provider: 'lark',
				subjectId: 'union-1'
			})
		).rejects.toBeInstanceOf(UnauthorizedException)
	})

	it('ignores plugin-supplied tenantId and userId when binding the current user', async () => {
		await expect(
			service.bindCurrentUser({
				provider: 'lark',
				subjectId: 'union-1',
				tenantId: 'forged-tenant',
				userId: 'forged-user'
			} as any)
		).resolves.toEqual({
			provider: 'lark',
			subjectId: 'union-1'
		})

		expect(accountBindingService.bindUser).toHaveBeenCalledWith({
			tenantId: 'tenant-1',
			userId: 'user-1',
			provider: 'lark',
			subjectId: 'union-1',
			profile: undefined
		})
	})

	it('fails unbindCurrentUser when there is no logged-in user', async () => {
		RequestContext.currentUserId.mockReturnValue(null)

		await expect(service.unbindCurrentUser('lark')).rejects.toBeInstanceOf(UnauthorizedException)
	})
})
