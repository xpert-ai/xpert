jest.mock('../core/context', () => ({
	RequestContext: {
		currentTenantId: jest.fn(),
		getScope: jest.fn()
	}
}))

import { RequestScopeLevel } from '@xpert-ai/contracts'
import { RequestContext } from '../core/context'
import { ReferralController } from './referral.controller'

describe('ReferralController public endpoints', () => {
	const referralService = {
		isFeatureEnabled: jest.fn(),
		validatePublicCode: jest.fn(),
		getMyCode: jest.fn(),
		regenerateMyCode: jest.fn()
	}
	const validationRateLimitService = {
		assertAllowed: jest.fn()
	}
	let controller: ReferralController

	beforeEach(() => {
		jest.clearAllMocks()
		controller = new ReferralController(referralService as never, validationRateLimitService as never)
		jest.mocked(RequestContext.currentTenantId).mockReturnValue(null)
		jest.mocked(RequestContext.getScope).mockReturnValue({
			tenantId: 'tenant-1',
			level: RequestScopeLevel.TENANT,
			organizationId: null
		})
		referralService.isFeatureEnabled.mockResolvedValue(true)
		referralService.validatePublicCode.mockResolvedValue(true)
		referralService.getMyCode.mockResolvedValue({ code: 'ABC234DEFG' })
		referralService.regenerateMyCode.mockResolvedValue({ code: 'XYZ234DEFG' })
	})

	it('reports availability for an anonymous tenant-scoped request', async () => {
		await expect(controller.getAvailability()).resolves.toBe(true)

		expect(referralService.isFeatureEnabled).toHaveBeenCalledWith('tenant-1')
	})

	it('validates a code for an anonymous tenant-scoped request', async () => {
		const request = {
			ips: [],
			ip: '203.0.113.10',
			socket: {}
		}

		await expect(controller.validate('ABC234DEFG', request as never)).resolves.toBe(true)

		expect(validationRateLimitService.assertAllowed).toHaveBeenCalledWith('tenant-1', '203.0.113.10')
		expect(referralService.validatePublicCode).toHaveBeenCalledWith('tenant-1', 'ABC234DEFG')
	})

	it('regenerates the authenticated account invitation code', async () => {
		await expect(controller.regenerateMyCode()).resolves.toEqual({
			code: 'XYZ234DEFG'
		})

		expect(referralService.regenerateMyCode).toHaveBeenCalledTimes(1)
	})
})
