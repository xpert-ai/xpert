/** Shared rollout reads keep admission independent of the restart executor. */
import type { RestartOperationMetadata, RuntimeRestartRedisClient } from './runtime-restart.types'

export const ACTIVE_RESTART_KEY = 'xpert:system:runtime:restart:active'

export function restartMetadataKey(restartId: string): string {
	return `xpert:system:runtime:restart:${restartId}:metadata`
}

export async function readRestartMetadata(
	redis: Pick<RuntimeRestartRedisClient, 'get'>,
	restartId: string
): Promise<RestartOperationMetadata | null> {
	const value = await redis.get(restartMetadataKey(restartId))
	if (!value) return null
	try {
		const parsed = JSON.parse(value) as RestartOperationMetadata
		if (
			parsed.restartId !== restartId ||
			!Array.isArray(parsed.pluginGenerations) ||
			!Array.isArray(parsed.runtimeRequirements) ||
			(parsed.phase !== 'collecting' && parsed.phase !== 'rolling')
		) {
			return null
		}
		return parsed
	} catch {
		return null
	}
}
