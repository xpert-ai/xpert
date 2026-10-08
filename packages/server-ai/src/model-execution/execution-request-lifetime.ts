// Active streams may run until the configured execution deadline. Silence is bounded separately.
import type { ModelExecutionGrant } from './execution.entity'

export function executionRequestLifetime(grant: ModelExecutionGrant, abort: AbortController) {
    const idleMs = (grant.limits.requestIdleSeconds ?? 600) * 1000
    let idle: ReturnType<typeof setTimeout>
    const deadline = setTimeout(() => abort.abort(), Math.max(1, grant.absoluteExpiresAt.getTime() - Date.now()))
    deadline.unref()
    const activity = () => {
        clearTimeout(idle)
        if (!abort.signal.aborted) {
            idle = setTimeout(() => abort.abort(), idleMs)
            idle.unref()
        }
    }
    activity()
    return {
        activity,
        dispose() {
            clearTimeout(idle)
            clearTimeout(deadline)
        }
    }
}
