import { IXpertTask } from '@xpert-ai/contracts'
import { DeepPartial } from 'typeorm'
import { ScheduledTaskExecution, ScheduledTaskExecutionStatus } from './scheduled-task-execution.entity'
import {
    SCHEDULED_TASK_LEASE_MS,
    ScheduledTaskExecutionCoordinator,
    ScheduledTaskExecutionStore
} from './scheduled-task-execution.coordinator'

class MemoryScheduledTaskExecutionStore implements ScheduledTaskExecutionStore {
    readonly records = new Map<string, ScheduledTaskExecution>()

    async find(taskId: string, occurrenceKey: string) {
        return this.records.get(`${taskId}:${occurrenceKey}`) ?? null
    }

    async findExpired(now: Date, limit: number) {
        return [...this.records.values()]
            .filter(
                (record) =>
                    (record.status === ScheduledTaskExecutionStatus.PENDING ||
                        record.status === ScheduledTaskExecutionStatus.RUNNING) &&
                    !!record.leaseExpiresAt &&
                    record.leaseExpiresAt <= now
            )
            .slice(0, limit)
    }

    async insertIfAbsent(execution: DeepPartial<ScheduledTaskExecution>) {
        const key = `${execution.taskId}:${execution.occurrenceKey}`
        if (this.records.has(key)) return
        this.records.set(key, {
            ...execution,
            id: `execution-${this.records.size + 1}`
        } as ScheduledTaskExecution)
    }

    async claimExpired(
        id: string,
        ownerId: string,
        _now: Date,
        leaseExpiresAt: Date,
        attempt: number
    ) {
        const record = [...this.records.values()].find((item) => item.id === id)
        if (!record || !record.leaseExpiresAt || record.leaseExpiresAt > _now) return false
        record.ownerId = ownerId
        record.leaseExpiresAt = leaseExpiresAt
        record.attempt = attempt
        record.status = ScheduledTaskExecutionStatus.PENDING
        record.lastError = null
        return true
    }

    async updateOwned(
        id: string,
        ownerId: string,
        status: ScheduledTaskExecutionStatus,
        patch: DeepPartial<ScheduledTaskExecution>
    ) {
        const record = [...this.records.values()].find((item) => item.id === id)
        if (!record || record.ownerId !== ownerId || record.status !== status) return false
        Object.assign(record, patch)
        return true
    }
}

const task = {
    id: 'task-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1'
} as IXpertTask
const scheduledAt = new Date('2026-08-19T01:50:00.000Z')

describe('ScheduledTaskExecutionCoordinator', () => {
    it('allows one owner and rejects a concurrent second claim', async () => {
        const store = new MemoryScheduledTaskExecutionStore()
        const first = new ScheduledTaskExecutionCoordinator(store, 'api-1')
        const second = new ScheduledTaskExecutionCoordinator(store, 'api-2')

        const firstClaim = await first.claim(task, 'xpert-task:task-1:2026-08-19T01:50', scheduledAt)
        const secondClaim = await second.claim(task, 'xpert-task:task-1:2026-08-19T01:50', scheduledAt)

        expect(firstClaim?.ownerId).toBe('api-1')
        expect(firstClaim?.conversationId).toEqual(expect.any(String))
        expect(firstClaim?.executionId).toEqual(expect.any(String))
        expect(secondClaim).toBeNull()
    })

    it('takes over an expired running lease and records the next attempt', async () => {
        const store = new MemoryScheduledTaskExecutionStore()
        const first = new ScheduledTaskExecutionCoordinator(store, 'api-1')
        const second = new ScheduledTaskExecutionCoordinator(store, 'api-2')
        const occurrenceKey = 'xpert-task:task-1:2026-08-19T01:50'
        const claim = await first.claim(task, occurrenceKey, scheduledAt)

        await first.markRunning(claim as ScheduledTaskExecution)
        const record = store.records.get(`${task.id}:${occurrenceKey}`) as ScheduledTaskExecution
        record.leaseExpiresAt = new Date(Date.now() - 1)

        const takeover = await second.claim(task, occurrenceKey, scheduledAt)

        expect(takeover?.ownerId).toBe('api-2')
        expect(takeover?.attempt).toBe(2)
        expect(takeover?.status).toBe(ScheduledTaskExecutionStatus.PENDING)
        expect(takeover?.leaseExpiresAt?.getTime()).toBeGreaterThan(Date.now() + SCHEDULED_TASK_LEASE_MS - 1000)
    })

    it('does not claim a completed occurrence again', async () => {
        const store = new MemoryScheduledTaskExecutionStore()
        const first = new ScheduledTaskExecutionCoordinator(store, 'api-1')
        const second = new ScheduledTaskExecutionCoordinator(store, 'api-2')
        const occurrenceKey = 'xpert-task:task-1:2026-08-19T01:50'
        const claim = await first.claim(task, occurrenceKey, scheduledAt)
        await first.markRunning(claim as ScheduledTaskExecution)
        await first.finish(claim as ScheduledTaskExecution, ScheduledTaskExecutionStatus.SUCCEEDED)

        await expect(second.claim(task, occurrenceKey, scheduledAt)).resolves.toBeNull()
    })
})
