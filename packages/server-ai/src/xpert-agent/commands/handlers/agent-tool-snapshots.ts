// Invariants: one snapshot per dispatch batch, outside public graph state. It survives
// interrupt/resume (including Command.update) until the tool superstep commits.
// The next committed step replaces/clears it so history cannot accumulate here.
import { BaseChannel } from '@langchain/langgraph'

export const AGENT_TOOL_SNAPSHOTS = '__xpert_tool_snapshots'

export interface AgentToolSnapshot {
    id: string
    state: object
}

class AgentToolSnapshotChannel extends BaseChannel<AgentToolSnapshot[], AgentToolSnapshot, AgentToolSnapshot[]> {
    lc_graph_name = 'AgentToolSnapshotChannel'
    private snapshots: AgentToolSnapshot[] = []

    fromCheckpoint(checkpoint?: AgentToolSnapshot[]): this {
        const channel = new AgentToolSnapshotChannel()
        channel.snapshots = checkpoint ?? []
        return channel as this
    }

    update(snapshots: AgentToolSnapshot[]): boolean {
        const changed = this.snapshots.length > 0 || snapshots.length > 0
        this.snapshots = snapshots
        return changed
    }

    get(): AgentToolSnapshot[] {
        return this.snapshots
    }

    checkpoint(): AgentToolSnapshot[] {
        return this.snapshots
    }

    isAvailable(): boolean {
        return this.snapshots.length > 0
    }
}

/** Register after compilation so snapshots never enter node inputs or graph output. */
export function installAgentToolSnapshots<T extends { channels: Record<string, BaseChannel> }>(graph: T): T {
    graph.channels[AGENT_TOOL_SNAPSHOTS] = new AgentToolSnapshotChannel()
    return graph
}
