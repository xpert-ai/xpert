import { controlAdmissionUnavailable } from '../task-control/control-schema'
import { Injectable, Logger } from '@nestjs/common'
import type { ControlledHandlerCapability } from '@xpert-ai/contracts'
import type {
	ManagedQueueHandlerRegistration,
	ManagedQueueJobHandler,
	ManagedQueueHandlerRegistry
} from '@xpert-ai/plugin-sdk'

type HandlerEntry = {
	key: string
	handler: ManagedQueueJobHandler
	sourceHandler: ManagedQueueJobHandler
	registration: symbol
	capability: ControlledHandlerCapability | null
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
		const identity = Symbol(key)
		this.handlers.set(key, {
			key,
			handler: this.applyConcurrencyLimit(
				sourceHandler,
				registration.concurrency,
				Boolean(registration.controlContract),
				() => this.handlers.get(key)?.registration === identity
			),
			sourceHandler,
			registration: identity,
			capability: registration.controlContract
				? {
						pluginName: registration.pluginName,
						queueName: registration.queueName,
						jobName: registration.jobName,
						scopeKey: registration.scopeKey ?? null,
						controlContract: registration.controlContract
					}
				: null
		})
		return () => {
			const current = this.handlers.get(key)
			if (current?.registration === identity) {
				this.handlers.delete(key)
			}
		}
	}

	resolve(input: {
		controlContract?: string
		pluginName: string
		queueName: string
		jobName: string
		scopeKey?: string | null
	}): ManagedQueueJobHandler | null {
		const scopedKey = this.buildKey(input)
		const scoped = this.handlers.get(scopedKey)
		const globalKey = this.buildKey({ ...input, scopeKey: null })
		const entry = scoped ?? this.handlers.get(globalKey)
		if (input.controlContract && entry?.capability?.controlContract !== input.controlContract) return null
		return entry?.handler ?? null
	}

	controlHandlers(): ControlledHandlerCapability[] {
		return Array.from(this.handlers.values()).flatMap((entry) =>
			entry.capability ? [{ ...entry.capability }] : []
		)
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

	private applyConcurrencyLimit(
		handler: ManagedQueueJobHandler,
		concurrency: number | undefined,
		controlled: boolean,
		current: () => boolean
	): ManagedQueueJobHandler {
		const normalized = Number(concurrency)
		if (!controlled && (!Number.isFinite(normalized) || normalized <= 0)) return handler
		const max = Number.isFinite(normalized) && normalized > 0 ? Math.trunc(normalized) : Infinity
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
				if (context.control && !current()) throw controlAdmissionUnavailable('handler')
				context.control?.signal.throwIfAborted()
				if (context.control && (await context.control.desired()) === 'terminated')
					throw new Error('Task terminated before handler admission')
				await handler(job, context)
			} finally {
				release()
			}
		}
	}
}
