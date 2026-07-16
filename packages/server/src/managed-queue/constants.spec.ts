import { managedQueuePhysicalQueuePrefix } from './constants'

describe('managedQueuePhysicalQueuePrefix', () => {
	it('uses the shared production-compatible default', () => {
		expect(managedQueuePhysicalQueuePrefix({})).toBe('xpert:managed-queue')
	})

	it('allows independent environments sharing Redis to select isolated BullMQ keys', () => {
		expect(managedQueuePhysicalQueuePrefix({ MANAGED_QUEUE_PREFIX: 'xpert:managed-queue:cut-validation' })).toBe(
			'xpert:managed-queue:cut-validation'
		)
	})

	it('rejects unsafe prefixes', () => {
		expect(() => managedQueuePhysicalQueuePrefix({ MANAGED_QUEUE_PREFIX: 'bad prefix' })).toThrow(
			'MANAGED_QUEUE_PREFIX'
		)
	})
})
