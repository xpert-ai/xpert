/**
 * Why this exists: PM2's kill_timeout does not cover an API process signaling itself.
 * Run Nest's public close lifecycle under one deadline, including queue drain and all plugin hooks.
 * Signal handling lives here instead of Nest's unbounded enableShutdownHooks listener.
 */
import { Logger, ShutdownSignal } from '@nestjs/common'
import { writeSync } from 'node:fs'
import { pendingShutdownSteps, runShutdownStep } from './shutdown-step'

export const RUNTIME_SHUTDOWN_TIMEOUT_MS = 30_000

export interface RuntimeShutdownOptions {
	/** Finish HTTP/queue draining before Nest can destroy their dependencies. */
	beforeClose?: () => Promise<void>
	/** One budget from the first signal through process exit, not a budget per hook. */
	timeoutMs?: number
	signals?: NodeJS.Signals[]
}

export function enableRuntimeShutdown(
	app: { close(signal?: string): Promise<void> },
	options: RuntimeShutdownOptions = {}
) {
	const logger = new Logger('RuntimeShutdown')
	const timeoutMs = options.timeoutMs ?? RUNTIME_SHUTDOWN_TIMEOUT_MS
	const listeners = new Map<NodeJS.Signals, () => void>()
	let closing: Promise<void> | undefined
	let timer: ReturnType<typeof setTimeout> | undefined
	let finished = false
	const dispose = () => {
		clearTimeout(timer)
		for (const [signal, listener] of listeners) process.removeListener(signal, listener)
		listeners.clear()
	}
	const finish = (code: number) => {
		if (finished) return
		finished = true
		dispose()
		process.exit(code)
	}
	const shutdown = (signal: string): Promise<void> => {
		if (closing) {
			logger.debug(JSON.stringify({ event: 'runtime.shutdown.signal-ignored', signal, pid: process.pid }))
			return closing
		}
		const startedAt = Date.now()
		logger.log(JSON.stringify({ event: 'runtime.shutdown.started', signal, pid: process.pid, timeoutMs }))
		timer = setTimeout(() => {
			// Synchronous output survives forced exit even when the normal logger's transport is blocked.
			try {
				writeSync(
					2,
					JSON.stringify({
						event: 'runtime.shutdown.deadline-exceeded',
						signal,
						pid: process.pid,
						timeoutMs,
						durationMs: Date.now() - startedAt,
						pendingSteps: pendingShutdownSteps()
					}) + '\n'
				)
			} finally {
				finish(1)
			}
		}, timeoutMs)
		// The watchdog must not keep an otherwise fully closed process alive.
		timer.unref()
		closing = (async () => {
			if (options.beforeClose) {
				// A timed-out promise keeps running. Never start destroying dependencies underneath it.
				const prepared = await runShutdownStep('runtime.prepare-close', options.beforeClose, { timeoutMs })
				if (prepared !== 'completed') {
					logger.debug(
						JSON.stringify({
							event: 'runtime.shutdown.prepare-aborted',
							signal,
							pid: process.pid,
							status: prepared,
							durationMs: Date.now() - startedAt,
							exitCode: 1
						})
					)
					finish(1)
					return
				}
			}
			if (finished) return
			// app.close runs module destroy, final response flush, adapter disposal and application hooks.
			// The original watchdog remains armed; Nest does not receive a fresh process-wide budget.
			logger.debug(
				JSON.stringify({
					event: 'runtime.shutdown.nest-close-started',
					signal,
					pid: process.pid,
					durationMs: Date.now() - startedAt,
					remainingMs: Math.max(0, timeoutMs - (Date.now() - startedAt))
				})
			)
			const status = await runShutdownStep('nest.application-close', () => app.close(signal), { timeoutMs })
			if (finished) return
			const exitCode = status === 'completed' ? 0 : 1
			logger.log(
				JSON.stringify({
					event: 'runtime.shutdown.finished',
					signal,
					status,
					pid: process.pid,
					durationMs: Date.now() - startedAt,
					exitCode
				})
			)
			// Explicit exit also releases unowned handles; only the external supervisor starts a replacement.
			finish(exitCode)
		})()
		return closing
	}
	for (const signal of options.signals ?? Object.values(ShutdownSignal)) {
		const listener = () => {
			void shutdown(signal)
		}
		listeners.set(signal, listener)
		process.on(signal, listener)
	}
	logger.debug(
		JSON.stringify({
			event: 'runtime.shutdown.handlers-installed',
			pid: process.pid,
			signals: [...listeners.keys()],
			timeoutMs,
			hasPreparation: Boolean(options.beforeClose)
		})
	)
	return { shutdown, dispose }
}
