import 'reflect-metadata'
import { Annotation, Command, END, START, StateGraph, interrupt } from '@langchain/langgraph'
import type { Repository } from 'typeorm'
import { CopilotCheckpointSaver } from './checkpoint-saver'
import { CopilotCheckpoint } from './copilot-checkpoint.entity'
import { CopilotCheckpointWrites } from './writes/writes.entity'
import { CopilotCheckpointWritesService } from './writes/writes.service'
import type { RunnableConfig } from '@langchain/core/runnables'
import type { PendingWrite } from '@langchain/langgraph-checkpoint'

jest.mock('@xpert-ai/server-core', () => ({
    TenantOrganizationBaseEntity: class {},
    TenantOrganizationAwareCrudService: class {
        constructor(public repository: object) {}
    },
    RequestContext: { currentTenantId: () => 'test-tenant', getOrganizationId: () => 'test-org' }
}))

function repository<T extends object>() {
    const rows: T[] = []
    return {
        rows,
        async find({ where, order, take }: { where: object; order?: object; take?: number }) {
            const selected = rows.filter((row) =>
                Object.entries(where).every(([key, value]) => Reflect.get(row, key) === value)
            )
            if (order)
                selected.sort((a, b) =>
                    String(Reflect.get(b, 'checkpoint_id')).localeCompare(String(Reflect.get(a, 'checkpoint_id')))
                )
            return selected.slice(0, take)
        },
        async upsert(row: T, { conflictPaths }: { conflictPaths: string[] }) {
            const existing = rows.find((item) =>
                conflictPaths.every((key) => Reflect.get(item, key) === Reflect.get(row, key))
            )
            if (existing) Object.assign(existing, row)
            else rows.push(row)
        }
    }
}

it.each(['local', 'remote'])('persists consecutive interrupts through the %s writer', async (writer) => {
    const checkpoints = repository<CopilotCheckpoint>()
    const writes = repository<CopilotCheckpointWrites>()
    const transactional = {
        upsert: async (
            _entity: typeof CopilotCheckpointWrites,
            row: CopilotCheckpointWrites,
            options: { conflictPaths: string[] }
        ) => writes.upsert(row, options)
    }
    const saver = new CopilotCheckpointSaver(
        checkpoints as unknown as Repository<CopilotCheckpoint>,
        {
            ...writes,
            manager: {
                transaction: async (run: (manager: typeof transactional) => Promise<void>) => run(transactional)
            }
        } as unknown as Repository<CopilotCheckpointWrites>
    )
    if (writer === 'remote') {
        const service = new CopilotCheckpointWritesService({
            manager: {
                transaction: async (run: (manager: typeof transactional) => Promise<void>) => run(transactional)
            }
        } as unknown as Repository<CopilotCheckpointWrites>)
        saver.putWrites = async (config: RunnableConfig, values: PendingWrite[], taskId: string) => {
            await service.upsert(
                values.map(([channel, value]) => ({
                    thread_id: config.configurable?.thread_id,
                    checkpoint_ns: config.configurable?.checkpoint_ns,
                    checkpoint_id: config.configurable?.checkpoint_id,
                    task_id: taskId,
                    channel,
                    value
                }))
            )
        }
    }
    const execute = jest.fn()
    const graph = new StateGraph(Annotation.Root({ result: Annotation<string>() }))
        .addNode('shell', () => {
            const prepared = interrupt({ stage: 'prepare' })
            const approved = interrupt({ stage: 'approval', command: prepared.command })
            if (approved === 'approve') execute(prepared.command)
            return { result: approved }
        })
        .addEdge(START, 'shell')
        .addEdge('shell', END)
        .compile({ checkpointer: saver })
    const config = { configurable: { thread_id: 'test-thread', checkpoint_ns: '', organizationId: 'test-org' } }
    await graph.invoke({}, config)
    expect((await graph.getState(config)).tasks[0].interrupts[0].value).toEqual({ stage: 'prepare' })
    await graph.invoke(new Command({ resume: { command: 'pwd' } }), config)
    expect(execute).not.toHaveBeenCalled()
    expect((await graph.getState(config)).tasks[0].interrupts[0].value).toEqual({ stage: 'approval', command: 'pwd' })
    await graph.invoke(new Command({ resume: 'approve' }), config)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith('pwd')
    expect((await graph.getState(config)).next).toEqual([])
})
