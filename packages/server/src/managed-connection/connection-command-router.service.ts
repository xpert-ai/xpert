import { randomUUID } from 'crypto'
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type {
	ConnectionCommandInvokeOptions,
	ConnectionCommandRouter,
	ManagedConnectionCommandHandler,
	ManagedConnectionCommandResult
} from '@xpert-ai/plugin-sdk'
import { REDIS_CLIENT } from '../core/redis/types'
import { InstanceRegistryService } from './instance-registry.service'
import { ManagedConnectionRegistryService } from './managed-connection-registry.service'

type RedisClientLike = {
	connect?: () => Promise<unknown>
	duplicate?: () => RedisClientLike
	publish?: (channel: string, message: string) => Promise<number>
	subscribe?: (channel: string, listener: (message: string) => void) => Promise<unknown>
	unsubscribe?: (channel: string) => Promise<unknown>
	quit?: () => Promise<unknown>
}

type RoutedCommandEnvelope = {
	requestId: string
	replyTo: string
	connectionType: string
	connectionKey: string
	command: string
	payload?: unknown
}

const DEFAULT_COMMAND_TIMEOUT_MS = 30_000

@Injectable()
export class ConnectionCommandRouterService implements ConnectionCommandRouter, OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(ConnectionCommandRouterService.name)
	private readonly handlers = new Map<string, ManagedConnectionCommandHandler>()
	private subscriber?: RedisClientLike

	constructor(
		@Inject(REDIS_CLIENT)
		private readonly redisClient: RedisClientLike,
		private readonly instanceRegistry: InstanceRegistryService,
		private readonly registry: ManagedConnectionRegistryService
	) {}

	async onModuleInit(): Promise<void> {
		if (!this.redisClient.duplicate || !this.redisClient.publish) {
			this.logger.warn(
				'Redis client does not support Pub/Sub duplicate; cross-instance connection commands disabled.'
			)
			return
		}

		this.subscriber = this.redisClient.duplicate()
		if (!this.subscriber.subscribe) {
			this.logger.warn(
				'Redis subscriber does not support subscribe; cross-instance connection commands disabled.'
			)
			return
		}
		await this.subscriber.connect?.()
		await this.subscriber.subscribe(this.commandChannel(this.instanceRegistry.instanceId), (message) => {
			void this.handleRoutedCommand(message)
		})
	}

	async onModuleDestroy(): Promise<void> {
		const channel = this.commandChannel(this.instanceRegistry.instanceId)
		await this.subscriber?.unsubscribe?.(channel).catch((error) => {
			this.logger.warn(`Failed to unsubscribe managed connection command channel: ${this.describeError(error)}`)
		})
		await this.subscriber?.quit?.().catch((error) => {
			this.logger.warn(`Failed to close managed connection command subscriber: ${this.describeError(error)}`)
		})
		this.subscriber = undefined
	}

	registerHandler(connectionType: string, handler: ManagedConnectionCommandHandler): void {
		const normalizedType = this.requireValue(connectionType, 'connectionType')
		this.handlers.set(normalizedType, handler)
	}

	async invokeOwner(
		connectionType: string,
		connectionKey: string,
		command: string,
		payload?: unknown,
		options: ConnectionCommandInvokeOptions = {}
	): Promise<unknown> {
		const normalizedType = this.requireValue(connectionType, 'connectionType')
		const normalizedKey = this.requireValue(connectionKey, 'connectionKey')
		const normalizedCommand = this.requireValue(command, 'command')
		const ownerInstanceId = await this.registry.getOwner({
			pluginName: options.pluginName,
			connectionType: normalizedType,
			connectionKey: normalizedKey,
			tenantId: options.tenantId,
			organizationId: options.organizationId
		})

		if (!ownerInstanceId) {
			throw new Error(`Managed connection owner not found for ${normalizedType}/${normalizedKey}`)
		}

		if (ownerInstanceId === this.instanceRegistry.instanceId) {
			return this.dispatchLocal({
				requestId: randomUUID(),
				connectionType: normalizedType,
				connectionKey: normalizedKey,
				command: normalizedCommand,
				payload
			})
		}

		return this.invokeRemote(
			ownerInstanceId,
			{
				requestId: randomUUID(),
				replyTo: '',
				connectionType: normalizedType,
				connectionKey: normalizedKey,
				command: normalizedCommand,
				payload
			},
			options.timeoutMs
		)
	}

	private async invokeRemote(
		ownerInstanceId: string,
		envelope: RoutedCommandEnvelope,
		timeoutMs?: number
	): Promise<unknown> {
		if (!this.redisClient.duplicate || !this.redisClient.publish) {
			throw new Error('Redis Pub/Sub is not available for managed connection command routing.')
		}

		const replyClient = this.redisClient.duplicate()
		if (!replyClient.subscribe) {
			throw new Error('Redis Pub/Sub subscribe is not available for managed connection command routing.')
		}
		await replyClient.connect?.()
		const requestId = envelope.requestId
		const replyChannel = this.replyChannel(this.instanceRegistry.instanceId, requestId)
		const commandChannel = this.commandChannel(ownerInstanceId)
		const commandEnvelope = {
			...envelope,
			replyTo: replyChannel
		}

		let settled = false
		let timer: ReturnType<typeof setTimeout> | undefined
		const cleanup = async () => {
			if (timer) {
				clearTimeout(timer)
				timer = undefined
			}
			await replyClient.unsubscribe?.(replyChannel).catch(() => undefined)
			await replyClient.quit?.().catch(() => undefined)
		}

		const result = new Promise<unknown>((resolve, reject) => {
			timer = setTimeout(() => {
				if (settled) {
					return
				}
				settled = true
				void cleanup()
				reject(
					new Error(`Managed connection command ${requestId} timed out after ${this.timeout(timeoutMs)}ms`)
				)
			}, this.timeout(timeoutMs))

			void replyClient
				.subscribe(replyChannel, (message) => {
					if (settled) {
						return
					}
					settled = true
					void cleanup()
					const response = this.parseResult(message)
					if (!response.ok) {
						reject(new Error(response.error || 'Managed connection command failed'))
						return
					}
					resolve(response.result)
				})
				.then(async () => {
					const listeners = await this.redisClient.publish?.(commandChannel, JSON.stringify(commandEnvelope))
					if (!listeners && !settled) {
						settled = true
						void cleanup()
						reject(new Error(`Managed connection owner ${ownerInstanceId} is not listening for commands.`))
					}
				})
				.catch((error) => {
					if (settled) {
						return
					}
					settled = true
					void cleanup()
					reject(error)
				})
		})

		return result
	}

	private async handleRoutedCommand(message: string): Promise<void> {
		const envelope = this.parseEnvelope(message)
		if (!envelope) {
			return
		}

		try {
			const result = await this.dispatchLocal(envelope)
			await this.publishResult(envelope.replyTo, {
				ok: true,
				result
			})
		} catch (error) {
			await this.publishResult(envelope.replyTo, {
				ok: false,
				error: this.describeError(error)
			})
		}
	}

	private async dispatchLocal(envelope: Omit<RoutedCommandEnvelope, 'replyTo'>): Promise<unknown> {
		const handler = this.handlers.get(envelope.connectionType)
		if (!handler) {
			throw new Error(`No managed connection handler registered for "${envelope.connectionType}"`)
		}
		return handler({
			requestId: envelope.requestId,
			connectionType: envelope.connectionType,
			connectionKey: envelope.connectionKey,
			command: envelope.command,
			payload: envelope.payload
		})
	}

	private async publishResult(channel: string, result: ManagedConnectionCommandResult): Promise<void> {
		if (!channel) {
			return
		}
		await this.redisClient.publish?.(channel, JSON.stringify(result))
	}

	private parseEnvelope(message: string): RoutedCommandEnvelope | null {
		try {
			const parsed = JSON.parse(message) as RoutedCommandEnvelope
			if (
				!parsed?.requestId ||
				!parsed.replyTo ||
				!parsed.connectionType ||
				!parsed.connectionKey ||
				!parsed.command
			) {
				return null
			}
			return parsed
		} catch (error) {
			this.logger.warn(`Invalid managed connection command envelope: ${this.describeError(error)}`)
			return null
		}
	}

	private parseResult(message: string): ManagedConnectionCommandResult {
		try {
			const parsed = JSON.parse(message) as ManagedConnectionCommandResult
			return {
				ok: Boolean(parsed?.ok),
				result: parsed?.result,
				error: parsed?.error
			}
		} catch (error) {
			return {
				ok: false,
				error: this.describeError(error)
			}
		}
	}

	private commandChannel(instanceId: string): string {
		return `managed-connection:commands:${instanceId}`
	}

	private replyChannel(instanceId: string, requestId: string): string {
		return `managed-connection:replies:${instanceId}:${requestId}`
	}

	private timeout(timeoutMs?: number): number {
		return Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.trunc(timeoutMs) : DEFAULT_COMMAND_TIMEOUT_MS
	}

	private requireValue(value: string | null | undefined, field: string): string {
		const normalized = `${value ?? ''}`.trim()
		if (!normalized) {
			throw new Error(`ManagedConnection command ${field} is required`)
		}
		return normalized
	}

	private describeError(error: unknown): string {
		return error instanceof Error ? error.message : String(error)
	}
}
