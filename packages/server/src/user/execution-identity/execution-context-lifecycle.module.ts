// Bull consumers can start before CQRS registers handlers. This dependency orders
// readiness after CQRS bootstrap, without polling or a hidden service locator.
import { Injectable, Module, OnApplicationBootstrap } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'

@Injectable()
export class ExecutionContextReadyService implements OnApplicationBootstrap {
	private started = false
	private resolveReady!: () => void
	private readonly ready = new Promise<void>((resolve) => {
		this.resolveReady = resolve
	})
	onApplicationBootstrap() {
		this.started = true
		this.resolveReady()
	}
	isReady() {
		return this.started
	}
	waitUntilReady() {
		return this.ready
	}
}

@Module({
	imports: [CqrsModule],
	providers: [ExecutionContextReadyService],
	exports: [ExecutionContextReadyService]
})
export class ExecutionContextLifecycleModule {}
