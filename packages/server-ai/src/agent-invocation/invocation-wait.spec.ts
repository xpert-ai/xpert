jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { Annotation, Command, END, MemorySaver, START, StateGraph } from '@langchain/langgraph'
import { AgentInvocation, AgentInvocationApi } from '@xpert-ai/plugin-sdk'
import { awaitAgentInvocation } from './invocation-wait'

const state = Annotation.Root({ result: Annotation<string> })
function fixture() {
    const invocation: AgentInvocation = {
        id: 'invocation',
        revision: 1,
        createdAt: '',
        updatedAt: '',
        status: 'running',
        scope: { tenantId: 't', organizationId: 'o', userId: 'u', parentExecutionId: 'p', callerAgentKey: 'a' },
        request: {
            callId: 'call',
            target: { bindingId: 'b', provider: 'remote', reference: 'r', revision: '1', configuration: {} },
            input: { prompt: 'task' }
        }
    }
    const api: AgentInvocationApi = {
        start: jest.fn(),
        inspect: jest.fn(async () => ({ ...invocation })),
        cancel: jest.fn(),
        respond: jest.fn(async () => {
            invocation.status = 'succeeded'
            invocation.result = { text: 'approved' }
            return invocation
        })
    }
    const graph = new StateGraph(state)
        .addNode('wait', async () => {
            const result = await awaitAgentInvocation(api, invocation.id)
            return { result: result.result?.text || result.status }
        })
        .addEdge(START, 'wait')
        .addEdge('wait', END)
        .compile({ checkpointer: new MemorySaver() })
    return { api, graph, invocation, config: { configurable: { thread_id: 'wait-thread' } } }
}

describe('Agent invocation checkpoint wait', () => {
    it('suspends without polling and reads the same invocation on resume', async () => {
        const f = fixture()
        await f.graph.invoke({}, f.config)
        expect((await f.graph.getState(f.config)).next).toEqual(['wait'])
        expect(f.api.inspect).toHaveBeenCalledTimes(1)
        f.invocation.status = 'succeeded'
        f.invocation.result = { text: 'done' }
        expect((await f.graph.invoke(new Command({ resume: { completed: true } }), f.config)).result).toBe('done')
        expect(f.api.start).not.toHaveBeenCalled()
    })
    it('resumes provider approval through the scoped host API', async () => {
        const f = fixture()
        f.invocation.status = 'waiting'
        f.invocation.interaction = { id: 'approval', kind: 'approval', prompt: 'Proceed?' }
        await f.graph.invoke({}, f.config)
        const result = await f.graph.invoke(
            new Command({ resume: { interactionId: 'approval', response: true } }),
            f.config
        )
        expect(result.result).toBe('approved')
        expect(f.api.respond).toHaveBeenCalledWith('invocation', 'approval', true)
    })
    it('rejects stale approval identifiers without sending them to the provider', async () => {
        const f = fixture()
        f.invocation.status = 'waiting'
        f.invocation.interaction = { id: 'approval', kind: 'approval', prompt: 'Proceed?' }
        await f.graph.invoke({}, f.config)
        await f.graph.invoke(new Command({ resume: { interactionId: 'old', response: true } }), f.config)
        expect(f.api.respond).not.toHaveBeenCalled()
        expect((await f.graph.getState(f.config)).tasks[0].interrupts).toHaveLength(1)
        const done = await f.graph.invoke(
            new Command({ resume: { interactionId: 'approval', response: true } }),
            f.config
        )
        expect(done.result).toBe('approved')
    })
})
