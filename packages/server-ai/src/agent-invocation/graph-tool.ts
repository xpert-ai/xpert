import { Runnable, RunnableConfig } from '@langchain/core/runnables'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { Command } from '@langchain/langgraph'
import { AgentStateAnnotation } from '../shared/agent/state'
import { invocationError } from './invocation-runtime'

/** Adapt a governed native invocation to an ordinary ToolNode without exposing graph state in the SDK. */
export function nativeInvocationTool(
    declaration: DynamicStructuredTool,
    graph: Runnable<typeof AgentStateAnnotation.State, Partial<typeof AgentStateAnnotation.State>>
) {
    return new DynamicStructuredTool({
        name: declaration.name,
        description: declaration.description,
        schema: declaration.schema,
        func: async (args, _runManager, config: RunnableConfig) => {
            const state: typeof AgentStateAnnotation.State = config?.configurable?.runtimeState
            const callId = config?.configurable?.tool_call_id
            if (!state || typeof callId !== 'string') throw invocationError('InvalidScope')
            const update = await graph.invoke(
                {
                    ...state,
                    toolCall: { id: callId, name: declaration.name, args }
                },
                config
            )
            return new Command({ update })
        }
    })
}
