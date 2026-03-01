import { XpertPublishCommand } from './commands'
import { XpertService } from './xpert.service'

describe('XpertService command facade', () => {
	function createService() {
		const repository = {
			findOne: jest.fn(),
			save: jest.fn(),
			find: jest.fn(),
			findOneBy: jest.fn(),
			count: jest.fn(),
			createQueryBuilder: jest.fn().mockReturnValue({
				innerJoin: jest.fn().mockReturnThis(),
				where: jest.fn().mockReturnThis(),
				select: jest.fn().mockReturnThis(),
				getMany: jest.fn().mockResolvedValue([]),
				leftJoinAndSelect: jest.fn().mockReturnThis(),
				addOrderBy: jest.fn().mockReturnThis(),
				take: jest.fn().mockReturnThis()
			})
		}
		const storeService = {
			findAll: jest.fn()
		}
		const userService = {
			findAll: jest.fn(),
			findOne: jest.fn()
		}
		const commandBus = { execute: jest.fn().mockResolvedValue(undefined) }
		const queryBus = { execute: jest.fn() }
		const eventEmitter = { emitAsync: jest.fn() }
		const triggerRegistry = { get: jest.fn(), list: jest.fn().mockReturnValue([]) }
		const sandboxService = { listProviders: jest.fn().mockReturnValue([]) }

		const service = new XpertService(
			repository as any,
			storeService as any,
			userService as any,
			commandBus as any,
			queryBus as any,
			eventEmitter as any,
			triggerRegistry as any,
			sandboxService as any
		)

		return {
			service,
			commandBus,
			triggerRegistry
		}
	}

	it('publish forwards to XpertPublishCommand', async () => {
		const { service, commandBus } = createService()

		await service.publish('xpert-1', true, 'env-1', 'release note')

		expect(commandBus.execute).toHaveBeenCalledTimes(1)
		const [command] = commandBus.execute.mock.calls[0]
		expect(command).toBeInstanceOf(XpertPublishCommand)
		expect(command).toEqual(
			expect.objectContaining({
				id: 'xpert-1',
				newVersion: true,
				environmentId: 'env-1',
				notes: 'release note'
			})
		)
	})

	it('getTriggerProviders returns providers meta from trigger registry', async () => {
		const { service, triggerRegistry } = createService()
		triggerRegistry.list.mockReturnValue([
			{
				meta: {
					name: 'lark'
				}
			},
			{
				meta: {
					name: 'schedule'
				}
			}
		])

		const providers = await service.getTriggerProviders()

		expect(providers).toEqual([
			{
				name: 'lark'
			},
			{
				name: 'schedule'
			}
		])
	})
})
