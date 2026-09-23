import { Injectable } from '@nestjs/common'
import {
    AgentRuntimeContext,
    AgentRuntimeHandle,
    AgentRuntimeObservation,
    AgentRuntimeStart,
    AgentRuntimeStrategy,
    createRuntimeCapability,
    IAgentRuntimeStrategy
} from '@xpert-ai/plugin-sdk'

/** Only the host graph adapter supplies this capability; never accepted from request JSON. */
export const NativeAgentExecution = createRuntimeCapability<{
    execute(invocationId: string): Promise<AgentRuntimeObservation>
}>('xpert.internal.native_agent_execution')

@Injectable()
@AgentRuntimeStrategy('xpert')
export class NativeAgentRuntimeStrategy implements IAgentRuntimeStrategy {
    readonly capabilities = {
        recovery: 'checkpoint' as const,
        interactions: false,
        cancellation: false,
        background: false
    }

    async start(_request: AgentRuntimeStart, context: AgentRuntimeContext): Promise<AgentRuntimeObservation> {
        return context.capabilities.require(NativeAgentExecution).execute(context.invocationId)
    }

    async inspect(_handle: AgentRuntimeHandle): Promise<AgentRuntimeObservation> {
        // Native checkpoint recovery is owned by the parent graph, not a second worker.
        return { status: 'waiting' }
    }
}
