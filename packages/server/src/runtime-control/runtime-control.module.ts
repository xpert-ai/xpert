/**
 * Invariants: production API processes run under Docker restart policies.
 * This module signals one replica at a time; the process supervisor starts each replacement.
 * Local development must run through a watcher such as nodemon for restart recovery.
 */
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { RedisModule } from '../core/redis'
import { ManagedConnectionModule } from '../managed-connection'
import { RuntimeControlController } from './runtime-control.controller'
import { RuntimeControlService } from './runtime-control.service'
import { RuntimeDrainMiddleware } from './runtime-drain.middleware'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'
import { RUNTIME_PROCESS_SIGNALER, RuntimeProcessSignaler } from './runtime-process-signaler'
import { RuntimeRestartCoordinatorService } from './runtime-restart-coordinator.service'

const processSignaler: RuntimeProcessSignaler = {
	signal: (signal) => {
		process.kill(process.pid, signal)
	}
}

@Module({
	imports: [RedisModule, ManagedConnectionModule],
	controllers: [RuntimeControlController],
	providers: [
		RuntimeLifecycleService,
		RuntimeDrainMiddleware,
		RuntimeRestartCoordinatorService,
		RuntimeControlService,
		{ provide: RUNTIME_PROCESS_SIGNALER, useValue: processSignaler }
	],
	exports: [RuntimeLifecycleService, RuntimeControlService]
})
export class RuntimeControlModule implements NestModule {
	configure(consumer: MiddlewareConsumer): void {
		consumer.apply(RuntimeDrainMiddleware).forRoutes('*')
	}
}
