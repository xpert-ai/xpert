/** Invariants: accepted HTTP requests retain queue producers and consumers during their grace period.
 * Preparation runs sequentially under the process-wide deadline, never alongside Nest destruction.
 */
import { Logger } from '@nestjs/common'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'
import { RuntimeQueueShutdownService } from './runtime-queue-shutdown.service'

export const HTTP_SHUTDOWN_DRAIN_TIMEOUT_MS = 10_000

export async function prepareApiShutdown(
	lifecycle: RuntimeLifecycleService,
	queues: RuntimeQueueShutdownService
): Promise<void> {
	const logger = new Logger('RuntimeShutdown')
	const startedAt = Date.now()
	const beganDrain = lifecycle.beginDrain({ restartId: 'process-shutdown', requestedAt: new Date().toISOString() })
	logger.debug(
		JSON.stringify({
			event: 'runtime.shutdown.http-drain-started',
			pid: process.pid,
			beganDrain,
			timeoutMs: HTTP_SHUTDOWN_DRAIN_TIMEOUT_MS,
			activeRequests: lifecycle.readiness().activeRequests
		})
	)
	// An existing drain may have timed out; beginDrain(false) does not mean the requests are idle.
	const drained = await lifecycle.waitForIdle(HTTP_SHUTDOWN_DRAIN_TIMEOUT_MS)
	logger.debug(
		JSON.stringify({
			event: 'runtime.shutdown.http-drain-finished',
			pid: process.pid,
			drained,
			durationMs: Date.now() - startedAt,
			activeRequests: lifecycle.readiness().activeRequests
		})
	)
	if (!drained) {
		logger.warn(
			JSON.stringify({
				event: 'runtime.shutdown.http-drain-timeout',
				pid: process.pid,
				activeRequests: lifecycle.readiness().activeRequests
			})
		)
	}
	// Accepted requests may enqueue work after awaiting the database, or wait on a job themselves.
	// Keep producers AND consumers available until the HTTP grace period finishes.
	await queues.close()
}
