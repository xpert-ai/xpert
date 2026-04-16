import { HTTP_CODE_METADATA } from '@nestjs/common/constants'
import { UnauthorizedException } from '@nestjs/common'

jest.mock('../core/context', () => ({
	RequestContext: {
		getScope: jest.fn(),
		currentUserId: jest.fn()
	}
}))

const { RequestContext } = require('../core/context')
const { AccountBindingController } = require('./account-binding.controller')

describe('AccountBindingController', () => {
	let accountBindingService: {
		getUserBinding: jest.Mock
		unbindUser: jest.Mock
	}
	let controller: InstanceType<typeof AccountBindingController>

	beforeEach(() => {
		jest.clearAllMocks()
		accountBindingService = {
			getUserBinding: jest.fn(),
			unbindUser: jest.fn().mockResolvedValue(undefined)
		}
		controller = new AccountBindingController(accountBindingService as any)
		RequestContext.getScope.mockReturnValue({
			tenantId: 'tenant-1',
			level: 'tenant',
			organizationId: null
		})
		RequestContext.currentUserId.mockReturnValue('user-1')
	})

	it('returns bound=false when the current user has no binding for the provider', async () => {
		accountBindingService.getUserBinding.mockResolvedValue(null)

		await expect(controller.getCurrentUserBinding('lark')).resolves.toEqual({
			provider: 'lark',
			bound: false
		})
	})

	it('returns the binding details when the current user is already bound', async () => {
		const updatedAt = new Date('2026-04-14T02:03:04.000Z')
		accountBindingService.getUserBinding.mockResolvedValue({
			subjectId: 'union-1',
			profile: { name: 'Alice' },
			updatedAt
		})

		await expect(controller.getCurrentUserBinding('lark')).resolves.toEqual({
			provider: 'lark',
			bound: true,
			subjectId: 'union-1',
			profile: { name: 'Alice' },
			updatedAt
		})
	})

	it('marks the delete endpoint as 204 and delegates unbind to the service', async () => {
		await expect(controller.unbindCurrentUser('lark')).resolves.toBeUndefined()
		expect(accountBindingService.unbindUser).toHaveBeenCalledWith({
			tenantId: 'tenant-1',
			userId: 'user-1',
			provider: 'lark'
		})
		expect(
			Reflect.getMetadata(
				HTTP_CODE_METADATA,
				AccountBindingController.prototype.unbindCurrentUser
			)
		).toBe(204)
	})

	it('rejects unauthenticated access', async () => {
		RequestContext.currentUserId.mockReturnValue(null)

		await expect(controller.getCurrentUserBinding('lark')).rejects.toBeInstanceOf(
			UnauthorizedException
		)
		await expect(controller.unbindCurrentUser('lark')).rejects.toBeInstanceOf(
			UnauthorizedException
		)
	})
})
