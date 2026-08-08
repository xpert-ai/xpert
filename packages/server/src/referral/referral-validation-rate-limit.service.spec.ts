import { HttpStatus } from '@nestjs/common'
import { ReferralValidationRateLimitService } from './referral-validation-rate-limit.service'

describe('ReferralValidationRateLimitService', () => {
	const redisClient = {
		eval: jest.fn()
	}
	let service: ReferralValidationRateLimitService

	beforeEach(() => {
		jest.clearAllMocks()
		service = new ReferralValidationRateLimitService(redisClient as never)
	})

	it('uses one shared atomic Redis counter per tenant and client', async () => {
		redisClient.eval.mockResolvedValue(30)

		await expect(service.assertAllowed('tenant-1', '203.0.113.10')).resolves.toBeUndefined()

		expect(redisClient.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('INCR'"), {
			keys: [expect.stringMatching(/^referral:validation-rate:tenant-1:/)],
			arguments: ['60000']
		})
		expect(redisClient.eval.mock.calls[0][1].keys[0]).not.toContain('203.0.113.10')
	})

	it('rejects validation after the shared tenant and client limit is exceeded', async () => {
		redisClient.eval.mockResolvedValue(31)

		await expect(service.assertAllowed('tenant-1', '203.0.113.10')).rejects.toMatchObject({
			status: HttpStatus.TOO_MANY_REQUESTS
		})
	})
})
