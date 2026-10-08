jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { Annotation, Command, END, MemorySaver, START, StateGraph, interrupt } from '@langchain/langgraph'
import { invocationInterrupt, matchesInvocationResume } from './invocation-continuation'

it('finds the durable runtime interrupt and resumes it without approving the next human operation', async () => {
    const saver = new MemorySaver()
    const graph = new StateGraph(Annotation.Root({ result: Annotation<string>() }))
        .addNode('work', () => {
            interrupt({ type: 'agent_invocation', invocationId: 'child' })
            const approved = interrupt({ type: 'human_approval', operation: 'publish' })
            return { result: approved ? 'published' : 'declined' }
        })
        .addEdge(START, 'work')
        .addEdge('work', END)
        .compile({ checkpointer: saver })
    const config = { configurable: { thread_id: 'parent' } }
    await graph.invoke({}, config)
    const tuple = await saver.getTuple(config)
    const id = invocationInterrupt(tuple, 'child')
    expect(id).toBeTruthy()
    const fence = { invocationId: 'child', checkpointId: tuple.checkpoint.id, checkpointNamespace: '', interruptId: id }
    expect(matchesInvocationResume(tuple, fence)).toBe(true)
    expect(invocationInterrupt(tuple, 'unrelated-child')).toBeNull()
    await graph.invoke(new Command({ resume: { [id]: { completed: true } } }), config)
    expect((await graph.getState(config)).tasks[0].interrupts[0].value).toEqual({
        type: 'human_approval',
        operation: 'publish'
    })
    expect(matchesInvocationResume(await saver.getTuple(config), fence)).toBe(false)
})
