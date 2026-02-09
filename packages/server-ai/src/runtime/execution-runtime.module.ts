import { Global, Module } from '@nestjs/common'
import { ExecutionRuntimeService } from './execution-runtime.service'
import { LaneQueueService } from './lane-queue.service'
import { RunRegistryService } from './run-registry.service'
import { SessionKeyResolver } from './session-key.resolver'

const providers = [
	LaneQueueService,
	RunRegistryService,
	SessionKeyResolver,
	ExecutionRuntimeService
]

/**
 * ExecutionRuntimeModule - Two-Gate Execution Architecture
 *
 * Provides unified execution control with:
 * - Session Lane: Serial execution within same session
 * - Global Lane: Concurrent execution by lane type (main/subagent/cron/nested)
 * - Run Registry: Track all active runs for cancellation
 * - Session Key Resolver: Consistent session key generation
 *
 * Usage:
 * 1. Import this module in your feature module
 * 2. Inject ExecutionRuntimeService
 * 3. Call executionRuntime.run({ ... }) for two-gate execution
 */
@Global()
@Module({
	providers,
	exports: providers
})
export class ExecutionRuntimeModule {}
