import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { MessagesAnnotation, StateGraph, START, END } from '@langchain/langgraph'
import { EntityManager, FindOperator, Repository } from 'typeorm'
import { CopilotCheckpointSaver } from '../copilot-checkpoint/checkpoint-saver'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { CopilotCheckpointWrites } from '../copilot-checkpoint/writes/writes.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { copyBranchCheckpoints } from './branch-checkpoints'

/** Real graph/serializer, with an in-memory implementation of the persistence boundary. */
function store() {
    const rows: CopilotCheckpoint[] = []
    const writes: CopilotCheckpointWrites[] = []
    const writeRepository = {
        find: jest.fn(async ({ where }: { where: Partial<CopilotCheckpointWrites> }) =>
            writes.filter(
                (row) =>
                    row.thread_id === where.thread_id &&
                    row.checkpoint_ns === where.checkpoint_ns &&
                    row.checkpoint_id === where.checkpoint_id
            )
        ),
        manager: {
            transaction: async (run: (manager: { upsert: typeof upsertWrite }) => Promise<void>) =>
                run({ upsert: upsertWrite })
        }
    }
    function upsertWrite(_entity: typeof CopilotCheckpointWrites, input: CopilotCheckpointWrites) {
        const old = writes.find(
            (row) =>
                row.thread_id === input.thread_id &&
                row.checkpoint_id === input.checkpoint_id &&
                row.task_id === input.task_id &&
                row.idx === input.idx
        )
        if (old) Object.assign(old, input)
        else writes.push(input)
        return Promise.resolve()
    }
    type Where = {
        thread_id?: string
        checkpoint_ns?: string
        checkpoint_id?: string
        tenantId?: string
        organizationId?: string | FindOperator<unknown>
    }
    function find(where: Where) {
        return rows.filter(
            (row) =>
                (!where.thread_id || row.thread_id === where.thread_id) &&
                (where.checkpoint_ns === undefined || row.checkpoint_ns === where.checkpoint_ns) &&
                (!where.checkpoint_id || row.checkpoint_id === where.checkpoint_id) &&
                (!where.tenantId || row.tenantId === where.tenantId) &&
                (!where.organizationId ||
                    (where.organizationId instanceof FindOperator
                        ? row.organizationId == null
                        : row.organizationId === where.organizationId))
        )
    }
    const repository = {
        find: jest.fn(async ({ where, order, take }: { where: Where; order?: object; take?: number }) => {
            const matching = find(where)
            if (order) matching.sort((a, b) => b.checkpoint_id.localeCompare(a.checkpoint_id))
            return take ? matching.slice(0, take) : matching
        }),
        findOne: jest.fn(async ({ where }: { where: Where }) => find(where)[0] ?? null),
        create: (input: CopilotCheckpoint) => input,
        save: async (input: CopilotCheckpoint) => {
            rows.push(input)
            return input
        },
        upsert: async (input: CopilotCheckpoint) => {
            const old = find(input)[0]
            if (old) Object.assign(old, input)
            else rows.push(input)
        }
    }
    const saver = new CopilotCheckpointSaver(
        repository as unknown as Repository<CopilotCheckpoint>,
        writeRepository as unknown as Repository<CopilotCheckpointWrites>
    )
    const manager = { getRepository: () => repository } as unknown as EntityManager
    return { rows, writes, saver, manager, repository }
}

