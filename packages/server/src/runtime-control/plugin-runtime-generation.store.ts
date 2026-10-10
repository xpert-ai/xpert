/**
 * Invariants:
 * - Desired requirements and the outcome outlive expiring operation history.
 * - A failed generation stays blocked until a new generation is explicitly published.
 * - Catch-up admission checks the current outcome atomically with acquiring the active operation.
 */
import type { IRuntimePluginRequirement, RuntimeRestartStatus } from '@xpert-ai/contracts'
import type { PluginGenerationChange, PluginGenerationState, RuntimeRestartRedisClient } from './runtime-restart.types'

export const PLUGIN_GENERATION_KEY = 'xpert:system:plugin-runtime:generation'
const PLUGIN_GENERATION_PREFIX = 'xpert:system:plugin-runtime:generation:'
const PLUGIN_GENERATION_TTL_SECONDS = 24 * 60 * 60
const DESIRED_PLUGINS_KEY = 'xpert:system:plugin-runtime:desired'
export const REPLICA_ATTEMPTS_KEY = 'xpert:system:plugin-runtime:attempts'
const PUBLISH_PLUGIN_GENERATION_SCRIPT = `
-- xpert-publish-plugin-generation
local generation = redis.call('incr', KEYS[1])
local change = cjson.decode(ARGV[1])
change['generation'] = generation
local state = { generation = generation, status = 'in_progress' }
redis.call('set', ARGV[2] .. generation .. ':change', cjson.encode(change), 'EX', tonumber(ARGV[3]))
redis.call('set', ARGV[2] .. generation .. ':status', cjson.encode(state), 'EX', tonumber(ARGV[3]))
for _, requirement in ipairs(change['requirements']) do
  redis.call('hset', KEYS[2], cjson.encode({requirement['scopeKey'], requirement['pluginName']}), cjson.encode(requirement))
end
redis.call('hset', KEYS[2], 'generation', tostring(generation), 'status', 'in_progress')
return generation
`

const WRITE_GENERATION_STATE_SCRIPT = `
-- xpert-write-generation-state
if ARGV[4] ~= '' and redis.call('get', KEYS[3]) ~= ARGV[4] then return 0 end
local current = redis.call('hget', KEYS[2], 'generation') == ARGV[2]
if current and redis.call('hget', KEYS[2], 'status') == 'failed' then return 0 end
redis.call('set', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[3]))
if current then redis.call('hset', KEYS[2], 'status', cjson.decode(ARGV[1])['status']) end
return 1
`
const START_CATCH_UP_SCRIPT = `
-- xpert-start-plugin-catch-up
if redis.call('hget', KEYS[1], 'generation') ~= ARGV[1] or
   redis.call('hget', KEYS[1], 'status') ~= 'completed' then return 0 end
if not redis.call('set', KEYS[2], ARGV[2], 'NX', 'PX', tonumber(ARGV[3])) then return 0 end
redis.call('hset', KEYS[1], 'status', 'in_progress')
return 1
`
const ACTIVE_RESTART_KEY = 'xpert:system:runtime:restart:active'

export class PluginRuntimeGenerationStore {
	constructor(private readonly redis: RuntimeRestartRedisClient) {}

	async publish(change: PluginGenerationChange): Promise<number> {
		if (!this.redis.eval) {
			throw new Error('Redis scripting is required for atomic plugin generation publication')
		}
		const generation = Number(
			await this.redis.eval(PUBLISH_PLUGIN_GENERATION_SCRIPT, {
				keys: [PLUGIN_GENERATION_KEY, DESIRED_PLUGINS_KEY],
				arguments: [JSON.stringify(change), PLUGIN_GENERATION_PREFIX, `${PLUGIN_GENERATION_TTL_SECONDS}`]
			})
		)
		if (!Number.isInteger(generation) || generation <= 0) {
			throw new Error('Redis returned an invalid plugin runtime generation')
		}
		return generation
	}

	async readDesired(): Promise<{
		generation: number
		status: RuntimeRestartStatus
		requirements: IRuntimePluginRequirement[]
	} | null> {
		// One hash read gives an atomic manifest snapshot, retained beyond the status/history TTL.
		const { generation: value, status: outcome, ...plugins } = await this.redis.hGetAll(DESIRED_PLUGINS_KEY)
		if (!value) return null
		const generation = Number(value)
		if (!Number.isSafeInteger(generation) || generation <= 0) throw new Error('Invalid desired plugin generation')
		const requirements = Object.values(plugins).map((plugin) => {
			const parsed: unknown = JSON.parse(plugin)
			if (!this.isRuntimePluginRequirement(parsed)) throw new Error('Invalid desired plugin requirement')
			return parsed
		})
		// Fail closed for older manifests with no retained outcome after history expiration.
		const status = outcome ?? (await this.readState(generation))?.status ?? 'failed'
		if (status !== 'in_progress' && status !== 'completed' && status !== 'failed')
			throw new Error('Invalid desired plugin outcome')
		return { generation, status, requirements }
	}

