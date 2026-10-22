/**
 * Invariants: admission monitoring has its own provider lifecycle, independent of restart execution.
 * The current rolling-self-signal executor requires a supervisor (PM2 or a development watcher).
 * Runtime completion does not acknowledge ingress readmission.
 */
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { RedisModule } from '../core/redis'
import { ManagedConnectionModule } from '../managed-connection'
import { RuntimeControlController } from './runtime-control.controller'
import { RuntimeControlService } from './runtime-control.service'
import { RuntimeDrainMiddleware } from './runtime-drain.middleware'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'
import { RUNTIME_PROCESS_SIGNALER, RuntimeProcessSignaler } from './runtime-process-signaler'
import { RuntimeRestartCoordinatorService } from './runtime-restart-coordinator.service'
import { RuntimeQueueShutdownService } from './runtime-queue-shutdown.service'
import { runtimeAdmissionMonitorProvider, runtimePluginAdmissionProvider } from './runtime-admission.providers'
import { RUNTIME_TRAFFIC_OPTIONS, readRuntimeTrafficOptions } from './runtime-traffic-options'

const processSignaler: RuntimeProcessSignaler = {
	signal: (signal) => {
		process.kill(process.pid, signal)
	}
}

@Module({
	imports: [RedisModule, ManagedConnectionModule, DiscoveryModule],
	controllers: [RuntimeControlController],
	providers: [
		RuntimeLifecycleService,
		runtimePluginAdmissionProvider,
		runtimeAdmissionMonitorProvider,
		{ provide: RUNTIME_TRAFFIC_OPTIONS, useFactory: () => readRuntimeTrafficOptions() },
		RuntimeDrainMiddleware,
		RuntimeRestartCoordinatorService,
		RuntimeControlService,
		RuntimeQueueShutdownService,
		{ provide: RUNTIME_PROCESS_SIGNALER, useValue: processSignaler }
	],
	exports: [RuntimeLifecycleService, RuntimeControlService, RuntimeQueueShutdownService]
})
export class RuntimeControlModule implements NestModule {
	configure(consumer: MiddlewareConsumer): void {
		consumer.apply(RuntimeDrainMiddleware).forRoutes('*')
	}
}
