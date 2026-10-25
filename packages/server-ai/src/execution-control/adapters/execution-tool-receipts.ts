import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import { ExecutionControlStore } from '../execution-control.store'

/** StructuredTool callbacks surround _call itself, unlike Runnable's abortable promise wrapper. */
export function executionToolReceipts(store: ExecutionControlStore, executionId: string): BaseCallbackHandler {
    const admitted = new Map<string, string>()
    const handler = BaseCallbackHandler.fromMethods({
        handleToolStart: async (_tool, _input, runId, _parent, _tags, metadata) => {
            const owner = typeof metadata?.executionId === 'string' ? metadata.executionId : executionId
            await store.admit(owner, runId, executionId)
            admitted.set(runId, owner)
        },
        handleToolEnd: async (_output, runId) => {
            const owner = admitted.get(runId)
            if (owner) {
                await store.settle(owner, runId)
                admitted.delete(runId)
            }
        },
        handleToolError: async (_error, runId) => {
            const owner = admitted.get(runId)
            if (owner) {
                await store.settle(owner, runId)
                admitted.delete(runId)
            }
        }
    })
    handler.raiseError = true
    handler.awaitHandlers = true
    return handler
}
