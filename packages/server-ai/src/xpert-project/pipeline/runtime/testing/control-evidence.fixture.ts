import { ExecutionControlEvidence } from '@xpert-ai/contracts'
import { randomUUID } from 'node:crypto'
import { DataSource, Table } from 'typeorm'
import { TaskControlStore, ExecutionTaskControl, TaskControlPublication } from '@xpert-ai/server-core'
import { ExecutionControl } from '../../../../execution-control/execution-control.entity'
import { ExecutionControlStore } from '../../../../execution-control/execution-control.store'
import { ExecutionControlEvidenceService } from '../../../../execution-control/execution-control-evidence.service'

/** Explicit simulated completion for bridge fixtures; actual ledger integration uses controlLedger below. */
export function nativeCompletion(
    executionId: string,
    desired: 'running' | 'terminated' = 'running'
): ExecutionControlEvidence {
    return {
        version: 1,
        source: 'platform',
        subject: { kind: 'execution', id: executionId },
        scope: 'owned_subtree',
        state: 'settled',
        desired,
        taskId: executionId,
        rootId: executionId,
        revision: 1,
        executionId,
        threadId: executionId,
        observedAt: new Date().toISOString()
    }
}

export async function controlLedger(db: DataSource) {
    const runner = db.createQueryRunner()
    for (const type of [ExecutionControl, ExecutionTaskControl, TaskControlPublication])
        await runner.createTable(Table.create(db.getMetadata(type), db.driver), true)
    await runner.release()
    const tasks = new TaskControlStore(db)
    const controls = new ExecutionControlStore(db, tasks)
    const evidence = new ExecutionControlEvidenceService(db, tasks)
    async function seed(
        executionId: string,
        scope: { tenantId: string; organizationId?: string | null },
        parentId?: string,
        policy: 'attached' | 'detached' | 'shared' = 'attached'
    ) {
        const task = await tasks.register({
            ...scope,
            kind: 'execution',
            resourceId: executionId,
            executionId,
            threadId: randomUUID(),
            ...(parentId ? { parent: { version: 2, targetId: parentId } } : {}),
            policy
        })
        // An independently admitted domain execution has its own phase-1 root, as cross-thread tasks do.
        await db.getRepository(ExecutionControl).save({
            ...scope,
            executionId,
            rootExecutionId: executionId,
            threadId: task.threadId,
            ownership: { policy: 'detached', rootExecutionId: executionId },
            ancestors: [executionId],
            desired: 'running',
            revision: 1,
            graphEnded: false,
            work: []
        })
        await tasks.receipt(task.id, 'running')
        return task
    }
    return { tasks, controls, evidence, seed }
}
