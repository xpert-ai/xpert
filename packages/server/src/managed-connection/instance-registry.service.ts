import type { IRuntimeInstanceRegistration, IRuntimeInstanceRetirementResult } from '@xpert-ai/contracts'
import {
	executionControlCapabilitiesSchema,
	type ExecutionControlCapabilities,
	type ControlledHandlerCapability
} from '@xpert-ai/contracts'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { hostname } from 'os'
import { runShutdownStep } from '../runtime-control/shutdown-step'
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
	private ready = false
	private readyUntil = 0
	private leaseExpiresAt = 0
	private executionControl?: ExecutionControlCapabilities

	constructor(
		@Inject(REDIS_CLIENT)
		private readonly redisClient: RedisClientLike
	) {}

	async onModuleInit(): Promise<void> {
		await this.refreshHeartbeat()
		this.timer = setInterval(() => void this.refreshHeartbeat(), INSTANCE_HEARTBEAT_INTERVAL_MS)
	}

	async onModuleDestroy(): Promise<void> {
		this.logger.debug(
			JSON.stringify({
				event: 'runtime.shutdown.instance-unregister-started',
				pid: process.pid,
				instanceId: this.instanceId,
				bootId: this.bootId,
				heartbeatInFlight: Boolean(this.heartbeatInFlight)
			})
		)
		// Stop creating heartbeat writes before waiting for the write already in flight.
		if (this.timer) {
			clearInterval(this.timer)
			this.timer = undefined
		}
		await runShutdownStep('instance-registry.heartbeat', () => this.heartbeatInFlight)
		// Compare boot IDs atomically: late cleanup from this PID must never remove its replacement's registration.
		await runShutdownStep('instance-registry.unregister', () =>
			this.redisClient.eval(REMOVE_INSTANCE_SCRIPT, {
				keys: [INSTANCE_MEMBERS_KEY, this.key(this.instanceId)],
				arguments: [this.instanceId, this.bootId]
			})
		)
	}

	async getRegisteredInstances(): Promise<RuntimeInstance[]> {
		return (await this.readMembers()).map(({ instanceId, bootId }) => ({ instanceId, bootId }))
	}

	/** Historical members remain auditable; only the matching live, ready boot can join a rollout. */
	async getReadyInstances(): Promise<RuntimeInstance[]> {
		const result: RuntimeInstance[] = []
		for (const member of await this.readMembers()) {
			const value = await this.redisClient.get?.(this.key(member.instanceId))
			if (!value) continue
			const live: unknown = JSON.parse(value)
			if (
				typeof live === 'object' &&
				live !== null &&
				'bootId' in live &&
				live.bootId === member.bootId &&
				'ready' in live &&
				live.ready === true &&
				'readyUntil' in live &&
				typeof live.readyUntil === 'number' &&
				live.readyUntil > Date.now()
			)
				result.push({ instanceId: member.instanceId, bootId: member.bootId })
		}
		return result
	}

	async reportExecutionControl(capabilities: ExecutionControlCapabilities) {
		this.executionControl = executionControlCapabilitiesSchema.parse(capabilities)
		await this.heartbeatInFlight
		await this.refreshHeartbeat()
	}

	/** Read the live boot, never an expired membership or a previous process's report. */
	async findControlledQueueWorkers(
		handler: ControlledHandlerCapability,
		pool: 'default' | 'sandbox-browser',
		queuePrefix: string,
		necessaryContinuation = false
	) {
		const result: RuntimeInstance[] = []
		const liveSchema = z.object({
			instanceId: z.string(),
			bootId: z.string(),
			ready: z.boolean(),
			readyUntil: z.number(),
			executionControl: executionControlCapabilitiesSchema
		})
		for (const member of await this.readMembers()) {
			const value = await this.redisClient.get?.(this.key(member.instanceId))
			if (!value) continue
			let parsed: ReturnType<typeof liveSchema.safeParse>
			try {
				parsed = liveSchema.safeParse(JSON.parse(value))
			} catch {
				continue
			}
			if (!parsed.success) continue
			const live = parsed.data,
				control = live.executionControl
			if (
				live.instanceId !== member.instanceId ||
				live.bootId !== member.bootId ||
				(!necessaryContinuation && (!live.ready || live.readyUntil <= Date.now())) ||
				control.validUntil <= Date.now() ||
				control.queuePrefix !== queuePrefix ||
				control.protocols.taskControl !== 2 ||
				control.protocols.managedQueue !== 3 ||
				!control.queuePools.includes(pool)
			)
				continue
			const candidates = control.handlers.filter(
				(item) =>
					item.pluginName === handler.pluginName &&
					item.queueName === handler.queueName &&
					item.jobName === handler.jobName
			)
			const selected =
				candidates.find((item) => item.scopeKey === handler.scopeKey) ??
				candidates.find((item) => item.scopeKey === null)
			if (selected?.controlContract === handler.controlContract) result.push(member)
		}
		return result
	}

	getLeaseRemainingMs(): number {
		return Math.max(0, this.leaseExpiresAt - Date.now())
	}

	isLeaseValid(): boolean {
		return Date.now() < this.leaseExpiresAt
	}

	canAdmitControlledWork(necessaryContinuation = false): boolean {
		return this.isLeaseValid() && (necessaryContinuation || (this.ready && Date.now() < this.readyUntil))
	}

	async setReady(ready: boolean, validUntil = Date.now() + INSTANCE_HEARTBEAT_TTL_SECONDS * 1_000): Promise<void> {
		if (this.ready === ready && (!ready || this.readyUntil === validUntil)) return
		this.ready = ready
		this.readyUntil = ready ? validUntil : 0
		await this.heartbeatInFlight
		await this.refreshHeartbeat()
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
			lastSeenAt: new Date().toISOString(),
			ready: this.ready && Date.now() < this.readyUntil,
			readyUntil: this.readyUntil,
			...(this.executionControl ? { executionControl: this.executionControl } : {})
		})
		const startedAt = Date.now()
		await this.redisClient.eval(WRITE_INSTANCE_SCRIPT, {
			keys: [INSTANCE_MEMBERS_KEY, this.key(this.instanceId)],
			arguments: [this.instanceId, payload, `${INSTANCE_HEARTBEAT_TTL_SECONDS}`]
		})
		this.leaseExpiresAt = startedAt + INSTANCE_HEARTBEAT_TTL_SECONDS * 1_000
	}

	private key(instanceId: string): string {
		return `managed-connection:instance:${instanceId}`
	}

	private describeError(error: unknown): string {
		return error instanceof Error ? error.message : String(error)
	}
}