	async hasAttempted(replicaId: string, generation: number): Promise<boolean> {
		const attempts = await this.redis.hGetAll(REPLICA_ATTEMPTS_KEY)
		return Number(attempts[replicaId] ?? 0) >= generation
	}

	async current(): Promise<number> {
		const value = await this.redis.get(PLUGIN_GENERATION_KEY)
		const parsed = Number.parseInt(value ?? '0', 10)
		return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
	}

	async readChanges(from: number, to: number): Promise<PluginGenerationChange[]> {
		const changes: PluginGenerationChange[] = []
		for (let generation = from; generation <= to; generation += 1) {
			const value = await this.redis.get(this.pluginChangeKey(generation))
			if (!value) throw new Error(`Plugin runtime generation ${generation} is missing`)
			const parsed = this.parsePluginGenerationChange(JSON.parse(value) as unknown)
			if (!parsed || parsed.generation !== generation) {
				throw new Error(`Plugin runtime generation ${generation} is invalid`)
			}
			changes.push(parsed)
		}
		return changes
	}

	private parsePluginGenerationChange(value: unknown): PluginGenerationChange | null {
		if (typeof value !== 'object' || value === null || !('generation' in value)) return null
		if (typeof value.generation !== 'number') return null

		const requirements =
			'requirements' in value && Array.isArray(value.requirements)
				? value.requirements
				: 'requirement' in value
					? [value.requirement]
					: []
		if (
			!requirements.length ||
			!requirements.every((requirement) => this.isRuntimePluginRequirement(requirement))
		) {
			return null
		}

		return {
			generation: value.generation,
			requirements,
			source: 'source' in value && value.source === 'interactive' ? 'interactive' : 'plugin-change',
			...('reason' in value && typeof value.reason === 'string' ? { reason: value.reason } : {}),
			...('actorUserId' in value && typeof value.actorUserId === 'string'
				? { actorUserId: value.actorUserId }
				: {}),
			...('tenantId' in value && typeof value.tenantId === 'string' ? { tenantId: value.tenantId } : {}),
			...('sourceIp' in value && typeof value.sourceIp === 'string' ? { sourceIp: value.sourceIp } : {})
		}
	}

	private isRuntimePluginRequirement(value: unknown): value is IRuntimePluginRequirement {
		return (
			typeof value === 'object' &&
			value !== null &&
			'scopeKey' in value &&
			typeof value.scopeKey === 'string' &&
			'pluginName' in value &&
			typeof value.pluginName === 'string' &&
			'state' in value &&
			(value.state === 'loaded' || value.state === 'absent') &&
			(!('version' in value) || value.version === undefined || typeof value.version === 'string') &&
			(!('runtimeRevision' in value) ||
				value.runtimeRevision === undefined ||
				typeof value.runtimeRevision === 'string')
		)
	}

	async writeState(state: PluginGenerationState): Promise<void> {
		if (!this.redis.eval) throw new Error('Redis scripting is required for durable plugin outcomes')
		await this.redis.eval(WRITE_GENERATION_STATE_SCRIPT, {
			keys: [this.pluginGenerationStateKey(state.generation), DESIRED_PLUGINS_KEY, ACTIVE_RESTART_KEY],
			arguments: [
				JSON.stringify(state),
				`${state.generation}`,
				`${PLUGIN_GENERATION_TTL_SECONDS}`,
				state.restartId ?? ''
			]
		})
	}

	async claimCatchUp(generation: number, restartId: string, ttlMs: number): Promise<boolean> {
		if (!this.redis.eval) throw new Error('Redis scripting is required for guarded plugin catch-up')
		return (
			Number(
				await this.redis.eval(START_CATCH_UP_SCRIPT, {
					keys: [DESIRED_PLUGINS_KEY, ACTIVE_RESTART_KEY],
					arguments: [`${generation}`, restartId, `${ttlMs}`]
				})
			) === 1
		)
	}

	async readPending(): Promise<PluginGenerationChange[]> {
		const current = await this.current()
		let first = current + 1
		for (let generation = current; generation > 0; generation -= 1) {
			if ((await this.readState(generation))?.status !== 'in_progress') break
			first = generation
		}
		return first <= current ? this.readChanges(first, current) : []
	}

	async readState(generation: number): Promise<PluginGenerationState | null> {
		const value = await this.redis.get(this.pluginGenerationStateKey(generation))
		if (!value) return null
		try {
			const parsed = JSON.parse(value) as PluginGenerationState
			return parsed.generation === generation ? parsed : null
		} catch {
			return null
		}
	}

	private pluginChangeKey(generation: number) {
		return `${PLUGIN_GENERATION_PREFIX}${generation}:change`
	}

	private pluginGenerationStateKey(generation: number) {
		return `${PLUGIN_GENERATION_PREFIX}${generation}:status`
	}
}
