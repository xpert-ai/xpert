import { RuntimePluginAdmission, RestartRegistry } from './runtime-plugin-admission'
import { evaluateRuntimeRequirements } from './plugin-runtime-requirements'
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
	const readRequirements = jest.fn<ReturnType<PluginRuntimeGenerationStore['readRequirements']>, [number]>()
	const generations = { readDesired, readRequirements }
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
		readRequirements.mockReset()
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

	it('does not preserve continuous admission if reading queued snapshots crosses its validation deadline', async () => {
		await admission.refresh(generations)
		readDesired.mockResolvedValue({ ...desired, generation: 3 })
		readRequirements.mockImplementationOnce(
			() => new Promise((resolve) => setTimeout(() => resolve(undefined), 6_000))
		)
		const refreshing = admission.refresh(generations, {
			generation: 1,
			requirements: [{ ...desired.requirements[0], version: '0' }]
		})
		await jest.advanceTimersByTimeAsync(6_000)
		await refreshing
		expect(lifecycle.readiness().status).toBe('unready')
	})

	it('does not use queued snapshots to admit a failed rollout or an unrelated returning boot', async () => {
		const rollout = { generation: 1, requirements: [{ ...desired.requirements[0], version: '0' }] }
		readRequirements.mockResolvedValue([{ ...desired.requirements[0], version: '1' }])
		readDesired.mockResolvedValue({ ...desired, generation: 3, status: 'failed' })
		await admission.refresh(generations, rollout)
		expect(lifecycle.readiness().status).toBe('unready')
		readDesired.mockResolvedValue({ ...desired, generation: 3 })
		await admission.refresh(generations)
		expect(lifecycle.readiness().status).toBe('unready')
		expect(readRequirements).not.toHaveBeenCalled()
	})
	it('distinguishes validation expiry, lease loss, startup and plugin admission failures', async () => {
		await admission.refresh(generations)
		expect(lifecycle.readiness().admission).toMatchObject({
			reason: 'ready',
			validationAgeMs: 0,
			checkInFlight: false
		})
		await jest.advanceTimersByTimeAsync(5_001)
		expect(lifecycle.readiness().admission).toMatchObject({ reason: 'validation-expired', validationAgeMs: 5_001 })
		jest.mocked(registry.isLeaseValid).mockReturnValue(false)
		expect(lifecycle.readiness().admission?.reason).toBe('lease-expired')
		jest.mocked(registry.isLeaseValid).mockReturnValue(true)
		jest.mocked(isPluginStartupListening).mockReturnValue(false)
		expect(lifecycle.readiness().admission?.reason).toBe('startup-not-listening')
		jest.mocked(isPluginStartupListening).mockReturnValue(true)
		readDesired.mockResolvedValue({ ...desired, status: 'completed' })
		await admission.refresh(generations)
		expect(lifecycle.readiness().admission?.reason).toBe('plugin-not-admitted')
	})

	it('reports a stalled rollout snapshot read separately from Redis lease loss', async () => {
		await admission.refresh(generations)
		let finish!: () => void
		const pending = admission.refresh(
			generations,
			() =>
				new Promise((resolve) => {
					finish = () => resolve(undefined)
				})
		)
		await jest.advanceTimersByTimeAsync(5_001)
		expect(lifecycle.readiness().admission).toMatchObject({
			reason: 'validation-expired',
			checkInFlight: true,
			checkDurationMs: 5_001
		})
		finish()
		await pending
		expect(lifecycle.readiness().admission).toMatchObject({
			reason: 'ready',
			checkInFlight: false,
			checkDurationMs: 5_001
		})
		readDesired.mockRejectedValueOnce(new Error('Redis unavailable'))
		await expect(admission.refresh(generations)).rejects.toThrow('Redis unavailable')
		expect(lifecycle.readiness().admission?.lastCheckFailed).toBe(true)
		await admission.refresh(generations)
		expect(lifecycle.readiness().admission?.lastCheckFailed).toBe(false)
	})
	const isolatedState: RuntimePluginState = {
		reportedAt: '',
		plugins: [],
		failures: [
			{
				scopeKey: 'global',
				pluginName: 'test',
				error: 'conflicting provider',
				isolation: { stage: 'provider-preflight', version: '2', runtimeRevision: 'runtime:candidate' }
			}
		]
	}

	it.each(['in_progress', 'completed', 'failed'] as const)(
		'serves with an exact preflight rejection while %s convergence remains failed',
		async (status) => {
			const requirements = [{ ...desired.requirements[0], runtimeRevision: 'runtime:candidate' }]
			readDesired.mockResolvedValue({ ...desired, status, requirements })
			jest.mocked(registry.getPluginState).mockReturnValue(isolatedState)
			await admission.refresh(generations)
			expect(lifecycle.readiness().status).toBe('ready')
			expect(evaluateRuntimeRequirements(requirements, isolatedState).status).toBe('failed')
			jest.mocked(registry.isLeaseValid).mockReturnValue(false)
			expect(lifecycle.trackRequest()).toBeNull()
			jest.mocked(registry.isLeaseValid).mockReturnValue(true)
			await jest.advanceTimersByTimeAsync(5_001)
			expect(lifecycle.trackRequest()).toBeNull()
		}
	)

	it.each([
		[
			'an unattested failure',
			{ ...isolatedState, failures: [{ ...isolatedState.failures[0], isolation: undefined }] }
		],
		['a missing plugin', { ...isolatedState, failures: [] }],
		['a stale loaded plugin', { ...isolatedState, plugins: state.plugins }],
		[
			'a failure in another scope',
			{ ...isolatedState, failures: [{ ...isolatedState.failures[0], scopeKey: 'other' }] }
		],
		[
			'the wrong version',
			{
				...isolatedState,
				failures: [
					{
						...isolatedState.failures[0],
						isolation: {
							...isolatedState.failures[0].isolation!,
							version: '1'
						}
					}
				]
			}
		],
		[
			'the wrong source revision',
			{
				...isolatedState,
				failures: [
					{
						...isolatedState.failures[0],
						isolation: {
							...isolatedState.failures[0].isolation!,
							runtimeRevision: 'runtime:old'
						}
					}
				]
			}
		]
	] satisfies [string, RuntimePluginState][])(
		'does not admit %s as an isolated candidate',
		async (_name, runtime) => {
			readDesired.mockResolvedValue({
				...desired,
				status: 'completed',
				requirements: [{ ...desired.requirements[0], runtimeRevision: 'runtime:candidate' }]
			})
			jest.mocked(registry.getPluginState).mockReturnValue(runtime)
			await admission.refresh(generations)
			expect(lifecycle.readiness().status).toBe('unready')
		}
	)

	it('still requires every other plugin and does not count an isolated failure as an uninstall', async () => {
		jest.mocked(registry.getPluginState).mockReturnValue(isolatedState)
		readDesired.mockResolvedValue({
			...desired,
			status: 'completed',
			requirements: [...desired.requirements, { scopeKey: 'global', pluginName: 'other', state: 'loaded' }]
		})
		await admission.refresh(generations)
		expect(lifecycle.readiness().status).toBe('unready')
		readDesired.mockResolvedValue({
			...desired,
			status: 'completed',
			requirements: [{ ...desired.requirements[0], state: 'absent' }]
		})
		await admission.refresh(generations)
		expect(lifecycle.readiness().status).toBe('unready')
	})
})
