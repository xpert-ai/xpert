import { REDIS_CLIENT } from '@metad/server-core'
import {
	Inject,
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
	Optional
} from '@nestjs/common'
import type { RedisClientType } from 'redis'
import { buildCanceledReason } from './cancel-reason'

const HANDOFF_CANCEL_CHANNEL = 'ai:handoff:cancel'

interface HandoffCancelPayload {
	messageIds: string[]
	reason?: string
}

@Injectable()
export class HandoffCancelService implements OnModuleInit, OnModuleDestroy {
	readonly #logger = new Logger(HandoffCancelService.name)
	readonly #controllers = new Map<string, AbortController>()
	readonly #cancelReasons = new Map<string, string>()
	private subscriber?: RedisClientType

	constructor(@Optional() @Inject(REDIS_CLIENT) private readonly redis?: RedisClientType) {}

	async onModuleInit() {
		if (!this.redis) {
			return
		}
		this.subscriber = this.redis.duplicate()
		await this.subscriber.connect()
		await this.subscriber.subscribe(HANDOFF_CANCEL_CHANNEL, (message) => {
			this.handleCancelMessage(message)
		})
	}

	async onModuleDestroy() {
		try {
			if (this.subscriber) {
				await this.subscriber.unsubscribe(HANDOFF_CANCEL_CHANNEL)
				await this.subscriber.quit()
			}
		} catch (error) {
			this.#logger.warn(`Failed to shutdown handoff cancel subscriber: ${error}`)
		}
	}

	register(messageId: string, controller: AbortController) {
		if (!messageId || !controller) {
			return
		}
		this.#controllers.set(messageId, controller)
	}

	unregister(messageId: string) {
		if (!messageId) {
			return
		}
		this.#controllers.delete(messageId)
		this.#cancelReasons.delete(messageId)
	}

	getCancelReason(messageId: string): string | undefined {
		return this.#cancelReasons.get(messageId)
	}

	async cancelMessages(messageIds: string[], reason?: string): Promise<string[]> {
		const uniqueMessageIds = Array.from(new Set((messageIds ?? []).filter(Boolean)))
		if (!uniqueMessageIds.length) {
			return []
		}

		const payload: HandoffCancelPayload = {
			messageIds: uniqueMessageIds,
			reason
		}

		if (this.redis) {
			try {
				await this.redis.publish(HANDOFF_CANCEL_CHANNEL, JSON.stringify(payload))
			} catch (error) {
				this.#logger.warn(`Failed to publish handoff cancel event: ${error}`)
			}
		}

		return this.applyCancel(uniqueMessageIds, reason)
	}

	private handleCancelMessage(message: string) {
		try {
			const payload = JSON.parse(message) as HandoffCancelPayload
			this.applyCancel(payload.messageIds ?? [], payload.reason)
		} catch (error) {
			this.#logger.warn(`Invalid handoff cancel payload: ${error}`)
		}
	}

	private applyCancel(messageIds: string[], reason?: string): string[] {
		const canceledReason = buildCanceledReason(reason)
		const abortedIds: string[] = []

		for (const messageId of messageIds) {
			const controller = this.#controllers.get(messageId)
			if (!controller) {
				continue
			}

			this.#cancelReasons.set(messageId, canceledReason)

			if (!controller.signal.aborted) {
				this.#logger.debug(`Abort handoff message ${messageId}: ${canceledReason}`)
				controller.abort()
			}
			this.#controllers.delete(messageId)
			abortedIds.push(messageId)
		}

		return abortedIds
	}
}
