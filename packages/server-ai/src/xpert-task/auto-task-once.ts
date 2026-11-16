import { randomUUID } from 'node:crypto'
import { lastValueFrom, Observable, count } from 'rxjs'
import { Repository } from 'typeorm'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { AutoTask } from './auto-task.entity'
import { ScheduledTaskExecution, ScheduledTaskExecutionStatus as Status } from './scheduled-task-execution.entity'

// Reserve stable IDs before calling chat. The second task-row lock orders competing scanners and schedule edits.
// Chat admission commits independently: after a crash its durable execution is authoritative, even if the occurrence still says pending.
export async function runOneOffAutoTask(
    repository: Repository<AutoTask>,
    scanned: AutoTask,
    start: (
        task: AutoTask,
        conversationId: string,
        executionId: string,
        conversation?: ChatConversation
    ) => Promise<Observable<unknown>>
) {
    const scheduledAt = scanned.nextRunAt
    if (!scheduledAt) return
    const due: Schedule = {
        id: scanned.id,
        tenantId: scanned.tenantId,
        enabled: true,
        frequency: 'once',
        nextRunAt: scheduledAt
    }
    const key = {
        taskId: scanned.id,
        occurrenceKey: 'auto:' + scheduledAt.toISOString(),
        taskSource: 'auto_task' as const
    }
    const locked = { mode: 'pessimistic_write' as const }
    const reserved = await repository.manager.transaction(async (tx) => {
        const task = await tx.findOne(AutoTask, { where: due, lock: locked })
        if (!task || scheduledAt > new Date()) return false
        await tx
            .createQueryBuilder()
            .insert()
            .into(ScheduledTaskExecution)
            .values({
                ...key,
                scheduledAt,
                tenantId: task.tenantId,
                organizationId: task.organizationId,
                createdById: task.createdById,
                executionId: randomUUID(),
                conversationId: randomUUID()
            })
            .orIgnore()
            .execute()
        return true
    })
    if (!reserved) return
    const stream = await reconcileOccurrence(repository, key, due, start)
    if (stream) {
        try {
            await lastValueFrom(stream.pipe(count()))
        } finally {
            await reconcileOccurrence(repository, key, due)
        }
    }
}

type OccurrenceKey = Pick<ScheduledTaskExecution, 'taskId' | 'occurrenceKey' | 'taskSource'>
type Schedule = Pick<AutoTask, 'id' | 'tenantId'> & { frequency: 'once'; enabled: true; nextRunAt: Date }

async function reconcileOccurrence(
    repository: Repository<AutoTask>,
    key: OccurrenceKey,
    due: Schedule,
    start?: Parameters<typeof runOneOffAutoTask>[2]
) {
    return repository.manager.transaction(async (tx) => {
        // Always lock in task/occurrence order. A later schedule only affects permission to start.
        const lock = { mode: 'pessimistic_write' as const }
        const task = await tx.findOne(AutoTask, { where: due, lock })
        const occurrence = await tx.findOneOrFail(ScheduledTaskExecution, {
            where: { ...key, tenantId: due.tenantId },
            lock
        })
        if (occurrence.completedAt) {
            if (task)
                await tx.update(AutoTask, due, { enabled: false, nextRunAt: null, lastRunAt: occurrence.completedAt })
            return
        }
        const execution = await tx.findOneBy(XpertAgentExecution, {
            id: occurrence.executionId,
            tenantId: due.tenantId
        })
        if (execution) {
            if (
                [XpertAgentExecutionStatusEnum.PENDING, XpertAgentExecutionStatusEnum.RUNNING].includes(
                    execution.status
                )
            ) {
                await tx.update(ScheduledTaskExecution, occurrence.id, { status: Status.RUNNING })
                return
            }
            const now = new Date()
            const succeeded = execution.status === XpertAgentExecutionStatusEnum.SUCCESS
            await tx.update(ScheduledTaskExecution, occurrence.id, {
                status: succeeded ? Status.SUCCEEDED : Status.FAILED,
                completedAt: now,
                lastError: succeeded ? null : execution.status
            })
            if (task) await tx.update(AutoTask, due, { enabled: false, nextRunAt: null, lastRunAt: now })
            return
        }
        if (!task) {
            await tx.update(ScheduledTaskExecution, occurrence.id, {
                status: Status.FAILED,
                completedAt: new Date(),
                lastError: 'schedule_changed_before_admission'
            })
            return
        }
        if (!start) return
        const conversation = await tx.findOneBy(ChatConversation, {
            id: occurrence.conversationId,
            tenantId: task.tenantId
        })
        const stream = await start(task, occurrence.conversationId, occurrence.executionId, conversation ?? undefined)
        await tx.update(ScheduledTaskExecution, occurrence.id, {
            status: Status.RUNNING,
            attempt: occurrence.attempt + 1,
            startedAt: new Date()
        })
        return stream
    })
}

// A rescheduled or deleted task disappears from the due-task scan. Recover its detached occurrence
// by the reserved execution ID, without starting work or modifying the replacement schedule.
export async function reconcileDetachedAutoTasks(repository: Repository<AutoTask>) {
    const detached: Pick<ScheduledTaskExecution, 'taskId' | 'tenantId' | 'scheduledAt' | 'occurrenceKey'>[] =
        await repository.query(`
        SELECT o."taskId", o."tenantId", o."scheduledAt", o."occurrenceKey" FROM xpert_task_execution o
        LEFT JOIN auto_task t ON t.id=o."taskId" AND t."tenantId"=o."tenantId"
            AND t.enabled AND t.frequency='once' AND t."nextRunAt"=o."scheduledAt"
        LEFT JOIN xpert_agent_execution e ON e.id=o."executionId" AND e."tenantId"=o."tenantId"
        WHERE o."taskSource"='auto_task' AND o.status IN ('pending','running') AND t.id IS NULL
            AND (e.id IS NULL OR e.status NOT IN ('pending','running'))
        ORDER BY o."scheduledAt",o.id LIMIT 64`)
    for (const row of detached) {
        await reconcileOccurrence(
            repository,
            { taskId: row.taskId, occurrenceKey: row.occurrenceKey, taskSource: 'auto_task' },
            { id: row.taskId, tenantId: row.tenantId, enabled: true, frequency: 'once', nextRunAt: row.scheduledAt }
        )
    }
}
