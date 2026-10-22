import { RuntimeLifecycleService } from './runtime-lifecycle.service'
import { TRAFFIC_WITHDRAWAL_MS, withdrawRuntimeTraffic } from './runtime-traffic-withdrawal'
import { advance, createNode, emptyPluginState, FakeRedis, RuntimeNode } from './runtime-restart.test-fixture'
import { readRuntimeTrafficOptions } from './runtime-traffic-options'

describe('runtime traffic recovery', () => {
	let nodes: RuntimeNode[] = []
	beforeEach(() => jest.useFakeTimers())
	afterEach(async () => {
		await Promise.all(nodes.map((node) => node.destroy()))
		nodes = []
		jest.useRealTimers()
	})
	it('withdraws readiness before rejecting requests and preserves an existing stream until it finishes', async () => {
		const lifecycle = new RuntimeLifecycleService()
		const state = { restartId: 'rollout', requestedAt: new Date().toISOString() }
		const stream = lifecycle.trackRequest()!
		expect(lifecycle.beginWithdrawal(state)).toBe(true)
		expect(lifecycle.readiness().status).toBe('withdrawing')
		const request = lifecycle.trackRequest()
		expect(request).not.toBeNull()
		request?.()
		const withdrawing = withdrawRuntimeTraffic(lifecycle, state, async () => true)
		await advance(TRAFFIC_WITHDRAWAL_MS - 1)
		expect(lifecycle.readiness().status).toBe('withdrawing')
		await advance(1)
		await expect(withdrawing).resolves.toBe(true)
		expect(lifecycle.trackRequest()).toBeNull()
		expect(lifecycle.readiness().activeRequests).toBe(1)
		const drained = lifecycle.waitForIdle(30_000)
		stream()
		await expect(drained).resolves.toBe(true)
	})
	it('restores readiness when the rollout is cancelled during propagation', async () => {
		const lifecycle = new RuntimeLifecycleService()
		const state = { restartId: 'cancelled', requestedAt: '' }
		lifecycle.beginWithdrawal(state)
		const withdrawing = withdrawRuntimeTraffic(lifecycle, state, async () => false)
		await advance(TRAFFIC_WITHDRAWAL_MS)
		await expect(withdrawing).resolves.toBe(false)
		expect(lifecycle.readiness().status).toBe('ready')
	})
	it('allows process shutdown to supersede withdrawal without a stale timer reopening traffic', async () => {
		const lifecycle = new RuntimeLifecycleService()
		const rollout = { restartId: 'rollout', requestedAt: '' }
		lifecycle.beginWithdrawal(rollout)
		const withdrawing = withdrawRuntimeTraffic(lifecycle, rollout, async () => true)
		expect(lifecycle.beginDrain({ restartId: 'shutdown', requestedAt: '' })).toBe(true)
		expect(lifecycle.trackRequest()).toBeNull()
		await advance(TRAFFIC_WITHDRAWAL_MS)
		await expect(withdrawing).resolves.toBe(false)
		expect(lifecycle.getDrainState()?.restartId).toBe('shutdown')
		expect(lifecycle.trackRequest()).toBeNull()
	})
	it('continues fencing unsafe requests even during withdrawal', () => {
		const lifecycle = new RuntimeLifecycleService()
		lifecycle.beginWithdrawal({ restartId: 'unsafe', requestedAt: '' })
		lifecycle.setReadinessGuard(() => false)
		expect(lifecycle.readiness().status).toBe('unready')
		expect(lifecycle.trackRequest()).toBeNull()
	})
	it('uses the configured propagation budget before signalling a rolling candidate', async () => {
		const redis = new FakeRedis()
		const options = readRuntimeTrafficOptions({ RUNTIME_TRAFFIC_WITHDRAWAL_MS: '9000' })
		const candidate = await createNode(redis, 'api-1', 'boot-1', emptyPluginState(), true, options)
		const peer = await createNode(redis, 'api-2', 'boot-1', emptyPluginState(), true, options)
		nodes.push(candidate, peer)
		await candidate.coordinator.requestRestart({ source: 'interactive' })
		await advance(6_000)
		const withdrawing = nodes.find((node) => node.lifecycle.readiness().status === 'withdrawing')
		expect(withdrawing).toBeDefined()
		await advance(5_000)
		expect(withdrawing?.signaler.signal).not.toHaveBeenCalled()
		expect(withdrawing?.lifecycle.readiness().status).toBe('withdrawing')
		await advance(5_000)
		expect(withdrawing?.signaler.signal).toHaveBeenCalledTimes(1)
		expect(withdrawing?.lifecycle.readiness().status).toBe('draining')
	})
	it('refreshes admission while unrelated coordinator bookkeeping is stalled', async () => {
		const node = await createNode(new FakeRedis(), 'api', 'boot', emptyPluginState())
		nodes.push(node)
		let finish!: () => void
		const stalled = new Promise<void>((resolve) => {
			finish = resolve
		})
		const reconcile = jest.fn(() => stalled)
		node.coordinator['reconcileLocalPlugins'] = reconcile
		await advance(12_000)
		expect(reconcile).toHaveBeenCalledTimes(1)
		expect(node.lifecycle.readiness()).toMatchObject({
			status: 'ready',
			admission: { reason: 'ready', validationAgeMs: 0 }
		})
		finish()
		await advance(0)
	})
})
