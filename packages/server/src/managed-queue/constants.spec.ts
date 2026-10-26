import { getConfig, setConfig } from '@xpert-ai/server-config'
import { managedQueuePhysicalQueuePrefix } from './constants'

describe('managedQueuePhysicalQueuePrefix', () => {
	const original = getConfig().managedQueueOptions
	afterEach(() => setConfig({ managedQueueOptions: original }))
	it('uses the shared production-compatible default', () => {
		expect(
			managedQueuePhysicalQueuePrefix({
				concurrency: 10,
				sandboxBrowserConcurrency: 1,
				autorun: true,
				prefix: 'xpert:managed-queue'
			})
		).toBe('xpert:managed-queue')
	})
	it('respects configuration overrides for independent environments', () => {
		setConfig({ managedQueueOptions: { ...original, prefix: 'xpert:managed-queue:cut-validation' } })
		expect(managedQueuePhysicalQueuePrefix()).toBe('xpert:managed-queue:cut-validation')
	})
})
