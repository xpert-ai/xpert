import { runtimeAdmissionMonitorProvider, runtimePluginAdmissionProvider } from './runtime-admission.providers'
import { RuntimeAdmissionMonitor } from './runtime-admission-monitor'
import { readRuntimeTrafficOptions, RuntimeTrafficOptions } from './runtime-traffic-options'
import type { IRuntimePluginRequirement } from '@xpert-ai/contracts'
import { RuntimePluginState } from '../managed-connection/instance-registry.service'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'
import { RuntimeProcessSignaler } from './runtime-process-signaler'
import { RuntimeRestartCoordinatorService } from './runtime-restart-coordinator.service'
import type { RestartRegistry } from './runtime-plugin-admission'
import type { PluginGenerationState } from './runtime-restart.types'

type Listener = (message: string) => void

export class FakeRedis {
	readonly members = new Map<string, { instanceId: string; bootId: string; ready: boolean; readyUntil: number }>()
	readonly values = new Map<string, string>()
	readonly hashes = new Map<string, Map<string, string>>()
	readonly expiresAt = new Map<string, number>()
	readonly listeners = new Map<string, Set<Listener>>()
	onActiveReleased?: () => Promise<void>
	onGenerationPublished?: (generation: number) => Promise<void>

	async set(key: string, value: string, options?: { NX?: boolean; PX?: number; EX?: number }) {
		this.expireKeyIfNeeded(key)
		if (options?.NX && this.values.has(key)) return null
		this.values.set(key, value)
		if (options?.PX) {
			this.expiresAt.set(key, Date.now() + options.PX)
		} else if (options?.EX) {
			this.expiresAt.set(key, Date.now() + options.EX * 1_000)
		} else {
			this.expiresAt.delete(key)
		}
		return 'OK'
	}

	async get(key: string) {
		this.expireKeyIfNeeded(key)
		return this.values.get(key) ?? null
	}

	async hSet(key: string, field: string, value: string) {
		this.expireKeyIfNeeded(key)
		const hash = this.hashes.get(key) ?? new Map<string, string>()
		const added = hash.has(field) ? 0 : 1
		hash.set(field, value)
		this.hashes.set(key, hash)
		return added
	}

	async hGetAll(key: string) {
		this.expireKeyIfNeeded(key)
		return Object.fromEntries(this.hashes.get(key) ?? [])
	}

	async expire(key: string, seconds: number) {
		this.expireKeyIfNeeded(key)
		if (!this.values.has(key) && !this.hashes.has(key)) return false
		this.expiresAt.set(key, Date.now() + seconds * 1_000)
		return true
	}

