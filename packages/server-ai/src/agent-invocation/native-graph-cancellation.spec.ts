jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { RunnableLambda } from '@langchain/core/runnables'
import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { AgentRuntimeRegistry, BUILTIN_GLOBAL_SCOPE } from '@xpert-ai/plugin-sdk'
import type { TaskControlStore } from '@xpert-ai/server-core'
import { ExecutionCancelledError } from '../execution-control/execution-cancelled.error'
import { checkedControlObservation, invocationCanRelease } from './invocation-control-evidence'
import { AgentInvocationRuntime } from './invocation-runtime'
import { MemoryInvocationStore } from './invocation-test-store'
import { NativeAgentRuntimeStrategy } from './native-agent.strategy'
import { wrapNativeAgentInvocation } from './native-graph-adapter'

it('replays the original cancellation on a fresh host without relaunching or interrupting the parent', async () => {
    const strategy = new NativeAgentRuntimeStrategy()
    const registry = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
    registry.register('xpert', strategy, { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE })
    const store = new MemoryInvocationStore()
    const tasks = {
        execution: jest.fn().mockResolvedValue({
            id: 'task',
            currentExecutionId: 'parent',
            attempts: ['parent'],
            tenantId: 'tenant',
            organizationId: 'org'
        }),
        register: jest.fn().mockResolvedValue({ id: 'child-task' }),
        claim: jest.fn().mockResolvedValue('claim'),
        receipt: jest.fn().mockResolvedValue(undefined)
    }
    const cancelled = new ExecutionCancelledError('original-execution', 'Stopped by user')
    const child = jest.fn(async () => {
        throw cancelled
    })
    const state = Annotation.Root({ toolCall: Annotation<{ id: string }>() })
    const parent = () => {
        const runtime = new AgentInvocationRuntime(store, registry, undefined, tasks as unknown as TaskControlStore)
        const run = wrapNativeAgentInvocation(RunnableLambda.from(child), runtime, {
            scope: { tenantId: 'tenant', organizationId: 'org', userId: 'user', callerAgentKey: 'leader' },
            target: { bindingId: 'binding', provider: 'xpert', reference: 'agent', revision: '1', configuration: {} },
            authorize: async () => undefined
        })
        return new StateGraph(state)
            .addNode('delegate', run)
            .addEdge(START, 'delegate')
            .addEdge('delegate', END)
            .compile({ checkpointer: new MemorySaver() })
    }
    const config = { configurable: { thread_id: 'thread', executionId: 'parent' } }
    for (const graph of [parent(), parent()]) {
        await expect(graph.invoke({ toolCall: { id: 'same-call' } }, config)).rejects.toMatchObject({
            code: cancelled.code,
            executionId: cancelled.executionId,
            message: cancelled.message
        })
        expect((await graph.getState(config)).tasks.flatMap((task) => task.interrupts)).toEqual([])
    }
    const [record] = store.rows.values()
    expect(record.invocation.status).toBe('cancelled')
    expect(invocationCanRelease(record.invocation)).toBe(true)
    expect(child).toHaveBeenCalledTimes(1)
    expect(tasks.receipt).toHaveBeenCalledTimes(1)
    expect(tasks.receipt).toHaveBeenCalledWith('child-task', 'completed', 'claim')
    // A provider observation, even from an otherwise trusted strategy, cannot mint this host receipt.
    expect(() =>
        checkedControlObservation(
            record.invocation,
            {
                status: 'cancelled',
                controlEvidence: record.invocation.controlEvidence
            },
            strategy,
            true
        )
    ).toThrow()
})
