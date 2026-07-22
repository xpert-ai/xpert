/**
 * Invariants: production API processes run under Docker restart policies.
 * This module only signals SIGTERM; the process supervisor starts the replacement.
 * Local development must run through a watcher such as nodemon for restart recovery.
 */
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { RedisModule } from '../core/redis'
import { RuntimeControlController } from './runtime-control.controller'
import { RUNTIME_PROCESS_SIGNALER, RuntimeControlService, RuntimeProcessSignaler } from './runtime-control.service'
import { RuntimeDrainMiddleware } from './runtime-drain.middleware'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'

const processSignaler: RuntimeProcessSignaler = {
	signal: (signal) => {
		process.kill(process.pid, signal)
	}
}

@Module({
	imports: [RedisModule],
	controllers: [RuntimeControlController],
	providers: [
		RuntimeLifecycleService,
		RuntimeDrainMiddleware,
		RuntimeControlService,
		{ provide: RUNTIME_PROCESS_SIGNALER, useValue: processSignaler }
	],
	exports: [RuntimeLifecycleService]
})
export class RuntimeControlModule implements NestModule {
	configure(consumer: MiddlewareConsumer): void {
		consumer.apply(RuntimeDrainMiddleware).forRoutes('*')
	}
}