	async eval(script: string, options: { keys: string[]; arguments: string[] }) {
		if (script.includes('xpert-write-generation-state')) {
			const [value, generation, ttl, restartId] = options.arguments
			if (restartId && (await this.get(options.keys[2])) !== restartId) return 0
			const desired = await this.hGetAll(options.keys[1])
			const current = desired.generation === generation
			if (current && desired.status === 'failed') return 0
			const next: PluginGenerationState = JSON.parse(value)
			if (next.status === 'awaiting_restart') {
				if (await this.get(options.keys[2])) return 0
				const previousValue = await this.get(options.keys[0])
				if (!previousValue) return 0
				const previous: PluginGenerationState = JSON.parse(previousValue)
				if (previous.restartId || !['in_progress', 'awaiting_restart'].includes(previous.status)) return 0
			}
			await this.set(options.keys[0], value, { EX: Number(ttl) })
			if (current) await this.hSet(options.keys[1], 'status', next.status)
			return 1
		}
		if (script.includes('xpert-start-plugin-catch-up')) {
			const [generation, restartId, ttl] = options.arguments
			const desired = await this.hGetAll(options.keys[0])
			if (desired.generation !== generation || desired.status !== 'completed') return 0
			if ((await this.set(options.keys[1], restartId, { NX: true, PX: Number(ttl) })) !== 'OK') return 0
			await this.hSet(options.keys[0], 'status', 'in_progress')
			return 1
		}
		if (script.includes('xpert-update-restart-target')) {
			const [restartId, replicaId, previous, next] = options.arguments
			if (
				(await this.get(options.keys[1])) !== restartId ||
				this.hashes.get(options.keys[0])?.get(replicaId) !== previous
			)
				return 0
			if (options.arguments[5] !== '' && ((await this.get(options.keys[3])) ?? '0') !== options.arguments[5])
				return 0
			await this.hSet(options.keys[0], replicaId, next)
			if (Number(options.arguments[4]) > 0) await this.hSet(options.keys[2], replicaId, options.arguments[4])
			return 1
		}
		if (script.includes('xpert-publish-plugin-generation')) {
			const generationKey = options.keys[0]
			const generation = Number.parseInt(this.values.get(generationKey) ?? '0', 10) + 1
			this.values.set(generationKey, `${generation}`)
			const change = JSON.parse(options.arguments[0])
			change.generation = generation
			const prefix = options.arguments[1]
			const ttlMs = Number.parseInt(options.arguments[2], 10) * 1_000
			const changeKey = `${prefix}${generation}:change`
			const statusKey = `${prefix}${generation}:status`
			this.values.set(changeKey, JSON.stringify(change))
			this.values.set(statusKey, JSON.stringify({ generation, status: 'in_progress' }))
			this.expiresAt.set(changeKey, Date.now() + ttlMs)
			this.expiresAt.set(statusKey, Date.now() + ttlMs)
			for (const item of change.requirements) {
				await this.hSet(options.keys[1], JSON.stringify([item.scopeKey, item.pluginName]), JSON.stringify(item))
			}
			await this.hSet(options.keys[1], 'generation', `${generation}`)
			await this.hSet(options.keys[1], 'status', 'in_progress')
			const plugins = Object.entries(await this.hGetAll(options.keys[1]))
				.filter(([key]) => key !== 'generation' && key !== 'status')
				.map(([, value]) => JSON.parse(value))
			await this.set(`${prefix}${generation}:requirements`, JSON.stringify(plugins), { EX: ttlMs / 1_000 })
			await this.onGenerationPublished?.(generation)
			return generation
		}

		const [key] = options.keys
		const [expected] = options.arguments
		this.expireKeyIfNeeded(key)
		if (this.values.get(key) !== expected) return options.keys.length > 1 ? -1 : 0
		if (script.includes("redis.call('pexpire'")) {
			this.expiresAt.set(key, Date.now() + Number.parseInt(options.arguments[1], 10))
			return 1
		}
		if (options.keys.length > 1) {
			const expectedGeneration = options.arguments[1]
			const nextRestartId = options.arguments[2]
			this.expireKeyIfNeeded(options.keys[1])
			if ((this.values.get(options.keys[1]) ?? '0') !== expectedGeneration) return 0
			if (nextRestartId) {
				this.values.set(key, nextRestartId)
				this.expiresAt.set(key, Date.now() + Number.parseInt(options.arguments[3], 10))
				return 1
			}
		}
		this.values.delete(key)
		this.expiresAt.delete(key)
		if (key === 'xpert:system:runtime:restart:active' && this.onActiveReleased) {
			const callback = this.onActiveReleased
			this.onActiveReleased = undefined
			await callback()
		}
		return 1
	}

	private expireKeyIfNeeded(key: string) {
		const expiresAt = this.expiresAt.get(key)
		if (expiresAt !== undefined && expiresAt <= Date.now()) {
			this.values.delete(key)
			this.hashes.delete(key)
			this.expiresAt.delete(key)
		}
	}

	duplicate() {
		const owned = new Map<string, Listener>()
		return {
			connect: async () => undefined,
			subscribe: async (channel: string, listener: Listener) => {
				const listeners = this.listeners.get(channel) ?? new Set<Listener>()
				listeners.add(listener)
				this.listeners.set(channel, listeners)
				owned.set(channel, listener)
			},
			unsubscribe: async (channel: string) => {
				const listener = owned.get(channel)
				if (listener) this.listeners.get(channel)?.delete(listener)
				owned.delete(channel)
			},
			quit: async () => {
				for (const [channel, listener] of owned) this.listeners.get(channel)?.delete(listener)
				owned.clear()
			}
		}
	}

