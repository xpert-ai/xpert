import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { defineAgentMessageType, ProcessResult } from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'crypto'
import { LocalQueuedTaskContext } from './types'

export const AGENT_CHAT_MESSAGE_TYPE = defineAgentMessageType('chat', 1)

export type LocalQueuedTask = (ctx: LocalQueuedTaskContext) => Promise<void | ProcessResult>

/**
 * Process-local task registry.
 * It allows queue messages to reference a local closure by taskId.
 */
@Injectable()
export class LocalQueueTaskService implements OnModuleDestroy {
	readonly #logger = new Logger(LocalQueueTaskService.name)
	readonly #tasks = new Map<string, LocalQueuedTask>()

	onModuleDestroy() {
		this.#tasks.clear()
	}

	register(task: LocalQueuedTask): string {
		const taskId = randomUUID()
		this.#logger.debug(`Registering local task: ${taskId}`)
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

	remove(taskId: string): boolean {
		return this.#tasks.delete(taskId)
	}

	size(): number {
		return this.#tasks.size
	}
}
