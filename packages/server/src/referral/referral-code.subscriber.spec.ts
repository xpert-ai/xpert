import { UserType } from '@xpert-ai/contracts'
import { ReferralCodeSubscriber } from './referral-code.subscriber'

describe('ReferralCodeSubscriber', () => {
	const queryBuilder = {
		insert: jest.fn().mockReturnThis(),
		into: jest.fn().mockReturnThis(),
		values: jest.fn().mockReturnThis(),
		orIgnore: jest.fn().mockReturnThis(),
		execute: jest.fn()
	}
	const repository = {
		createQueryBuilder: jest.fn(() => queryBuilder),
		findOne: jest.fn()
	}
	const manager = {
		getRepository: jest.fn(() => repository)
	}
	const subscriber = new ReferralCodeSubscriber()

	beforeEach(() => {
		jest.clearAllMocks()
		queryBuilder.execute.mockResolvedValue({})
		repository.findOne.mockResolvedValue({
			id: 'referral-code-1'
		})
	})

	it('creates one ten-character uppercase code for an ordinary user', async () => {
		await subscriber.afterInsert({
			entity: {
				id: 'user-1',
				tenantId: 'tenant-1',
				type: UserType.USER
			},
			manager
		} as never)

		expect(queryBuilder.values).toHaveBeenCalledWith({
			tenantId: 'tenant-1',
			userId: 'user-1',
			code: expect.stringMatching(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/)
		})
		expect(queryBuilder.execute).toHaveBeenCalledTimes(1)
	})

	it('does not create invitation codes for communication users', async () => {
		await subscriber.afterInsert({
			entity: {
				id: 'user-1',
				tenantId: 'tenant-1',
				type: UserType.COMMUNICATION
			},
			manager
		} as never)

		expect(manager.getRepository).not.toHaveBeenCalled()
	})

	it('retries when a generated code collides', async () => {
		repository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
			id: 'referral-code-1'
		})

		await subscriber.afterInsert({
			entity: {
				id: 'user-1',
				tenantId: 'tenant-1',
				type: UserType.USER
			},
			manager
		} as never)

		expect(queryBuilder.execute).toHaveBeenCalledTimes(2)
	})
})
