import { ControlRuntimeAdmissionService } from '../task-control/control-runtime-admission.service'
import { Test, TestingModule } from '@nestjs/testing'
import { REDIS_CLIENT } from '../core/redis/types'
import { InstanceRegistryService } from '../managed-connection/instance-registry.service'
import { runtimeAdmissionMonitorProvider, runtimePluginAdmissionProvider } from './runtime-admission.providers'
import { RuntimeAdmissionMonitor } from './runtime-admission-monitor'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'
import { RestartRegistry, RuntimePluginAdmission } from './runtime-plugin-admission'
import { RUNTIME_PROCESS_SIGNALER } from './runtime-process-signaler'
import { RuntimeRestartCoordinatorService } from './runtime-restart-coordinator.service'
import { advance, emptyPluginState, FakeRedis } from './runtime-restart.test-fixture'
import { RUNTIME_TRAFFIC_OPTIONS, readRuntimeTrafficOptions } from './runtime-traffic-options'

describe('admission provider lifecycle', () => {
	let module: TestingModule | undefined
	beforeEach(() => jest.useFakeTimers())
	afterEach(async () => {
		await module?.close()
		module = undefined
		jest.useRealTimers()
	})

	async function bootstrap(withCoordinator: boolean) {
		const registry: RestartRegistry = {
			instanceId: 'api',
			bootId: 'boot',
			getPluginState: () => emptyPluginState(),
			getReadyInstances: async () => [],
			isLeaseValid: () => true,
			setReady: jest.fn(async () => undefined)
		}
		module = await Test.createTestingModule({
			providers: [
				RuntimeLifecycleService,
				{ provide: ControlRuntimeAdmissionService, useValue: { refresh: jest.fn(async () => undefined) } },
				runtimePluginAdmissionProvider,
				runtimeAdmissionMonitorProvider,
				{ provide: REDIS_CLIENT, useValue: new FakeRedis() },
				{ provide: InstanceRegistryService, useValue: registry },
				{ provide: RUNTIME_PROCESS_SIGNALER, useValue: { signal: jest.fn() } },
				{ provide: RUNTIME_TRAFFIC_OPTIONS, useValue: readRuntimeTrafficOptions({}) },
				...(withCoordinator ? [RuntimeRestartCoordinatorService] : [])
			]
		}).compile()
		await module.init()
		return module
	}

	it.each([false, true])(
		'keeps admission fresh without an active executor (coordinator registered: %s)',
		async (registered) => {
			const app = await bootstrap(registered)
			if (registered) await app.get(RuntimeRestartCoordinatorService).onModuleDestroy()
			await advance(12_000)
			const lifecycle = app.get(RuntimeLifecycleService)
			expect(lifecycle.readiness()).toMatchObject({
				status: 'ready',
				admission: { validationAgeMs: 0, reason: 'ready' }
			})
			const refresh = jest.spyOn(app.get(RuntimePluginAdmission), 'refresh')
			await app.close()
			module = undefined
			await advance(6_000)
			expect(refresh).not.toHaveBeenCalled()
			expect(lifecycle.readiness()).toMatchObject({
				status: 'unready',
				admission: { reason: 'validation-expired' }
			})
		}
	)

	it('shares one in-flight check between timer ticks and explicit callers', async () => {
		const app = await bootstrap(false)
		const admission = app.get(RuntimePluginAdmission)
		const monitor = app.get(RuntimeAdmissionMonitor)
		let finish!: (result: { desiredGeneration: number }) => void
		const pending = new Promise<{ desiredGeneration: number }>((resolve) => {
			finish = resolve
		})
		const refresh = jest.spyOn(admission, 'refresh').mockReturnValueOnce(pending)
		const first = monitor.refresh()
		expect(monitor.refresh()).toBe(first)
		await advance(3_000)
		expect(refresh).toHaveBeenCalledTimes(1)
		finish({ desiredGeneration: 0 })
		await first
		await advance(1_000)
		expect(refresh).toHaveBeenCalledTimes(2)
	})
})
