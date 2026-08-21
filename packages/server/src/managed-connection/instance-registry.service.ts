import { randomUUID } from 'crypto'
import { hostname } from 'os'
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { REDIS_CLIENT } from '../core/redis/types'

type RedisClientLike = {
	setEx?: (key: string, seconds: number, value: string) => Promise<unknown>
	get?: (key: string) => Promise<string | null>
	del?: (...keys: string[]) => Promise<unknown>
}

const INSTANCE_HEARTBEAT_TTL_SECONDS = 45
const INSTANCE_HEARTBEAT_INTERVAL_MS = 15_000

export interface RuntimePluginStateItem {
	scopeKey: string
	pluginName: string
	packageName?: string
	version?: string
	runtimeRevision?: string
}

export interface RuntimePluginFailureItem {
	scopeKey: string
	pluginName: string
	packageName?: string
	error: string
}

export interface RuntimePluginState {
	reportedAt: string
	plugins: RuntimePluginStateItem[]
	failures: RuntimePluginFailureItem[]
}

@Injectable()
export class InstanceRegistryService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(InstanceRegistryService.name)
	readonly instanceId =
		process.env.XPERT_INSTANCE_ID ||
		process.env.HOSTNAME ||
		`${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`
	readonly bootId = randomUUID()
	private timer?: ReturnType<typeof setInterval>
	private pluginState: RuntimePluginState | null = null

	constructor(
		@Inject(REDIS_CLIENT)
		private readonly redisClient: RedisClientLike
	) {}

	onModuleInit(): void {
		void this.heartbeat()
		this.timer = setInterval(() => void this.heartbeat(), INSTANCE_HEARTBEAT_INTERVAL_MS)
	}

	async onModuleDestroy(): Promise<void> {
		if (this.timer) {
			clearInterval(this.timer)
			this.timer = undefined
		}
		await this.redisClient.del?.(this.key(this.instanceId)).catch((error) => {
			this.logger.warn(`Failed to remove managed connection instance heartbeat: ${this.describeError(error)}`)
		})
	}

	async isAlive(instanceId: string): Promise<boolean> {
		const value = await this.redisClient.get?.(this.key(instanceId))
		return Boolean(value)
	}

	getPluginState(): RuntimePluginState | null {
		return this.pluginState
			? {
					...this.pluginState,
					plugins: this.pluginState.plugins.map((plugin) => ({ ...plugin })),
					failures: this.pluginState.failures.map((failure) => ({ ...failure }))
				}
			: null
	}

	async reportPluginState(state: Omit<RuntimePluginState, 'reportedAt'>): Promise<void> {
		this.pluginState = {
			reportedAt: new Date().toISOString(),
			plugins: state.plugins.map((plugin) => ({ ...plugin })),
			failures: state.failures.map((failure) => ({ ...failure }))
		}
	}

	private async heartbeat(): Promise<void> {
		const payload = JSON.stringify({
			instanceId: this.instanceId,
			host: hostname(),
			pid: process.pid,
			lastSeenAt: new Date().toISOString()
		})
		await this.redisClient
			.setEx?.(this.key(this.instanceId), INSTANCE_HEARTBEAT_TTL_SECONDS, payload)
			.catch((error) => {
				this.logger.warn(`Failed to write managed connection instance heartbeat: ${this.describeError(error)}`)
			})
	}

	private key(instanceId: string): string {
		return `managed-connection:instance:${instanceId}`
	}

	private describeError(error: unknown): string {
		return error instanceof Error ? error.message : String(error)
	}
}
