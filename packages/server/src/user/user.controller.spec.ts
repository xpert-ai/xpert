import { UserType } from '@xpert-ai/contracts'
import { In, Not } from 'typeorm'
import { ApiKeyOrClientSecretAuthGuard } from './../shared/guards'
import { UserController } from './user.controller'

describe('UserController', () => {
	function createController() {
		const userService = {
			findAll: jest.fn().mockResolvedValue({ items: [], total: 0 })
		}
		const factoryResetService = {}
		const commandBus = {}

		const controller = new UserController(userService as any, factoryResetService as any, commandBus as any)

		return {
			controller,
			userService
		}
	}

	it('excludes technical users by default for the user list', async () => {
		const { controller, userService } = createController()

		await controller.findAll({
			relations: ['role']
		})

		expect(userService.findAll).toHaveBeenCalledWith({
			where: {
				type: Not(UserType.COMMUNICATION)
			},
			relations: ['role'],
			withDeleted: false
		})
	})

	it('includes explicitly requested user types in the user list', async () => {
		const { controller, userService } = createController()

		await controller.findAll({
			relations: ['role'],
			types: [UserType.USER, UserType.COMMUNICATION, 'unknown'],
			withDeleted: true
		})

		expect(userService.findAll).toHaveBeenCalledWith({
			where: {
				type: In([UserType.USER, UserType.COMMUNICATION])
			},
			relations: ['role'],
			withDeleted: true
		})
	})

	it('allows the current-user endpoint to authenticate USER_XPERT client secrets', () => {
		const handler = UserController.prototype.findMe
		const guards = Reflect.getMetadata('__guards__', handler) as unknown[]

		expect(Reflect.getMetadata('isPublic', handler)).toBe(true)
		expect(guards).toContain(ApiKeyOrClientSecretAuthGuard)
	})
})
