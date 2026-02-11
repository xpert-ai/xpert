import { Global, Module } from '@nestjs/common'
import { ExecutionQueueService } from './execution-queue.service'
import { RunRegistryService } from './run-registry.service'
import { SessionKeyResolver } from './session-key.resolver'

const providers = [RunRegistryService, SessionKeyResolver, ExecutionQueueService]

@Global()
@Module({
	providers,
	exports: providers
})
export class ExecutionQueueCoreModule {}
