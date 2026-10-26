import { ExecutionControlStore } from '../execution-control/execution-control.store'
import { RunnableConfig } from '@langchain/core/runnables'
import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph'
import { TXpertGraph } from '@xpert-ai/contracts'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { checkpointReadConfig } from '../copilot-checkpoint/checkpoint-reference'
import { installThreadPauseGuards } from '../shared/agent/thread-pause'
import { ChatConversationThread } from './conversation-thread.entity'
import { legacyThreadGraphRevision, threadGraphRevision } from './thread-graph-revision'
import { ThreadRunControlService } from './thread-run-control.service'

jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))

class PinnedMemorySaver extends MemorySaver {
    getTuple(config: RunnableConfig) {
        return super.getTuple(checkpointReadConfig(config))
    }
}

function fixture(legacy = false) {
    const definition: TXpertGraph = {
        nodes: [
            {
                key: 'tool',
                type: 'agent',
                position: { x: 0, y: 0 },
                entity: { key: 'tool', prompt: 'Approved operation' }
            },
            {
                key: 'next',
                type: 'agent',
                position: { x: 300, y: 0 },
                entity: { key: 'next', prompt: 'Report the result' }
            }
        ],
        connections: [{ key: 'edge', type: 'edge', from: 'tool', to: 'next' }]
    }
    const savedRevision = legacy ? legacyThreadGraphRevision(definition) : threadGraphRevision(definition)
    const thread = Object.assign(new ChatConversationThread(), {
        threadId: 'thread',
        tenantId: 'tenant',
        organizationId: 'org',
        status: 'busy',
        metadata: {},
        runControl: { executionId: 'run', state: 'running', graphRevision: savedRevision }
    })
    const checkpointRepository = { findOne: jest.fn().mockResolvedValue({ checkpoint_id: 'present' }) }
    const manager = {
        getRepository: (entity: unknown) =>
            entity === ChatConversationThread ? { findOne: async () => thread } : checkpointRepository,
        save: async () => thread,
        update: jest.fn()
    }
    const control = new ThreadRunControlService(
        { findOne: async () => thread } as unknown as Repository<ChatConversationThread>,
        {
            transaction: async (work: (manager: EntityManager) => Promise<unknown>) =>
                work(manager as unknown as EntityManager)
        } as DataSource,
        {
            tasks: { execution: jest.fn().mockResolvedValue(null), bind: jest.fn() },
            has: jest.fn(),
            root: jest.fn().mockResolvedValue({ desired: 'running' }),
            intent: jest.fn(),
            end: jest.fn().mockResolvedValue(true),
            drainedExecution: jest.fn().mockResolvedValue(true)
        } as unknown as ExecutionControlStore,
        undefined
    )
    const State = Annotation.Root({ result: Annotation<string> })
    const tool = jest.fn(async () => {
        await control.requestPause('thread', 'run')
        return { result: 'operation completed' }
    })
    const next = jest.fn(() => ({ result: 'reported' }))
    const saver = new PinnedMemorySaver()
    const compile = () => {
        const builder = new StateGraph(State)
            .addNode('tool', tool)
            .addNode('next', next)
            .addEdge(START, 'tool')
            .addEdge('tool', 'next')
            .addEdge('next', END)
        installThreadPauseGuards(builder.nodes, () => control.shouldPause('thread', 'run'))
        return builder.compile({ checkpointer: saver })
    }
    const config = { configurable: { thread_id: 'thread' } }
    const pause = async () => {
        const runtime = compile()
        await runtime.invoke({ result: '' }, config)
        const saved = await runtime.getState(config)
        expect(saved.next).toEqual(['next'])
        const reference = {
            threadId: 'thread',
            checkpointNs: '',
            checkpointId: saved.config.configurable.checkpoint_id
        }
        await control.stageCheckpoint('thread', 'run', reference)
        await control.finish('thread', 'run', 'interrupted')
        return { reference, pauseId: thread.runControl.pauseId }
    }
    return { definition, savedRevision, thread, control, tool, next, compile, pause, checkpointRepository }
}

it.each([false, true])(
    'resumes from the persisted boundary without replaying a completed tool (legacy=%s)',
    async (legacy) => {
        const f = fixture(legacy)
        const { reference, pauseId } = await f.pause()
        if (!legacy) {
            f.definition.nodes[0].position = { x: 500, y: 300 }
            f.definition.nodes[0].hash = 'layout-cache'
        }
        const current = threadGraphRevision(f.definition)
        const exact = legacyThreadGraphRevision(f.definition)
        const admitted = await f.control.claimResume('thread', 'run', pauseId, current, exact)
        expect(admitted).toEqual(reference)
        expect(await f.control.recordGraph('thread', 'run', current, exact)).toBe(f.savedRevision)
        expect(f.thread.runControl.graphRevision).toBe(f.savedRevision)
        await expect(f.control.claimResume('thread', 'run', pauseId, current, exact)).rejects.toThrow()

        const runtime = f.compile()
        await runtime.invoke(null, { configurable: { thread_id: 'thread', xpertResumeCheckpoint: admitted } })

        expect(f.tool).toHaveBeenCalledTimes(1)
        expect(f.next).toHaveBeenCalledTimes(1)
        expect((await runtime.getState({ configurable: { thread_id: 'thread' } })).values.result).toBe('reported')
    }
)

it.each(['prompt', 'connection', 'legacy-layout', 'missing-revision', 'future-revision'] as const)(
    'rejects %s before admitting another tool or reading a checkpoint',
    async (change) => {
        const f = fixture(change === 'legacy-layout')
        const { pauseId } = await f.pause()
        if (change === 'prompt' && f.definition.nodes[0].type === 'agent')
            f.definition.nodes[0].entity.prompt = 'Different task'
        if (change === 'connection') f.definition.connections = []
        if (change === 'legacy-layout') f.definition.nodes[0].position.x = 500
        if (change === 'missing-revision') delete f.thread.runControl.graphRevision
        if (change === 'future-revision') f.thread.runControl.graphRevision = `execution-v99:${'a'.repeat(64)}`
        await expect(
            f.control.claimResume(
                'thread',
                'run',
                pauseId,
                threadGraphRevision(f.definition),
                legacyThreadGraphRevision(f.definition)
            )
        ).rejects.toThrow()
        expect(f.thread.status).toBe('paused')
        expect(f.checkpointRepository.findOne).not.toHaveBeenCalled()
        expect(f.tool).toHaveBeenCalledTimes(1)
        expect(f.next).not.toHaveBeenCalled()
    }
)

it('keeps the exact legacy fork revision through admission and does not upgrade it from current layout', async () => {
    const f = fixture(true)
    f.thread.metadata = { forkGraphRevision: f.savedRevision }
    delete f.thread.runControl.graphRevision
    const current = threadGraphRevision(f.definition)
    await expect(
        f.control.recordGraph('thread', 'run', current, legacyThreadGraphRevision(f.definition))
    ).resolves.toBe(f.savedRevision)
    expect(f.thread.runControl.graphRevision).toBe(f.savedRevision)
    f.definition.nodes[0].position.x = 800
    await expect(
        f.control.recordGraph('thread', 'run', current, legacyThreadGraphRevision(f.definition))
    ).rejects.toThrow()
    expect(f.thread.metadata.forkGraphRevision).toBe(f.savedRevision)
})
