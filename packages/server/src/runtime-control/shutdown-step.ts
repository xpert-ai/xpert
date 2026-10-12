/**
 * Invariants: a cleanup timeout releases the waiter, but does not cancel the underlying operation.
 * Observe late failures and leave final process termination to the shared shutdown watchdog.
 * Pending steps describe current waiters, not every socket or timed-out operation still alive.
 */
import { Logger, LoggerService } from '@nestjs/common'

export const SHUTDOWN_STEP_TIMEOUT_MS = 3_000
export type ShutdownStepStatus = 'completed' | 'failed' | 'timed_out'
type ShutdownLogger = Pick<LoggerService, 'log' | 'warn' | 'debug'>
const logger = new Logger('RuntimeShutdown')
const pending = new Map<symbol, string>()

export function pendingShutdownSteps(): string[] {
	return [...pending.values()]
}

/** Bound cleanup without turning a rejected or never-settling operation into an unhandled rejection. */
export async function runShutdownStep(
	step: string,
	close: () => unknown | Promise<unknown>,
	options: { timeoutMs?: number; logger?: ShutdownLogger } = {}
): Promise<ShutdownStepStatus> {
	const output = options.logger ?? logger
	const timeoutMs = options.timeoutMs ?? SHUTDOWN_STEP_TIMEOUT_MS
	const id = Symbol(step)
	const startedAt = Date.now()
	pending.set(id, step)
	output.log(JSON.stringify({ event: 'runtime.shutdown.step-started', step, pid: process.pid, timeoutMs }))
	let timer: ReturnType<typeof setTimeout>
	let timedOut = false
	try {
		const operation = Promise.resolve()
			.then(close)
			.then(
				(): ShutdownStepStatus => 'completed',
				(error: unknown): ShutdownStepStatus => {
					output.warn(
						JSON.stringify({
							event: 'runtime.shutdown.step-error',
							step,
							pid: process.pid,
							afterTimeout: timedOut,
							error: error instanceof Error ? error.message : String(error)
						})
					)
					return 'failed'
				}
			)
			.then((status) => {
				if (timedOut) {
					output.debug?.(
						JSON.stringify({
							event: 'runtime.shutdown.step-settled-after-timeout',
							step,
							pid: process.pid,
							status,
							durationMs: Date.now() - startedAt
						})
					)
				}
				return status
			})
		const status = await Promise.race([
			operation,
			new Promise<ShutdownStepStatus>((resolve) => {
				timer = setTimeout(() => {
					timedOut = true
					resolve('timed_out')
				}, timeoutMs)
			})
		])
		const event = JSON.stringify({
			event: 'runtime.shutdown.step-finished',
			step,
			pid: process.pid,
			status,
			durationMs: Date.now() - startedAt
		})
		if (status === 'completed') output.log(event)
		else output.warn(event)
		return status
	} finally {
		clearTimeout(timer)
		// Keep diagnostics accurate: this waiter has ended even if its operation continues in the background.
		pending.delete(id)
	}
}

export interface ShutdownRedisClient {
	isOpen?: boolean
	quit?: () => Promise<unknown>
	disconnect?: () => void | Promise<unknown>
}

export async function closeRedisSubscriber(step: string, client?: ShutdownRedisClient | null): Promise<void> {
	if (!client || client.isOpen === false) return
	// These are dedicated Pub/Sub clients. Disconnect locally instead of waiting for QUIT/UNSUBSCRIBE replies.
	// In node-redis v4 a pending QUIT marks isOpen=false before closing the socket, preventing a later disconnect.
	logger.debug(
		JSON.stringify({
			event: 'runtime.shutdown.redis-close-started',
			step,
			pid: process.pid,
			method: client.disconnect ? 'disconnect' : 'quit'
		})
	)
	await runShutdownStep(step, () => (client.disconnect ? client.disconnect() : client.quit?.()))
}
