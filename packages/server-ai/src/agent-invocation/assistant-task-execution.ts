import {
    createRuntimeCapability,
    type AgentRuntimeContext,
    type AgentRuntimeHandle,
    type AgentRuntimeObservation,
    type AgentRuntimeStart
} from '@xpert-ai/plugin-sdk'

/** The owning domain supplies transport operations; Invocation owns their common lifecycle. */
export const AssistantTaskExecution = createRuntimeCapability<{
    start(request: AgentRuntimeStart, context: AgentRuntimeContext): Promise<AgentRuntimeObservation>
    inspect(handle: AgentRuntimeHandle, context: AgentRuntimeContext): Promise<AgentRuntimeObservation>
    cancel(handle: AgentRuntimeHandle, context: AgentRuntimeContext): Promise<AgentRuntimeObservation>
}>('xpert.internal.assistant_task_execution')
