import 'reflect-metadata'
import { HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { Annotation, Command, END, interrupt, START, StateGraph } from '@langchain/langgraph'
import type { Repository } from 'typeorm'
import { z } from 'zod/v3'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint/checkpoint-saver'
import type { CopilotCheckpoint } from '../../../copilot-checkpoint/copilot-checkpoint.entity'
import type { CopilotCheckpointWrites } from '../../../copilot-checkpoint/writes/writes.entity'
import { routeAgentToolCalls } from './agent-navigation'
import { AGENT_TOOL_SNAPSHOTS, installAgentToolSnapshots } from './agent-tool-snapshots'
import { ToolNode } from './tool_node'

jest.mock('@xpert-ai/server-core', () => ({ TenantOrganizationBaseEntity: class {} }))
// This suite exercises the normal saver path; recovery-lease SQL is a separate boundary.
jest.mock('../../../copilot-checkpoint/checkpoint-recovery', () => ({ checkpointRecoveryWriter: () => undefined }))

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

it('restores a shared dispatch snapshot through the platform saver and pending writes', async () => {
    const checkpoints = repository<CopilotCheckpoint>()
    const writes = repository<CopilotCheckpointWrites>()
    const transactional = {
        upsert: async (_entity: unknown, row: CopilotCheckpointWrites, options: { conflictPaths: string[] }) =>
            writes.upsert(row, options)
    }
    const createSaver = () =>
        new CopilotCheckpointSaver(
            checkpoints as unknown as Repository<CopilotCheckpoint>,
            {
                ...writes,
                manager: {
                    transaction: async (run: (manager: typeof transactional) => Promise<void>) => run(transactional)
                }
            } as unknown as Repository<CopilotCheckpointWrites>
        )
    const State = Annotation.Root({
        messages: Annotation<BaseMessage[]>({ reducer: (old, next) => [...old, ...next], default: () => [] }),
        projectId: Annotation<string>()
    })
    const executed: number[] = []
    const observed: unknown[] = []
    const projectTool = tool(
        async ({ index }, config) => {
            observed.push(config.configurable.runtimeState)
            if (index === 1) expect(interrupt('approve')).toBe('approved')
            executed.push(index)
            return new Command({
                update: {
                    messages: [
                        new ToolMessage({ content: `done-${index}`, tool_call_id: config.configurable.tool_call_id })
                    ]
                }
            })
        },
        { name: 'project_update', schema: z.object({ index: z.number() }) }
    )
    const createGraph = (saver: CopilotCheckpointSaver) =>
        installAgentToolSnapshots(
            new StateGraph(State)
                .addNode('model', () => ({}))
                .addNode(projectTool.name, new ToolNode([projectTool], { toolName: 'Project' }))
                .addEdge(START, 'model')
                .addConditionalEdges(
                    'model',
                    (state, config) =>
                        routeAgentToolCalls(
                            [0, 1, 2].map((index) => ({
                                name: projectTool.name,
                                id: `call-${index}`,
                                args: { index }
                            })),
                            state,
                            new Set([projectTool.name]),
                            projectTool.name,
                            config
                        ),
                    [projectTool.name]
                )
                .addEdge(projectTool.name, END)
                .compile({ checkpointer: saver })
        )
    const config = { configurable: { thread_id: 'platform-snapshot', organizationId: 'org-1' } }
    const history = new HumanMessage(`history-marker:${'x'.repeat(64 * 1024)}`)
    await createGraph(createSaver()).invoke({ messages: [history], projectId: 'original' }, config)
    expect(executed.sort()).toEqual([0, 2])
    const saved = await createSaver().getTuple(config)
    expect(saved.checkpoint.channel_values[AGENT_TOOL_SNAPSHOTS]).toHaveLength(1)
    expect(JSON.stringify(saved.checkpoint.channel_values.__pregel_tasks)).not.toContain('history-marker:')
    expect(saved.pendingWrites.some(([, channel]) => channel === 'messages')).toBe(true)

    // Rebuild both graph and saver; restoration can only use persisted serialized rows.
    const result = await createGraph(createSaver()).invoke(
        new Command({
            resume: 'approved',
            update: { projectId: 'updated-on-resume' }
        }),
        config
    )
    expect(executed).toEqual([0, 2, 1])
    expect(observed).toHaveLength(4)
    for (const state of observed) {
        expect(state).toMatchObject({
            projectId: 'original',
            messages: [expect.objectContaining({ content: history.content })]
        })
        expect(state).not.toHaveProperty(AGENT_TOOL_SNAPSHOTS)
    }
    expect(result.projectId).toBe('updated-on-resume')
    expect(result.messages).toHaveLength(4)
    expect((await createSaver().getTuple(config)).checkpoint.channel_values[AGENT_TOOL_SNAPSHOTS]).toEqual([])
})
