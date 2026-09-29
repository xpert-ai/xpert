import { RunnableLambda } from '@langchain/core/runnables'
import { Annotation, Command, END, interrupt, MemorySaver, START, StateGraph } from '@langchain/langgraph'
import { installThreadPauseGuards } from './thread-pause'
import type { RunnableConfig } from '@langchain/core/runnables'
import { checkpointReadConfig } from '../../copilot-checkpoint/checkpoint-reference'

class PinnedMemorySaver extends MemorySaver {
    getTuple(config: RunnableConfig) {
        return super.getTuple(checkpointReadConfig(config))
    }
}

describe('thread pause at a persisted node boundary', () => {
    it('saves completed work, skips the next operation and resumes without repeating it', async () => {
        const State = Annotation.Root({ value: Annotation<number> })
        let pause = false
        const first = jest.fn(() => {
            pause = true
            return { value: 1 }
        })
        const second = jest.fn(() => ({ value: 2 }))
        const builder = new StateGraph(State)
            .addNode('first', RunnableLambda.from(first))
            .addNode('second', RunnableLambda.from(second))
            .addEdge(START, 'first')
            .addEdge('first', 'second')
            .addEdge('second', END)
        installThreadPauseGuards(builder.nodes, async () => pause)
        const graph = builder.compile({ checkpointer: new PinnedMemorySaver() })
        const config = { configurable: { thread_id: 'pause-test' } }

        await graph.invoke({ value: 0 }, config)
        const saved = await graph.getState(config)
        expect(saved.values.value).toBe(1)
        expect(saved.next).toEqual(['second'])
        expect(saved.tasks[0].interrupts[0].value).toEqual({ type: 'thread_pause' })
        expect(second).not.toHaveBeenCalled()

        pause = false
        await graph.invoke(null, {
            configurable: {
                thread_id: 'pause-test',
                xpertResumeCheckpoint: {
                    threadId: 'pause-test',
                    checkpointNs: '',
                    checkpointId: saved.config.configurable.checkpoint_id
                }
            }
        })
        expect(first).toHaveBeenCalledTimes(1)
        expect(second).toHaveBeenCalledTimes(1)
        expect((await graph.getState(config)).values.value).toBe(2)
    })

    it('preserves pending writes from a completed parallel node across a pause', async () => {
        const State = Annotation.Root({
            values: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] })
        })
        let pause = true
        const completed = jest.fn(() => ({ values: ['completed'] }))
        const pending = jest.fn(() => ({ values: ['pending'] }))
        const builder = new StateGraph(State)
            .addNode('completed', completed)
            .addNode('pending', pending)
            .addEdge(START, 'completed')
            .addEdge(START, 'pending')
            .addEdge('completed', END)
            .addEdge('pending', END)
        installThreadPauseGuards({ pending: builder.nodes.pending }, async () => pause)
        const graph = builder.compile({ checkpointer: new PinnedMemorySaver() })
        const config = { configurable: { thread_id: 'parallel-test' } }
        await graph.invoke({ values: [] }, config)
        pause = false
        const saved = await graph.getState(config)
        await graph.invoke(null, {
            configurable: {
                thread_id: 'parallel-test',
                xpertResumeCheckpoint: {
                    threadId: 'parallel-test',
                    checkpointNs: '',
                    checkpointId: saved.config.configurable.checkpoint_id
                }
            }
        })
        expect(completed).toHaveBeenCalledTimes(1)
        expect(pending).toHaveBeenCalledTimes(1)
        expect((await graph.getState(config)).values.values.sort()).toEqual(['completed', 'pending'])
    })
    it('resumes a nested graph at its child checkpoint without repeating completed child operations', async () => {
        const State = Annotation.Root({ value: Annotation<number> })
        let pause = false
        const first = jest.fn(() => {
            pause = true
            return { value: 1 }
        })
        const second = jest.fn(() => ({ value: 2 }))
        const child = new StateGraph(State)
            .addNode('first', first)
            .addNode('second', second)
            .addEdge(START, 'first')
            .addEdge('first', 'second')
            .addEdge('second', END)
        installThreadPauseGuards(child.nodes, async () => pause)
        const root = new StateGraph(State)
            .addNode('child', child.compile())
            .addEdge(START, 'child')
            .addEdge('child', END)
        installThreadPauseGuards(root.nodes, async () => pause)
        const graph = root.compile({ checkpointer: new PinnedMemorySaver() })
        const config = { configurable: { thread_id: 'nested' } }
        await graph.invoke({ value: 0 }, config)
        const saved = await graph.getState(config)
        expect(second).not.toHaveBeenCalled()
        pause = false
        await graph.invoke(null, {
            configurable: {
                thread_id: 'nested',
                xpertResumeCheckpoint: {
                    threadId: 'nested',
                    checkpointNs: '',
                    checkpointId: saved.config.configurable.checkpoint_id
                }
            }
        })
        expect(first).toHaveBeenCalledTimes(1)
        expect(second).toHaveBeenCalledTimes(1)
        expect((await graph.getState(config)).values.value).toBe(2)
    })

    it('keeps human approval pending after resume instead of implicitly approving it', async () => {
        const State = Annotation.Root({ answer: Annotation<string> })
        let pause = true
        const action = jest.fn(() => ({ answer: interrupt('approval required') }))
        const builder = new StateGraph(State)
            .addNode('approve', action)
            .addEdge(START, 'approve')
            .addEdge('approve', END)
        installThreadPauseGuards(builder.nodes, async () => pause)
        const graph = builder.compile({ checkpointer: new PinnedMemorySaver() })
        const config = { configurable: { thread_id: 'approval' } }
        await graph.invoke({ answer: '' }, config)
        expect(action).not.toHaveBeenCalled()
        const saved = await graph.getState(config)
        pause = false
        await graph.invoke(null, {
            configurable: {
                thread_id: 'approval',
                xpertResumeCheckpoint: {
                    threadId: 'approval',
                    checkpointNs: '',
                    checkpointId: saved.config.configurable.checkpoint_id
                }
            }
        })
        const waiting = await graph.getState(config)
        expect(waiting.tasks[0].interrupts[0].value).toBe('approval required')
        expect(waiting.values.answer).toBe('')
        await graph.invoke(new Command({ resume: 'approved' }), config)
        expect((await graph.getState(config)).values.answer).toBe('approved')
    })

    it('reads the pinned checkpoint even when a newer snapshot exists', async () => {
        const State = Annotation.Root({ value: Annotation<number> })
        let pause = true
        const builder = new StateGraph(State)
            .addNode('next', (state) => ({ value: state.value + 1 }))
            .addEdge(START, 'next')
            .addEdge('next', END)
        installThreadPauseGuards(builder.nodes, async () => pause)
        const graph = builder.compile({ checkpointer: new PinnedMemorySaver() })
        const config = { configurable: { thread_id: 'pinned' } }
        await graph.invoke({ value: 1 }, config)
        const saved = await graph.getState(config)
        await graph.updateState(config, { value: 100 })
        pause = false
        await graph.invoke(null, {
            configurable: {
                thread_id: 'pinned',
                xpertResumeCheckpoint: {
                    threadId: 'pinned',
                    checkpointNs: '',
                    checkpointId: saved.config.configurable.checkpoint_id
                }
            }
        })
        expect((await graph.getState(config)).values.value).toBe(2)
    })
})
