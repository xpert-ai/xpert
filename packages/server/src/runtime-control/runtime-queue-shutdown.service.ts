/** Invariants: all local consumers drain before any producer connection is closed.
 * An idle queue can still receive callbacks from a job running on another queue.
 */
import { Injectable, Logger } from '@nestjs/common'
import { DiscoveryService } from '@nestjs/core'
import { WorkerHost } from '@nestjs/bullmq'
import Bull from 'bull'
import { runShutdownStep } from './shutdown-step'

export interface ShutdownQueue {
	name: string
	/** Pause this process's consumer and await its active jobs; preserve producer connections. */
	pause(): Promise<unknown>
	/** Close without another unbounded wait once every consumer has had its drain grace period. */
	close(): Promise<unknown>
}

export async function drainShutdownQueues(queues: ShutdownQueue[], timeoutMs = 10_000): Promise<void> {
	const logger = new Logger('RuntimeQueueShutdown')
	const startedAt = Date.now()
	logger.debug(
		JSON.stringify({
			event: 'runtime.shutdown.queue-drain-started',
			pid: process.pid,
			timeoutMs,
			queues: queues.map((queue) => queue.name)
		})
	)
	const drained = await Promise.all(
		queues.map((queue) => runShutdownStep(`queue.${queue.name}.drain`, () => queue.pause(), { timeoutMs }))
	)
	// This barrier includes idle queues: other queues' active jobs may still write callbacks to them.
	// A timeout ends the grace period, not the job's JavaScript execution; close(true) bounds the next phase.
	logger.debug(
		JSON.stringify({
			event: 'runtime.shutdown.queue-drain-finished',
			pid: process.pid,
			durationMs: Date.now() - startedAt,
			results: queues.map((queue, index) => ({ queue: queue.name, status: drained[index] }))
		})
	)
	const closed = await Promise.all(
		queues.map((queue) => runShutdownStep(`queue.${queue.name}.close`, () => queue.close()))
	)
	logger.debug(
		JSON.stringify({
			event: 'runtime.shutdown.queues-closed',
			pid: process.pid,
			durationMs: Date.now() - startedAt,
			results: queues.map((queue, index) => ({ queue: queue.name, status: closed[index] }))
		})
	)
}

@Injectable()
export class RuntimeQueueShutdownService {
	private readonly logger = new Logger(RuntimeQueueShutdownService.name)
	private closing?: Promise<void>

	constructor(private readonly discovery: DiscoveryService) {}

	close(): Promise<void> {
		// Shutdown may be requested through multiple signals; never pause/close the same resources twice.
		if (this.closing)
			this.logger.debug(JSON.stringify({ event: 'runtime.shutdown.queues-already-closing', pid: process.pid }))
		return (this.closing ??= this.closeQueues())
	}

	private async closeQueues(): Promise<void> {
		const queues: ShutdownQueue[] = []
		const seen = new Set<object>()
		let bullQueues = 0
		let bullmqWorkers = 0
		// Deduplicate Nest aliases by identity. Workers created outside DI need their own bounded cleanup hook.
		for (const { instance } of this.discovery.getProviders()) {
			if (!instance || seen.has(instance)) continue
			seen.add(instance)
			if (instance instanceof Bull) {
				bullQueues += 1
				queues.push({
					name: instance.name,
					pause: () => instance.pause(true), // Local pause: other replicas must keep consuming.
					close: () => instance.close(true)
				})
			} else if (instance instanceof WorkerHost) {
				bullmqWorkers += 1
				const worker = instance.worker
				queues.push({ name: worker.name, pause: () => worker.pause(), close: () => worker.close(true) })
			}
		}
		this.logger.debug(
			JSON.stringify({
				event: 'runtime.shutdown.queues-discovered',
				pid: process.pid,
				bullQueues,
				bullmqWorkers,
				queueCount: queues.length
			})
		)
		await drainShutdownQueues(queues)
	}
}
