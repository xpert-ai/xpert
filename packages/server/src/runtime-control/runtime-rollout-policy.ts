/** Invariants: queued changes cannot alter a candidate's admission manifest or inherit outage consent. */
import type { IRuntimePluginRequirement } from '@xpert-ai/contracts'
import type { RestartOperationInput, RestartOperationMetadata, RestartTargetState } from './runtime-restart.types'
import { mergeRuntimeRequirements } from './plugin-runtime-requirements'
import { operationDeadlineAt, operationDeadlineError, REPLICA_RESTART_TIMEOUT_MS } from './runtime-restart-deadlines'

export const INITIAL_OPERATION_TTL_MS = 15 * 60_000

export interface RolloutAdmission {
	generation: number
	requirements: IRuntimePluginRequirement[]
}

export function createRestartMetadata(
	input: RestartOperationInput,
	restartId: string,
	requestedAt: string,
	targetReplicaCount: number,
	admissionRequirements: IRuntimePluginRequirement[] | undefined
): RestartOperationMetadata {
	return {
		restartId,
		requestedAt,
		reason: input.reason?.trim() || undefined,
		source: input.source,
		actorUserId: input.actorUserId,
		tenantId: input.tenantId,
		sourceIp: input.sourceIp,
		allowDowntime:
			(input.source === 'interactive' && input.allowDowntime === true) ||
			(input.pluginChanges.length > 0 &&
				input.pluginChanges.every(
					(change) => change.source === 'interactive' && change.allowDowntime === true
				)),
		pluginGeneration: input.pluginGeneration,
		pluginGenerations:
			input.source === 'plugin-catch-up'
				? [input.pluginGeneration]
				: input.pluginChanges.map((change) => change.generation),
		runtimeRequirements: mergeRuntimeRequirements([
			...input.runtimeRequirements,
			...input.pluginChanges.flatMap((change) => change.requirements)
		]),
		admissionRequirements,
		phase: 'collecting',
		preparing: true,
		registrationDeadlineAt: new Date(Date.now() + INITIAL_OPERATION_TTL_MS).toISOString(),
		targetReplicaCount,
		maxConcurrentRestarts: 1,
		deadlineAt: operationDeadlineAt(targetReplicaCount, 1)
	}
}

export function replacementAdmission(
	metadata: RestartOperationMetadata | null,
	targets: RestartTargetState[],
	replicaId: string,
	bootId: string
): RolloutAdmission | undefined {
	if (
		!metadata?.admissionRequirements ||
		metadata.preparing ||
		metadata.phase !== 'rolling' ||
		operationDeadlineError(metadata) ||
		targets.some((target) => target.status === 'failed')
	)
		return undefined
	const target = targets.find((item) => item.replicaId === replicaId)
	if (!target || target.expectedBootId === bootId) return undefined
	const replacement =
		(target.status === 'restarting' &&
			!!target.startedAt &&
			Date.now() - Date.parse(target.startedAt) < REPLICA_RESTART_TIMEOUT_MS) ||
		(target.status === 'completed' && target.acknowledgedBootId === bootId)
	return replacement
		? { generation: metadata.pluginGeneration, requirements: metadata.admissionRequirements }
		: undefined
}
