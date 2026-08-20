import { IXpertTask } from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { randomUUID } from 'node:crypto'
import { DeepPartial, Repository } from 'typeorm'
import { ScheduledTaskExecution, ScheduledTaskExecutionStatus } from './scheduled-task-execution.entity'

export const SCHEDULED_TASK_LEASE_MS = 5 * 60 * 1000

export interface ScheduledTaskExecutionStore {
    find(taskId: string, occurrenceKey: string): Promise<ScheduledTaskExecution | null>
    findExpired(now: Date, limit: number): Promise<ScheduledTaskExecution[]>
    insertIfAbsent(execution: DeepPartial<ScheduledTaskExecution>): Promise<void>
    claimExpired(
        id: string,
        ownerId: string,
        now: Date,
        leaseExpiresAt: Date,
        attempt: number
    ): Promise<boolean>
    updateOwned(
        id: string,
        ownerId: string,
        status: ScheduledTaskExecutionStatus,
        patch: DeepPartial<ScheduledTaskExecution>
    ): Promise<boolean>
}

export class TypeOrmScheduledTaskExecutionStore implements ScheduledTaskExecutionStore {
    constructor(private readonly repository: Repository<ScheduledTaskExecution>) {}

    find(taskId: string, occurrenceKey: string) {
        return this.repository.findOne({ where: { taskId, occurrenceKey } })
    }

    findExpired(now: Date, limit: number) {
        return this.repository
            .createQueryBuilder('execution')
            .where('execution.status IN (:...statuses)', {
                statuses: [ScheduledTaskExecutionStatus.PENDING, ScheduledTaskExecutionStatus.RUNNING]
            })
            .andWhere('execution.leaseExpiresAt <= :now', { now })
            .orderBy('execution.leaseExpiresAt', 'ASC')
            .take(limit)
            .getMany()
    }

    async insertIfAbsent(execution: DeepPartial<ScheduledTaskExecution>): Promise<void> {
        await this.repository
            .createQueryBuilder()
            .insert()
            .into(ScheduledTaskExecution)
            .values(execution)
            .orIgnore()
            .execute()
    }

    async claimExpired(id: string, ownerId: string, now: Date, leaseExpiresAt: Date, attempt: number) {
        const result = await this.repository
            .createQueryBuilder()
            .update(ScheduledTaskExecution)
            .set({
                ownerId,
                leaseExpiresAt,
                attempt,
                status: ScheduledTaskExecutionStatus.PENDING,
                lastError: null
            })
            .where('id = :id', { id })
            .andWhere('status IN (:...statuses)', {
                statuses: [ScheduledTaskExecutionStatus.PENDING, ScheduledTaskExecutionStatus.RUNNING]
            })
            .andWhere('(leaseExpiresAt IS NULL OR leaseExpiresAt <= :now)', { now })
            .execute()
        return result.affected === 1
    }

    async updateOwned(
        id: string,
        ownerId: string,
        status: ScheduledTaskExecutionStatus,
        patch: DeepPartial<ScheduledTaskExecution>
    ) {
        const result = await this.repository.update({ id, ownerId, status }, patch)
        return result.affected === 1
    }
}

export class ScheduledTaskExecutionCoordinator {
    readonly #ownerId: string

    constructor(
        private readonly store: ScheduledTaskExecutionStore,
        ownerId = (process.env.XPERT_INSTANCE_ID || process.env.HOSTNAME || randomUUID()).slice(0, 128)
    ) {
        this.#ownerId = ownerId
    }

    async claim(task: IXpertTask, occurrenceKey: string, scheduledAt: Date): Promise<ScheduledTaskExecution | null> {
        const now = new Date()
        const leaseExpiresAt = new Date(now.getTime() + SCHEDULED_TASK_LEASE_MS)
        let existing = await this.store.find(task.id, occurrenceKey)

        if (!existing) {
            await this.store.insertIfAbsent({
                taskId: task.id,
                occurrenceKey,
                scheduledAt,
                tenantId: task.tenantId,
                organizationId: task.organizationId,
                ownerId: this.#ownerId,
                leaseExpiresAt,
                attempt: 1,
                status: ScheduledTaskExecutionStatus.PENDING,
                conversationId: randomUUID(),
                executionId: randomUUID()
            })
            existing = await this.store.find(task.id, occurrenceKey)
            if (!existing) {
                throw new Error(`Unable to create scheduled execution for ${task.id}:${occurrenceKey}`)
            }
            if (existing.ownerId === this.#ownerId && existing.attempt === 1) {
                return existing
            }
        }

        if (
            existing.status === ScheduledTaskExecutionStatus.SUCCEEDED ||
            existing.status === ScheduledTaskExecutionStatus.FAILED
        ) {
            return null
        }
        if (existing.leaseExpiresAt && existing.leaseExpiresAt > now) {
            return null
        }

        const claimed = await this.store.claimExpired(
            existing.id,
            this.#ownerId,
            now,
            leaseExpiresAt,
            existing.attempt + 1
        )
        return claimed ? this.store.find(task.id, occurrenceKey) : null
    }

    findExpired(now = new Date(), limit = 20): Promise<ScheduledTaskExecution[]> {
        return this.store.findExpired(now, limit)
    }

    async markRunning(execution: ScheduledTaskExecution): Promise<void> {
        const updated = await this.store.updateOwned(
            execution.id,
            this.#ownerId,
            ScheduledTaskExecutionStatus.PENDING,
            {
                status: ScheduledTaskExecutionStatus.RUNNING,
                startedAt: execution.startedAt ?? new Date(),
                leaseExpiresAt: new Date(Date.now() + SCHEDULED_TASK_LEASE_MS)
            }
        )
        if (!updated) {
            throw new Error(`Scheduled execution lease was lost before starting: ${execution.id}`)
        }
    }

    async bindRun(execution: ScheduledTaskExecution, conversationId: string, executionId: string): Promise<void> {
        const updated = await this.store.updateOwned(
            execution.id,
            this.#ownerId,
            ScheduledTaskExecutionStatus.RUNNING,
            { conversationId, executionId }
        )
        if (!updated) {
            throw new Error(`Scheduled execution lease was lost before binding the chat run: ${execution.id}`)
        }
    }

    async refreshLease(execution: ScheduledTaskExecution): Promise<void> {
        const updated = await this.store.updateOwned(
            execution.id,
            this.#ownerId,
            ScheduledTaskExecutionStatus.RUNNING,
            { leaseExpiresAt: new Date(Date.now() + SCHEDULED_TASK_LEASE_MS) }
        )
        if (!updated) {
            throw new Error(`Scheduled execution lease was lost while running: ${execution.id}`)
        }
    }

    async finish(
        execution: ScheduledTaskExecution,
        status: ScheduledTaskExecutionStatus,
        error?: unknown
    ): Promise<void> {
        await this.store.updateOwned(
            execution.id,
            this.#ownerId,
            ScheduledTaskExecutionStatus.RUNNING,
            {
                status,
                leaseExpiresAt: null,
                completedAt: new Date(),
                lastError: error ? getErrorMessage(error) : null
            }
        )
    }
}
