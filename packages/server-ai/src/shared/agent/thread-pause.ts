// Pause before a node starts: completed parallel writes stay in the checkpointer.
// NodeInterrupt is resumed with the saved config, without consuming HITL answers.
import { Runnable, RunnableLambda } from '@langchain/core/runnables'
import { NodeInterrupt } from '@langchain/langgraph'

export function installThreadPauseGuards<Input, Output>(
    nodes: Record<string, { runnable: Runnable<Input, Output> }>,
    shouldPause?: () => Promise<boolean>
): void {
    if (!shouldPause) return
    for (const node of Object.values(nodes)) {
        node.runnable = RunnableLambda.from(async (input: Input) => {
            if (await shouldPause()) throw new NodeInterrupt({ type: 'thread_pause' })
            return input
        }).pipe(node.runnable)
    }
}

export function isThreadPause(value: unknown): value is { type: 'thread_pause' } {
    return Boolean(value && typeof value === 'object' && 'type' in value && value.type === 'thread_pause')
}
