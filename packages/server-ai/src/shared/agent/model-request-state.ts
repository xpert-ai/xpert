// Invariants: a failed wrapped call must retain its prepared Agent state.
// Raise the saved error in the following graph node, after that state is checkpointed.
import { BaseMessage } from '@langchain/core/messages'
import { Runnable, RunnableLambda } from '@langchain/core/runnables'
import { isGraphInterrupt } from '@langchain/langgraph'
import type { TCopilotModel } from '@xpert-ai/contracts'
import type { ModelRequest } from '@xpert-ai/plugin-sdk'

export const MODEL_REQUEST_FAILURE_STATE_KEY = '__modelRequestFailure'

export class ModelRequestStateError extends Error {
    constructor(
        readonly reason: unknown,
        readonly agentStateUpdate: NonNullable<ModelRequest['agentStateUpdate']>
    ) {
        super(reason instanceof Error ? reason.message : String(reason))
        this.name = 'ModelRequestStateError'
    }
}

export function preserveModelRequestState(
    error: unknown,
    update: NonNullable<ModelRequest['agentStateUpdate']>
): never {
    if (isGraphInterrupt(error) || (error instanceof Error && error.name === 'AbortError')) throw error
    if (error instanceof ModelRequestStateError) {
        throw new ModelRequestStateError(error.reason, { ...update, ...error.agentStateUpdate })
    }
    throw new ModelRequestStateError(error, update)
}

export type ModelRequestFailure = { message: string; executionId?: string }

export function modelRequestFailureUpdate(error: ModelRequestStateError, executionId?: string) {
    return { ...error.agentStateUpdate, [MODEL_REQUEST_FAILURE_STATE_KEY]: { message: error.message, executionId } }
}

export function throwPendingModelRequestFailure(state: { [key: string]: unknown }, executionId?: string) {
    const failure = state[MODEL_REQUEST_FAILURE_STATE_KEY]
    if (typeof failure === 'string') throw new Error(failure)
    if (!failure || typeof failure !== 'object' || !('message' in failure) || typeof failure.message !== 'string')
        return
    // An explicit chat retry creates a new execution. Re-enter the model chain
    // with the saved compression state; resuming the same failed run stays failed.
    if (
        executionId &&
        'executionId' in failure &&
        typeof failure.executionId === 'string' &&
        executionId !== failure.executionId
    ) {
        return { [MODEL_REQUEST_FAILURE_STATE_KEY]: null, jumpTo: 'model' as const }
    }
    throw new Error(failure.message)
}

/** The check runs inside retry/fallback for the actual candidate, before provider invocation. */
export function withModelRequestValidation(
    model: Runnable,
    getRequest: () => ModelRequest | undefined,
    copilotModel: TCopilotModel,
    beforeInvoke?: () => Promise<void>
): Runnable {
    return RunnableLambda.from(async (messages: BaseMessage[], config) => {
        const request = getRequest()
        if (request) {
            await request.validateRequest?.({
                ...request,
                finalMessages: messages,
                runtime: { ...request.runtime, configurable: { ...request.runtime.configurable, copilotModel } }
            })
        }
        await beforeInvoke?.()
        return model.invoke(messages, config)
    })
}
