import type { IRuntimeInstanceRegistration, IRuntimeInstanceRetirementResult } from '@xpert-ai/contracts'
import { randomUUID } from 'crypto'
import { hostname } from 'os'
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { REDIS_CLIENT } from '../core/redis/types'

type RedisClientLike = {
	get?: (key: string) => Promise<string | null>
	hGetAll: (key: string) => Promise<Record<string, string>>
	eval: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<unknown>
}

const INSTANCE_HEARTBEAT_TTL_SECONDS = 45
const INSTANCE_HEARTBEAT_INTERVAL_MS = 15_000
const INSTANCE_MEMBERS_KEY = 'managed-connection:instances'
const WRITE_INSTANCE_SCRIPT = `
-- xpert-write-instance
redis.call('setex', KEYS[2], tonumber(ARGV[3]), ARGV[2])
redis.call('hset', KEYS[1], ARGV[1], ARGV[2])
return 1
`
const REMOVE_INSTANCE_SCRIPT = `
-- xpert-remove-instance
local member = redis.call('hget', KEYS[1], ARGV[1])
if member and cjson.decode(member)['bootId'] == ARGV[2] then
  redis.call('hdel', KEYS[1], ARGV[1])
  redis.call('del', KEYS[2])
end
return 1
`

const RETIRE_INSTANCE_SCRIPT = `
-- xpert-retire-instance
local member = redis.call('hget', KEYS[1], ARGV[1])
if not member then return 'not-found' end
if cjson.decode(member)['bootId'] ~= ARGV[2] then return 'boot-changed' end
if redis.call('exists', KEYS[2]) == 1 then return 'online' end
redis.call('hdel', KEYS[1], ARGV[1])
return 'retired'
`

export interface RuntimeInstance {
	instanceId: string
	bootId: string
}

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
	readonly bootId: string = randomUUID()
	private timer?: ReturnType<typeof setInterval>
	private pluginState: RuntimePluginState | null = null
	private heartbeatInFlight?: Promise<void>

	constructor(
		@Inject(REDIS_CLIENT)
		private readonly redisClient: RedisClientLike
	) {}

	async onModuleInit(): Promise<void> {
		await this.refreshHeartbeat()
		this.timer = setInterval(() => void this.refreshHeartbeat(), INSTANCE_HEARTBEAT_INTERVAL_MS)
	}

	async onModuleDestroy(): Promise<void> {
		if (this.timer) {
			clearInterval(this.timer)
			this.timer = undefined
		}
		await this.heartbeatInFlight
		await this.redisClient
			.eval(REMOVE_INSTANCE_SCRIPT, {
				keys: [INSTANCE_MEMBERS_KEY, this.key(this.instanceId)],
				arguments: [this.instanceId, this.bootId]
			})
			.catch((error) => {
				this.logger.warn(`Failed to remove managed connection instance heartbeat: ${this.describeError(error)}`)
			})
	}

	async getRegisteredInstances(): Promise<RuntimeInstance[]> {
		return (await this.readMembers()).map(({ instanceId, bootId }) => ({ instanceId, bootId }))
	}

	async getRegisteredInstanceDetails(): Promise<IRuntimeInstanceRegistration[]> {
		return Promise.all(
			(await this.readMembers()).map(async (member) => ({
				...member,
				online: await this.isAlive(member.instanceId)
			}))
		)
	}

	async retireInstance(instanceId: string, expectedBootId: string): Promise<IRuntimeInstanceRetirementResult> {
		// Compare identity and liveness atomically, so a replacement/returning heartbeat cannot be removed.
		const status = await this.redisClient.eval(RETIRE_INSTANCE_SCRIPT, {
			keys: [INSTANCE_MEMBERS_KEY, this.key(instanceId)],
			arguments: [instanceId, expectedBootId]
		})
		if (status !== 'retired' && status !== 'not-found' && status !== 'boot-changed' && status !== 'online') {
			throw new Error('Invalid runtime instance retirement result')
		}
		return { status }
	}

	private async readMembers(): Promise<Omit<IRuntimeInstanceRegistration, 'online'>[]> {
		const members = await this.redisClient.hGetAll(INSTANCE_MEMBERS_KEY)
		const active: Omit<IRuntimeInstanceRegistration, 'online'>[] = []
		for (const [instanceId, value] of Object.entries(members)) {
			const member: unknown = JSON.parse(value)
			if (
				typeof member !== 'object' ||
				member === null ||
				!('instanceId' in member) ||
				member.instanceId !== instanceId ||
				!('bootId' in member) ||
				typeof member.bootId !== 'string' ||
				!('lastSeenAt' in member) ||
				typeof member.lastSeenAt !== 'string'
			)
				throw new Error('Invalid runtime instance membership')
			const lastSeenAt = Date.parse(member.lastSeenAt)
			if (!Number.isFinite(lastSeenAt)) throw new Error('Invalid runtime instance heartbeat timestamp')
			// Heartbeat loss is not an explicit departure. Keep unknown members until they return or leave.
			active.push({ instanceId, bootId: member.bootId, lastSeenAt: member.lastSeenAt })
		}
		return active
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

	private refreshHeartbeat(): Promise<void> {
		if (this.heartbeatInFlight) return this.heartbeatInFlight
		this.heartbeatInFlight = this.heartbeat()
			.catch((error) => {
				this.logger.warn(`Failed to write managed connection instance heartbeat: ${this.describeError(error)}`)
			})
			.finally(() => {
				this.heartbeatInFlight = undefined
			})
		return this.heartbeatInFlight
	}

	private async heartbeat(): Promise<void> {
		const payload = JSON.stringify({
			instanceId: this.instanceId,
			bootId: this.bootId,
			host: hostname(),
			pid: process.pid,
			lastSeenAt: new Date().toISOString()
		})
		await this.redisClient.eval(WRITE_INSTANCE_SCRIPT, {
			keys: [INSTANCE_MEMBERS_KEY, this.key(this.instanceId)],
			arguments: [this.instanceId, payload, `${INSTANCE_HEARTBEAT_TTL_SECONDS}`]
		})
	}

	private key(instanceId: string): string {
		return `managed-connection:instance:${instanceId}`
	}

	private describeError(error: unknown): string {
		return error instanceof Error ? error.message : String(error)
	}
}
