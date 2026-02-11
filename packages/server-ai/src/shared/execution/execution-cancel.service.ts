import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { RedisClientType } from 'redis'

const EXECUTION_CANCEL_CHANNEL = 'ai:execution:cancel'
const REDIS_CLIENT_TOKEN = 'REDIS_CLIENT'

interface CancelPayload {
	executionIds: string[]
	reason?: string
}

@Injectable()
export class ExecutionCancelService implements OnModuleInit, OnModuleDestroy {
	readonly #logger = new Logger(ExecutionCancelService.name)
	readonly #controllers = new Map<string, AbortController>()
	private subscriber?: RedisClientType

	constructor(@Inject(REDIS_CLIENT_TOKEN) private readonly redis: RedisClientType) {}

	async onModuleInit() {
		this.subscriber = this.redis.duplicate()
		await this.subscriber.connect()
		await this.subscriber.subscribe(EXECUTION_CANCEL_CHANNEL, (message) => {
			this.handleCancelMessage(message)
		})
	}

	async onModuleDestroy() {
		try {
			if (this.subscriber) {
				await this.subscriber.unsubscribe(EXECUTION_CANCEL_CHANNEL)
				await this.subscriber.quit()
			}
		} catch (error) {
			this.#logger.warn(`Failed to shutdown cancel subscriber: ${error}`)
		}
	}

	register(executionId: string, controller: AbortController) {
		if (!executionId || !controller) {
			return
		}
		this.#controllers.set(executionId, controller)
	}

	unregister(executionId: string) {
		if (!executionId) {
			return
		}
		this.#controllers.delete(executionId)
	}

	async cancelExecutions(executionIds: string[], reason?: string) {
		const uniqueIds = Array.from(new Set(executionIds.filter(Boolean)))
		if (!uniqueIds.length) {
			return
		}
		const payload: CancelPayload = { executionIds: uniqueIds, reason }
		try {
			await this.redis.publish(EXECUTION_CANCEL_CHANNEL, JSON.stringify(payload))
		} catch (error) {
			this.#logger.warn(`Failed to publish cancel event: ${error}`)
		}
		this.applyCancel(uniqueIds, reason)
	}

	private handleCancelMessage(message: string) {
		try {
			const payload = JSON.parse(message) as CancelPayload
			this.applyCancel(payload.executionIds ?? [], payload.reason)
		} catch (error) {
			this.#logger.warn(`Invalid cancel payload: ${error}`)
		}
	}

	private applyCancel(executionIds: string[], reason?: string) {
		for (const executionId of executionIds) {
			const controller = this.#controllers.get(executionId)
			if (!controller) {
				continue
			}
			if (!controller.signal.aborted) {
				this.#logger.debug(`Abort execution ${executionId}: ${reason ?? 'canceled'}`)
				controller.abort()
			}
			this.#controllers.delete(executionId)
		}
	}
}
