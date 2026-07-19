import { Injectable, Logger } from '@nestjs/common'
import type {
	ManagedQueueHandlerRegistration,
	ManagedQueueJobHandler,
	ManagedQueueHandlerRegistry
} from '@xpert-ai/plugin-sdk'

type HandlerEntry = {
	key: string
	handler: ManagedQueueJobHandler
	sourceHandler: ManagedQueueJobHandler
}

@Injectable()
export class ManagedQueueHandlerRegistryService implements ManagedQueueHandlerRegistry {
	private readonly logger = new Logger(ManagedQueueHandlerRegistryService.name)
	private readonly handlers = new Map<string, HandlerEntry>()

	register<TPayload = unknown>(registration: ManagedQueueHandlerRegistration<TPayload>): () => void {
		const key = this.buildKey(registration)
		if (this.handlers.has(key)) {
			this.logger.warn(`Replacing managed queue handler ${key}`)
		}
		const sourceHandler = registration.handler as ManagedQueueJobHandler
		this.handlers.set(key, {
			key,
			handler: this.applyConcurrencyLimit(sourceHandler, registration.concurrency),
			sourceHandler
		})
		return () => {
			const current = this.handlers.get(key)
			if (current?.sourceHandler === registration.handler) {
				this.handlers.delete(key)
			}
		}
	}

	resolve(input: {
		pluginName: string
		queueName: string
		jobName: string
		scopeKey?: string | null
	}): ManagedQueueJobHandler | null {
		const scopedKey = this.buildKey(input)
		const scoped = this.handlers.get(scopedKey)
		if (scoped) {
			return scoped.handler
		}
		const globalKey = this.buildKey({ ...input, scopeKey: null })
		return this.handlers.get(globalKey)?.handler ?? null
	}

	private buildKey(input: { pluginName: string; queueName: string; jobName: string; scopeKey?: string | null }) {
		return [
			this.requireValue(input.scopeKey, 'scopeKey', true) || '*',
			this.requireValue(input.pluginName, 'pluginName'),
			this.requireValue(input.queueName, 'queueName'),
			this.requireValue(input.jobName, 'jobName')
		].join(':')
	}

	private requireValue(value: string | null | undefined, field: string, optional = false): string {
		const normalized = `${value ?? ''}`.trim()
		if (!normalized && !optional) {
			throw new Error(`ManagedQueue handler ${field} is required`)
		}
		return normalized
	}

	private applyConcurrencyLimit(handler: ManagedQueueJobHandler, concurrency?: number): ManagedQueueJobHandler {
		const normalized = Number(concurrency)
		if (!Number.isFinite(normalized) || normalized <= 0) {
			return handler
		}

		const max = Math.trunc(normalized)
		let active = 0
		const waiting: Array<() => void> = []

		const acquire = () => {
			if (active < max) {
				active += 1
				return Promise.resolve()
			}

			return new Promise<void>((resolve) => {
				waiting.push(resolve)
			})
		}

		const release = () => {
			const next = waiting.shift()
			if (next) {
				next()
				return
			}
			active = Math.max(0, active - 1)
		}

		return async (job, context) => {
			await acquire()
			try {
				await handler(job, context)
			} finally {
				release()
			}
		}
	}
}
