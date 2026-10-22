/** Ingress checks every 1s with a 1s timeout/fall=1. Keep serving safe requests during propagation.
 * This is a bounded propagation contract, not an acknowledgement from arbitrary external proxies.
 * Operators must route all traffic through a readiness-aware ingress before enabling rolling updates.
 */
import type { RuntimeLifecycleService, RuntimeDrainState } from './runtime-lifecycle.service'

/** Default propagation budget for the shipped ingress; production overrides are validated at bootstrap. */
export const TRAFFIC_WITHDRAWAL_MS = 5_000

export async function withdrawRuntimeTraffic(
	lifecycle: RuntimeLifecycleService,
	state: RuntimeDrainState,
	canContinue: () => Promise<boolean>,
	withdrawalMs = TRAFFIC_WITHDRAWAL_MS
): Promise<boolean> {
	await new Promise<void>((resolve) => setTimeout(resolve, withdrawalMs))
	if (!(await canContinue())) {
		lifecycle.cancelDrain(state.restartId)
		return false
	}
	return lifecycle.completeWithdrawal(state)
}

export async function drainRuntimeTraffic(
	lifecycle: RuntimeLifecycleService,
	state: RuntimeDrainState,
	timeoutMs: number,
	canContinue: () => Promise<boolean>,
	withdrawalMs = TRAFFIC_WITHDRAWAL_MS
): Promise<boolean | undefined> {
	if (!(await withdrawRuntimeTraffic(lifecycle, state, canContinue, withdrawalMs))) return undefined
	const drained = await lifecycle.waitForIdle(timeoutMs)
	if (!(await canContinue())) {
		lifecycle.cancelDrain(state.restartId)
		return undefined
	}
	return drained
}
