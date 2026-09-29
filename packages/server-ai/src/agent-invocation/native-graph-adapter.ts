// Invariants: keep parent checkpoint configuration and native state projection intact.
// Only this adapter serializes graph state; provider SDK contracts stay graph-independent.
import { Runnable, RunnableLambda } from '@langchain/core/runnables'
import { interrupt, isGraphInterrupt } from '@langchain/langgraph'
import { createHash } from 'crypto'
import { DefaultRuntimeCapabilityRegistry, AgentInvocationScope, AgentTarget } from '@xpert-ai/plugin-sdk'
import { JsonPlusSerializer } from '../copilot-checkpoint/serde/jsonplus'
import { AgentInvocationRuntime, invocationError } from './invocation-runtime'
import { NativeAgentExecution } from './native-agent.strategy'

export interface NativeAgentCallScope {
    target: AgentTarget
    scope: Omit<AgentInvocationScope, 'parentExecutionId'>
    signal?: AbortSignal
    authorize(): Promise<void>
}

export function wrapNativeAgentInvocation<Input, Output>(
    graph: Runnable<Input, Output>,
    runtime: AgentInvocationRuntime,
    context: NativeAgentCallScope
): Runnable<Input, Output> {
    const serde = new JsonPlusSerializer()
    return RunnableLambda.from(async (state: Input, config) => {
        const parentExecutionId = config.configurable?.executionId
        if (typeof parentExecutionId !== 'string' || !parentExecutionId) throw invocationError('InvalidScope')
        const stateCall = state && typeof state === 'object' && 'toolCall' in state ? state.toolCall : undefined
        const toolCallId =
            stateCall && typeof stateCall === 'object' && 'id' in stateCall && typeof stateCall.id === 'string'
                ? stateCall.id
                : undefined
        // Graph task id is stable on checkpoint replay and distinct across loop iterations.
        const taskId = config.configurable?.__pregel_task_id
        const checkpointNs = config.configurable?.checkpoint_ns
        const callId =
            toolCallId ??
            (typeof taskId === 'string'
                ? taskId
                : typeof checkpointNs === 'string' && checkpointNs
                  ? checkpointNs
                  : undefined)
        if (!callId) throw invocationError('InvalidRequest')
        const capabilities = new DefaultRuntimeCapabilityRegistry().register(NativeAgentExecution, {
            execute: async (invocationId) => {
                const output = await graph.invoke(state, {
                    ...config,
                    configurable: { ...config.configurable, agentInvocationId: invocationId }
                })
                const [type, bytes] = await serde.dumpsTyped(output)
                return {
                    status: 'succeeded',
                    result: { text: '', data: { type, value: Buffer.from(bytes).toString('base64') } }
                }
            }
        })
        const api = runtime.scoped({
            scope: { ...context.scope, parentExecutionId },
            capabilities,
            signal: context.signal,
            authorize: () => context.authorize(),
            isSuspension: isGraphInterrupt
        })
        // Native state contains graph messages/classes. Persist its digest, not a
        // lossy JSON cast, so replay cannot reuse a call id with different inputs.
        const [, inputBytes] = await serde.dumpsTyped(stateCall ?? state)
        const result = await api.start({
            target: context.target,
            callId: `${context.target.bindingId}:${callId}`,
            input: {
                prompt: '',
                parameters: { nativeInputDigest: createHash('sha256').update(inputBytes).digest('hex') }
            }
        })
        if (result.status !== 'succeeded') {
            if (result.status === 'failed' || result.status === 'cancelled' || result.status === 'unknown') {
                throw invocationError('DispatchUnknown')
            }
            interrupt({ type: 'agent_invocation', invocationId: result.id, status: result.status })
            throw invocationError('ConcurrentUpdate')
        }
        const data = result.result?.data
        if (
            !data ||
            typeof data !== 'object' ||
            Array.isArray(data) ||
            typeof data.type !== 'string' ||
            typeof data.value !== 'string'
        )
            throw invocationError('MissingResult')
        return serde.loadsTyped(data.type, Buffer.from(data.value, 'base64')) as Promise<Output>
    })
}
