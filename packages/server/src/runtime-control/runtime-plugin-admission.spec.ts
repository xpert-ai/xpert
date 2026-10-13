import { RuntimePluginAdmission, RestartRegistry } from './runtime-plugin-admission'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'
import { PluginRuntimeGenerationStore } from './plugin-runtime-generation.store'
import type { RuntimePluginState } from '../managed-connection/instance-registry.service'
import { admitPluginStartup, isPluginStartupListening, canRestorePluginStartup } from '../plugin/plugin-startup-state'

jest.mock('../plugin/plugin-startup-state', () => ({
	admitPluginStartup: jest.fn(() => true),
	isPluginStartupListening: jest.fn(() => true),
	canRestorePluginStartup: jest.fn(() => false)
}))

describe('RuntimePluginAdmission', () => {
	let lifecycle: RuntimeLifecycleService
	let registry: RestartRegistry
	let admission: RuntimePluginAdmission
	const readDesired = jest.fn<ReturnType<PluginRuntimeGenerationStore['readDesired']>, []>()
	const generations = { readDesired }
	const state: RuntimePluginState = {
		reportedAt: '',
		plugins: [{ scopeKey: 'global', pluginName: 'test', version: '1' }],
		failures: []
	}
	const desired = {
		generation: 1,
		status: 'in_progress' as const,
		requirements: [{ scopeKey: 'global', pluginName: 'test', version: '2', state: 'loaded' as const }]
	}
	beforeEach(() => {
		jest.useFakeTimers()
		jest.clearAllMocks()
		jest.mocked(isPluginStartupListening).mockReturnValue(true)
		jest.mocked(canRestorePluginStartup).mockReturnValue(false)
		lifecycle = new RuntimeLifecycleService()
		registry = {
			instanceId: 'api',
			bootId: 'boot',
			getPluginState: jest.fn(() => state),
			getReadyInstances: jest.fn(async () => []),
			isLeaseValid: jest.fn(() => true),
			setReady: jest.fn(async () => undefined)
		}
		admission = new RuntimePluginAdmission(registry, lifecycle)
		readDesired.mockResolvedValue(null)
	})
	afterEach(() => jest.useRealTimers())

	it('keeps an existing healthy boot serving while a candidate fails', async () => {
		await admission.refresh(generations)
		readDesired.mockResolvedValue(desired)
		await admission.refresh(generations)
		expect(lifecycle.readiness().status).toBe('ready')
		readDesired.mockResolvedValue({ ...desired, status: 'failed' })
		await admission.refresh(generations)
		expect(lifecycle.trackRequest()).toEqual(expect.any(Function))
	})
	it('fences an old returning boot until it matches the desired generation', async () => {
		readDesired.mockResolvedValue({ ...desired, status: 'completed' })
		await admission.refresh(generations)
		expect(lifecycle.readiness().status).toBe('unready')
		expect(lifecycle.trackRequest()).toBeNull()
		jest.mocked(registry.getPluginState).mockReturnValue({
			...state,
			plugins: [{ ...state.plugins[0], version: '2' }]
		})
		await admission.refresh(generations)
		expect(lifecycle.readiness().status).toBe('ready')
	})
	it('requires listening and stable readiness before saving a known-good boot', async () => {
		jest.mocked(isPluginStartupListening).mockReturnValue(false)
		await admission.refresh(generations)
		expect(lifecycle.readiness().status).toBe('unready')
		jest.mocked(isPluginStartupListening).mockReturnValue(true)
		for (let second = 0; second < 4; second++) {
			await admission.refresh(generations)
			await jest.advanceTimersByTimeAsync(1000)
		}
		expect(admitPluginStartup).toHaveBeenCalledTimes(1)
	})
	it('closes readiness on lease loss or expired validation, including when Redis hangs', async () => {
		await admission.refresh(generations)
		jest.mocked(registry.isLeaseValid).mockReturnValue(false)
		expect(lifecycle.readiness().status).toBe('unready')
		jest.mocked(registry.isLeaseValid).mockReturnValue(true)
		await jest.advanceTimersByTimeAsync(5_001)
		expect(lifecycle.trackRequest()).toBeNull()
		readDesired.mockRejectedValue(new Error('Redis unavailable'))
		await expect(admission.refresh(generations)).rejects.toThrow('Redis unavailable')
		expect(lifecycle.readiness().status).toBe('unready')
	})
	it('does not preserve an old admission after a delayed Redis reply crosses its lease', async () => {
		await admission.refresh(generations)
		readDesired.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(desired), 6_000)))
		const refreshing = admission.refresh(generations)
		await jest.advanceTimersByTimeAsync(6_000)
		await refreshing
		expect(lifecycle.readiness().status).toBe('unready')
	})

	it('admits verified rollback only after the generation has failed', async () => {
		readDesired.mockResolvedValue(desired)
		jest.mocked(canRestorePluginStartup).mockReturnValue(true)
		await admission.refresh(generations)
		expect(lifecycle.readiness().status).toBe('unready')
		readDesired.mockResolvedValue({ ...desired, status: 'failed' })
		await admission.refresh(generations)
		expect(lifecycle.readiness().status).toBe('ready')
	})
})
