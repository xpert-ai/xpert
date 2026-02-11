import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { ProcessResult } from './processor/processor.interface'
import { defineSystemMessageType } from './processor/message-type'

export const SYSTEM_LOCAL_TASK_MESSAGE_TYPE = defineSystemMessageType('local_task', 1)

export interface LocalQueuedTaskContext {
	signal: AbortSignal
	emit: (event: unknown) => void
}

export type LocalQueuedTask = (ctx: LocalQueuedTaskContext) => Promise<void | ProcessResult>

/**
 * Process-local task registry.
 * It allows queue messages to reference a local closure by taskId.
 */
@Injectable()
export class LocalQueueTaskService implements OnModuleDestroy {
	readonly #tasks = new Map<string, LocalQueuedTask>()

	onModuleDestroy() {
		this.#tasks.clear()
	}

	register(task: LocalQueuedTask): string {
		const taskId = randomUUID()
		this.#tasks.set(taskId, task)
		return taskId
	}

	take(taskId: string): LocalQueuedTask | undefined {
		const task = this.#tasks.get(taskId)
		if (task) {
			this.#tasks.delete(taskId)
		}
		return task
	}

	size(): number {
		return this.#tasks.size
	}
}
