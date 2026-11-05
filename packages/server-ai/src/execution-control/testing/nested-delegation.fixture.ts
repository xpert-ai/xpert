import {
    AgentRuntimeRegistry,
    BUILTIN_GLOBAL_SCOPE,
    DefaultRuntimeCapabilityRegistry,
    type AgentRuntimeStart
} from '@xpert-ai/plugin-sdk'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { AgentInvocationRuntime } from '../../agent-invocation/invocation-runtime'
import { MemoryInvocationStore } from '../../agent-invocation/invocation-test-store'
import { NativeAgentRuntimeStrategy } from '../../agent-invocation/native-agent.strategy'
import { wrapNativeAgentInvocation } from '../../agent-invocation/native-graph-adapter'
import { isGraphInterrupt, NodeInterrupt } from '@langchain/langgraph'
import { RunnableLambda } from '@langchain/core/runnables'
import { randomUUID } from 'node:crypto'
import { createClient } from 'redis'
import { attachedGraphRunner, invokeChildGraph } from '../attached-graph'
import { ExecutionCancelService } from '../execution-cancel.service'
import type { ExecutionControlStore } from '../execution-control.store'
import { withExecutionContext } from '../../shared/agent/execution-context'

export function nestedCheckpointDelegation(
    store: ExecutionControlStore,
    scope: { tenantId: string; organizationId: string },
    executionId: string,
    initial: 'registered' | 'legacy unregistered' | 'legacy completed'
) {
    const tasks = store.tasks
    const runAttachedExecution = attachedGraphRunner(executionId, new ExecutionCancelService(createClient(), store))
    const registry = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
    const source = { kind: 'builtin' as const, scopeKey: BUILTIN_GLOBAL_SCOPE }
    registry.register('xpert', new NativeAgentRuntimeStrategy(), source)
    const start = jest.fn(async (request: AgentRuntimeStart) => {
        if (!request.checkpointReplay) throw new NodeInterrupt('approval')
        return { status: 'succeeded' as const, result: { text: 'approved' } }
    })
    registry.register(
        'leaf',
        {
            capabilities: { recovery: 'checkpoint', background: false, cancellation: false, interactions: false },
            start,
            inspect: jest.fn()
        },
        source
    )
    const records = new MemoryInvocationStore()
    const runtime = new AgentInvocationRuntime(records, registry, undefined, tasks)
    const caller = { ...scope, userId: randomUUID(), callerAgentKey: 'nested' }
    const attempts: string[] = []
    const graph = wrapNativeAgentInvocation(
        RunnableLambda.from(async (_input: string, config) => {
            const { agentExecutionId, agentInvocationId } = config.configurable
            attempts.push(agentExecutionId)
            const leaf = () =>
                runtime
                    .scoped({
                        scope: { ...caller, parentExecutionId: agentExecutionId },
                        capabilities: new DefaultRuntimeCapabilityRegistry(),
                        authorize: async () => {},
                        isSuspension: isGraphInterrupt
                    })
                    .start({
                        callId: 'approve',
                        target: {
                            provider: 'leaf',
                            reference: 'leaf',
                            revision: '1',
                            bindingId: 'leaf',
                            configuration: {}
                        },
                        input: { prompt: 'approve' }
                    })
            if (attempts.length === 1 && initial !== 'registered') {
                if (initial === 'legacy unregistered') return leaf()
                await store.attach(agentExecutionId, executionId, 'attached')
                try {
                    return await leaf()
                } finally {
                    const task = await tasks.execution(agentExecutionId)
                    await tasks.receipt(task.id, 'completed')
                }
            }
            return invokeChildGraph(
                config,
                { executionId: agentExecutionId, invocationId: agentInvocationId, agentKey: 'outer' },
                async () => {
                    await store.admit(agentExecutionId, 'owned-' + agentExecutionId, executionId)
                    await store.settle(agentExecutionId, 'owned-' + agentExecutionId)
                    return leaf()
                }
            )
        }),
        runtime,
        {
            scope: caller,
            target: { provider: 'xpert', reference: 'outer', revision: '1', bindingId: 'outer', configuration: {} },
            authorize: async () => {}
        }
    )
    const config = { configurable: { executionId, __pregel_task_id: 'outer-checkpoint' } }
    const invoke = () => withExecutionContext({ runAttachedExecution }, () => graph.invoke('same input', config))
    return { invoke, attempts, start, records }
}
