/**
 * Invariants:
 * - Targets are initialized before the operation is made active.
 * - A stale poll cannot overwrite a newer acknowledgement/failure or mutate a finished operation.
 * - Version mismatches may fail only against the desired generation actually checked by admission.
 */
import type { RestartTargetState, RuntimeRestartRedisClient } from './runtime-restart.types'
import { PLUGIN_GENERATION_KEY, REPLICA_ATTEMPTS_KEY } from './plugin-runtime-generation.store'

const UPDATE_TARGET_SCRIPT = `
-- xpert-update-restart-target
if redis.call('get', KEYS[2]) ~= ARGV[1] or redis.call('hget', KEYS[1], ARGV[2]) ~= ARGV[3] then
  return 0
end
if ARGV[6] ~= '' and (redis.call('get', KEYS[4]) or '0') ~= ARGV[6] then return 0 end
redis.call('hset', KEYS[1], ARGV[2], ARGV[4])
if tonumber(ARGV[5]) > 0 then
  redis.call('hset', KEYS[3], ARGV[2], ARGV[5])
end
return 1
`

export class RuntimeRestartTargetStore {
	constructor(private readonly redis: RuntimeRestartRedisClient) {}

	async fail(
		restartId: string,
		target: RestartTargetState,
		error: string,
		expectedGeneration?: number
	): Promise<boolean> {
		return this.update(
			restartId,
			target,
			{
				...target,
				status: 'failed',
				error,
				updatedAt: new Date().toISOString()
			},
			0,
			expectedGeneration
		)
	}

	async update(
		restartId: string,
		previous: RestartTargetState,
		next: RestartTargetState,
		attemptGeneration = 0,
		expectedGeneration?: number
	): Promise<boolean> {
		if (!this.redis.eval) throw new Error('Redis scripting is required for restart target transitions')
		return (
			Number(
				await this.redis.eval(UPDATE_TARGET_SCRIPT, {
					keys: [
						this.key(restartId),
						'xpert:system:runtime:restart:active',
						REPLICA_ATTEMPTS_KEY,
						PLUGIN_GENERATION_KEY
					],
					arguments: [
						restartId,
						previous.replicaId,
						JSON.stringify(previous),
						JSON.stringify(next),
						`${attemptGeneration}`,
						expectedGeneration === undefined ? '' : `${expectedGeneration}`
					]
				})
			) === 1
		)
	}

	async read(restartId: string): Promise<RestartTargetState[]> {
		const values = await this.redis.hGetAll(this.key(restartId))
		const targets: RestartTargetState[] = []
		for (const value of Object.values(values)) {
			try {
				const target = JSON.parse(value) as RestartTargetState
				if (target.replicaId && target.expectedBootId && target.status && target.updatedAt) targets.push(target)
			} catch {
				// Ignore corrupt participant records; the operation timeout remains fail closed.
			}
		}
		return targets.sort((left, right) => left.replicaId.localeCompare(right.replicaId))
	}

	async initialize(restartId: string, target: RestartTargetState): Promise<void> {
		await this.redis.hSet(this.key(restartId), target.replicaId, JSON.stringify(target))
	}

	key(restartId: string) {
		return `xpert:system:runtime:restart:${restartId}:targets`
	}
}