	async publish(channel: string, message: string) {
		for (const listener of Array.from(this.listeners.get(channel) ?? [])) listener(message)
		return this.listeners.get(channel)?.size ?? 0
	}
}

export type RuntimeNode = {
	replicaId: string
	bootId: string
	coordinator: RuntimeRestartCoordinatorService
	admissionMonitor: RuntimeAdmissionMonitor
	registry: RestartRegistry
	destroy: () => Promise<void>
	signaler: RuntimeProcessSignaler
	lifecycle: RuntimeLifecycleService
	reportPluginState: (state: RuntimePluginState) => void
}

export const requirement: IRuntimePluginRequirement = {
	scopeKey: 'org-1',
	pluginName: '@xpert-ai/plugin-openrouter',
	version: '0.1.0',
	state: 'loaded'
}

export async function createNode(
	redis: FakeRedis,
	replicaId: string,
	bootId: string,
	initialState: RuntimePluginState | null,
	start = true,
	trafficOptions: RuntimeTrafficOptions = readRuntimeTrafficOptions({})
): Promise<RuntimeNode> {
	redis.members.set(replicaId, { instanceId: replicaId, bootId, ready: false, readyUntil: Date.now() + 45_000 })
	const registry = {
		instanceId: replicaId,
		bootId,
		getReadyInstances: async () =>
			Array.from(redis.members.values()).filter((member) => member.ready && member.readyUntil > Date.now()),
		isLeaseValid: () => redis.members.get(replicaId)?.bootId === bootId,
		setReady: async (ready: boolean, validUntil: number) => {
			const member = redis.members.get(replicaId)
			if (member?.bootId === bootId) {
				member.ready = ready
				member.readyUntil = validUntil
			}
		},
		getPluginState: () => initialState
	} satisfies RestartRegistry
	const signaler: RuntimeProcessSignaler = { signal: jest.fn() }
	const lifecycle = new RuntimeLifecycleService()
	const admission = await runtimePluginAdmissionProvider.useFactory(registry, lifecycle)
	const admissionMonitor = await runtimeAdmissionMonitorProvider.useFactory(redis, registry, admission)
	const coordinator = new RuntimeRestartCoordinatorService(
		redis,
		signaler,
		lifecycle,
		registry,
		admission,
		admissionMonitor,
		trafficOptions
	)
	if (start) {
		await coordinator.onModuleInit()
		admissionMonitor.onApplicationBootstrap()
		coordinator.onApplicationBootstrap()
		await advance(0)
	}
	return {
		replicaId,
		bootId,
		coordinator,
		admissionMonitor,
		registry,
		destroy: async () => {
			admissionMonitor.onModuleDestroy()
			await coordinator.onModuleDestroy()
		},
		signaler,
		lifecycle,
		reportPluginState: (state) => {
			initialState = state
		}
	}
}

export function emptyPluginState(): RuntimePluginState {
	return { reportedAt: new Date().toISOString(), plugins: [], failures: [] }
}

export function loadedPluginState(runtimeRevision?: string): RuntimePluginState {
	return {
		reportedAt: new Date().toISOString(),
		plugins: [
			{
				scopeKey: requirement.scopeKey,
				pluginName: requirement.pluginName,
				version: requirement.version,
				...(runtimeRevision ? { runtimeRevision } : {})
			}
		],
		failures: []
	}
}

export function oldPluginState(): RuntimePluginState {
	return {
		reportedAt: new Date().toISOString(),
		plugins: [
			{
				scopeKey: requirement.scopeKey,
				pluginName: requirement.pluginName,
				version: '0.0.2'
			}
		],
		failures: []
	}
}

export async function readTargets(redis: FakeRedis, restartId: string) {
	const values = await redis.hGetAll(`xpert:system:runtime:restart:${restartId}:targets`)
	return Object.values(values).map(
		(value) => JSON.parse(value) as { replicaId: string; status: 'pending' | 'restarting' | 'completed' | 'failed' }
	)
}

export async function advance(milliseconds: number) {
	await jest.advanceTimersByTimeAsync(milliseconds)
	await Promise.resolve()
	await Promise.resolve()
}
