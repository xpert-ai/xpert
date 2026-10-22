import { emptyCheckpoint } from '@langchain/langgraph-checkpoint'
import { Repository } from 'typeorm'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { CopilotCheckpointSaver } from './checkpoint-saver'
import { CopilotCheckpoint } from './copilot-checkpoint.entity'
import { CopilotCheckpointWrites } from './writes/writes.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'

export function checkpointRecoveryFixture() {
    const execution = Object.assign(new XpertAgentExecution(), {
        id: 'run',
        threadId: 'thread',
        tenantId: 'tenant',
        organizationId: 'org',
        status: XpertAgentExecutionStatusEnum.RUNNING
    })
    const thread = Object.assign(new ChatConversationThread(), {
        threadId: 'thread',
        conversationId: 'conversation',
        tenantId: 'tenant',
        organizationId: 'org',
        status: 'busy',
        metadata: {},
        runControl: { executionId: 'run', state: 'running', graphRevision: 'graph' }
    })
    const rows: Partial<CopilotCheckpoint>[] = []
    const upsert = jest.fn(async (row: Partial<CopilotCheckpoint>) => {
        rows.push(row)
    })
    const manager = {
        findOne: jest.fn(async (entity: unknown) => {
            if (entity === ChatConversationThread) return thread
            if (entity === XpertAgentExecution) return execution
            return null
        }),
        upsert: jest.fn(async (_entity: unknown, row: Partial<CopilotCheckpoint>) => upsert(row)),
        update: jest.fn(async (entity: unknown, _where: unknown, changes: Partial<XpertAgentExecution>) => {
            if (entity === XpertAgentExecution) Object.assign(execution, changes)
            return { affected: 1 }
        }),
        save: jest.fn(async (entity: object) => entity)
    }
    const transaction = jest.fn(async (work: (value: typeof manager) => Promise<unknown>) => work(manager))
    const saver = new CopilotCheckpointSaver(
        { upsert, manager: { transaction } } as unknown as Repository<CopilotCheckpoint>,
        {} as Repository<CopilotCheckpointWrites>
    )
    const config = {
        configurable: {
            thread_id: 'thread',
            checkpoint_ns: '',
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'user',
            executionId: 'run',
            rootExecutionId: 'run',
            xpertGraphRevision: 'graph'
        }
    }
    return { execution, thread, rows, upsert, manager, transaction, saver, config }
}

it('keeps the input recovery reference durable even if the process dies before execution finalization', async () => {
    const { execution, rows, saver, config } = checkpointRecoveryFixture()
    const checkpoint = { ...emptyCheckpoint(), id: 'input-checkpoint' }
    await saver.put(config, checkpoint, { source: 'input', step: -1, parents: {} })
    // Simulated hard stop: no graph finalizer, execution handler or owner-loss callback runs.
    expect(rows).toHaveLength(1)
    expect(execution.checkpointId).toBe('input-checkpoint')
    expect(execution.metadata).toMatchObject({
        recovery: {
            version: 1,
            graphRevision: 'graph',
            input: {
                threadId: 'thread',
                checkpointNs: '',
                checkpointId: 'input-checkpoint'
            }
        }
    })
})

it('keeps input and latest distinct as the graph advances', async () => {
    const f = checkpointRecoveryFixture()
    await f.saver.put(f.config, { ...emptyCheckpoint(), id: 'input' }, { source: 'input', step: -1, parents: {} })
    await f.saver.put(f.config, { ...emptyCheckpoint(), id: 'loop' }, { source: 'loop', step: 1, parents: {} })
    expect(f.execution.metadata.recovery.input.checkpointId).toBe('input')
    expect(f.execution.metadata.recovery.latest.checkpointId).toBe('loop')
})

it.each(['new-owner', 'terminated'] as const)('fences a late checkpoint after %s', async (reason) => {
    const f = checkpointRecoveryFixture()
    if (reason === 'new-owner') f.thread.runControl.executionId = 'next-run'
    else f.execution.status = XpertAgentExecutionStatusEnum.INTERRUPTED
    await expect(
        f.saver.put(f.config, emptyCheckpoint(), { source: 'input', step: -1, parents: {} })
    ).rejects.toMatchObject({ response: { code: 'conversation_recovery_unavailable' } })
    expect(f.rows).toHaveLength(0)
    expect(f.execution.checkpointId).toBeUndefined()
})

it('does not replace the root recovery boundary with a subgraph checkpoint', async () => {
    const f = checkpointRecoveryFixture()
    await f.saver.put({ configurable: { ...f.config.configurable, checkpoint_ns: 'tool:child' } }, emptyCheckpoint(), {
        source: 'input',
        step: -1,
        parents: {}
    })
    expect(f.rows).toHaveLength(1)
    expect(f.transaction).not.toHaveBeenCalled()
    expect(f.execution.checkpointId).toBeUndefined()
})
