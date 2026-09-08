// Invariants: record the invoked candidate inside retry/fallback. Snapshot tracking
// must work independently of context-compression request validation.
import { BaseMessage } from '@langchain/core/messages'
import { Runnable, RunnableLambda } from '@langchain/core/runnables'
import type { TCopilotModel } from '@xpert-ai/contracts'
import { sanitizeAssistantCopilotModel, sanitizeAssistantModelSnapshot } from '../xpert/assistant-model-selection.util'

export function createModelExecutionSnapshot(model: TCopilotModel) {
    const normalized = sanitizeAssistantCopilotModel({
        ...model,
        options: { ...model.options, context_size_source: 'snapshot' }
    })
    return normalized ? sanitizeAssistantModelSnapshot(normalized) : null
}

export function withModelExecutionSnapshot(
    model: Runnable,
    candidate: TCopilotModel,
    recordSnapshot: (snapshot: NonNullable<ReturnType<typeof createModelExecutionSnapshot>>) => Promise<void>
): Runnable {
    return RunnableLambda.from(async (messages: BaseMessage[], config) => {
        const snapshot = createModelExecutionSnapshot(candidate)
        if (snapshot) await recordSnapshot(snapshot)
        return model.invoke(messages, config)
    })
}
