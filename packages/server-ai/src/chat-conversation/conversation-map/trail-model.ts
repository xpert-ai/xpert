import type { TrailGraph, TrailStatus, TrailStep } from './trail.schema'

export function trailStatus(status?: string | null): TrailStatus {
    switch (status) {
        case 'running':
        case 'busy':
        case 'thinking':
        case 'reasoning':
        case 'answering':
            return 'running'
        case 'success':
        case 'succeeded':
            return 'success'
        case 'error':
        case 'fail':
        case 'failed':
        case 'timeout':
            return 'error'
        case 'pending':
        case 'queued':
            return 'pending'
        case 'waiting':
            return 'waiting'
        case 'cancelling':
            return 'cancelling'
        case 'idle':
            return 'idle'
        case 'interrupted':
        case 'aborted':
        case 'cancelled':
        case 'canceled':
            return 'interrupted'
        default:
            return 'unknown'
    }
}

/** Episode boundaries depend only on typed activity and a bounded group size, never text. */
export function groupTrailEpisodes(graph: TrailGraph): TrailGraph {
    const byLane = new Map<string, TrailStep[]>()
    for (const step of graph.steps) {
        const list = byLane.get(step.laneId) ?? []
        list.push(step)
        byLane.set(step.laneId, list)
    }
    graph.episodes = []
    for (const lane of graph.lanes) {
        let episode: TrailGraph['episodes'][number] | undefined
        for (const step of (byLane.get(lane.id) ?? []).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) {
            if (
                !episode ||
                episode.activity !== step.activity ||
                episode.stepIds.length >= 24 ||
                step.kind === 'turn'
            ) {
                episode = { id: `episode:${step.id}`, laneId: lane.id, activity: step.activity, stepIds: [] }
                graph.episodes.push(episode)
            }
            episode.stepIds.push(step.id)
        }
    }
    graph.coverage = [...new Set(graph.coverage)]
    return graph
}