describe('conversation branch checkpoints', () => {
    it('continues from A1 without H2, replayed tool calls, or dependence on the source', async () => {
        const db = store()
        let toolCalls = 0
        const graph = new StateGraph(MessagesAnnotation)
            .addNode('answer', async (state) => {
                toolCalls++
                const input = state.messages[state.messages.length - 1].content
                const callId = `call-${toolCalls}`
                return {
                    messages: [
                        new AIMessage({ content: '', tool_calls: [{ name: 'tool', args: {}, id: callId }] }),
                        new ToolMessage({ content: `result-${input}`, tool_call_id: callId }),
                        new AIMessage(`answer-${input}`)
                    ]
                }
            })
            .addEdge(START, 'answer')
            .addEdge('answer', END)
            .compile({ checkpointer: db.saver })
        const sourceConfig = {
            configurable: { thread_id: 'source', tenantId: 'tenant', organizationId: 'org', userId: 'user' }
        }
        await graph.invoke({ messages: [new HumanMessage('H1')] }, sourceConfig)
        const first = await db.saver.getTuple(sourceConfig)
        const anchor = { threadId: 'source', checkpointNs: '', checkpointId: first!.checkpoint.id }
        await graph.invoke({ messages: [new HumanMessage('H2')] }, sourceConfig)
        const messages = [
            {
                id: 'a1',
                outputCheckpoint: { version: 1, checkpoint: anchor, checkpoints: [anchor], graphRevision: 'revision' }
            }
        ] as ChatMessage[]
        await copyBranchCheckpoints({
            manager: db.manager,
            serializer: db.saver.serde,
            messages,
            targetThreadId: 'target',
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'user',
            allowedThreadIds: new Set(['source']),
            messageIds: new Map()
        })
        const targetConfig = { configurable: { ...sourceConfig.configurable, thread_id: 'target' } }
        const before = await graph.getState(targetConfig)
        expect(before.values.messages.map((message: HumanMessage) => message.content)).toEqual([
            'H1',
            '',
            'result-H1',
            'answer-H1'
        ])
        const continued = await graph.invoke({ messages: [new HumanMessage('H3')] }, targetConfig)
        expect(toolCalls).toBe(3)
        expect(continued.messages.map((message) => message.content)).not.toContain('H2')
        expect(continued.messages.map((message) => message.content)).toContain('answer-H3')
        expect(
            db.rows
                .filter((row) => row.thread_id === 'target')
                .some((row) => row.checkpoint_id === first!.checkpoint.id)
        ).toBe(true)
        db.rows.splice(0, db.rows.length, ...db.rows.filter((row) => row.thread_id !== 'source'))
        expect((await graph.getState(targetConfig)).values.messages).toHaveLength(8)
        const secondAnchor = { ...anchor, threadId: 'target' }
        await copyBranchCheckpoints({
            manager: db.manager,
            serializer: db.saver.serde,
            messages: [
                {
                    outputCheckpoint: {
                        version: 1,
                        checkpoint: secondAnchor,
                        checkpoints: [secondAnchor],
                        graphRevision: 'revision'
                    }
                }
            ] as ChatMessage[],
            targetThreadId: 'second-target',
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'user',
            allowedThreadIds: new Set(['target']),
            messageIds: new Map()
        })
        const secondConfig = { configurable: { ...targetConfig.configurable, thread_id: 'second-target' } }
        const second = await graph.invoke({ messages: [new HumanMessage('H4')] }, secondConfig)
        expect(second.messages.map((message) => message.content)).toEqual([
            'H1',
            '',
            'result-H1',
            'answer-H1',
            'H4',
            '',
            'result-H4',
            'answer-H4'
        ])
        expect(toolCalls).toBe(4)
    })

    it('fails closed for a missing or unauthorized checkpoint', async () => {
        const db = store()
        const reference = { threadId: 'other-tenant-thread', checkpointNs: '', checkpointId: 'missing' }
        const params = {
            manager: db.manager,
            serializer: db.saver.serde,
            messages: [
                { inputCheckpoint: { version: 1, graphRevision: 'rev', checkpoint: reference } }
            ] as ChatMessage[],
            targetThreadId: 'target',
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'user',
            allowedThreadIds: new Set(['source']),
            messageIds: new Map<string, string>()
        }
        await expect(copyBranchCheckpoints(params)).rejects.toThrow()
        expect(db.repository.findOne).not.toHaveBeenCalled()
        await expect(
            copyBranchCheckpoints({ ...params, allowedThreadIds: new Set([reference.threadId]) })
        ).rejects.toThrow()
        expect(db.rows).toHaveLength(0)
    })
})
