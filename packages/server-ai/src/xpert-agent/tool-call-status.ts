import type { ToolTimelineIdentity } from './tool-timeline'

type CallStatus = 'running' | 'success' | 'fail' | 'canceled'

/** A generic tool-end event must not erase an explicit failure or cancellation. */
export class ToolCallStatusProjection {
    private readonly statuses = new Map<string, CallStatus>()

    update(id: string, name: string | undefined, identity: ToolTimelineIdentity, status: unknown) {
        const key = JSON.stringify([identity.executionId ?? identity.agentKey ?? '', id, name])
        const previous = this.statuses.get(key)
        if (previous === 'fail' || previous === 'canceled') return previous
        if (status !== 'running' && status !== 'success' && status !== 'fail' && status !== 'canceled') return previous
        if (previous === 'success' && status === 'running') return previous
        this.statuses.set(key, status)
        return status
    }
}
