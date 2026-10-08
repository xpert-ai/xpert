import { XpertAgentExecutionStatusEnum as Status } from '@xpert-ai/contracts'
import { In, type EntityManager } from 'typeorm'
import { XpertAgentExecution } from './agent-execution.entity'
import { XpertAgentExecutionService } from './agent-execution.service'
import { projectTaskRuntimeTiming } from '../xpert-project/services/project-task-runtime-timing'

function fixture(patch: Partial<XpertAgentExecution> = {}) {
    const record = Object.assign(new XpertAgentExecution(), {
        id: 'execution',
        tenantId: 'tenant',
        organizationId: 'org',
        status: Status.RUNNING,
        createdAt: new Date('2026-10-07T12:00:00Z'),
        completedAt: null,
        ...patch
    })
    const repository = {
        create: jest.fn((value: Partial<XpertAgentExecution>) => Object.assign(new XpertAgentExecution(), value)),
        findOne: jest.fn(async () => Object.assign(new XpertAgentExecution(), record)),
        save: jest.fn(async (value: XpertAgentExecution) => Object.assign(record, value)),
        update: jest.fn(async () => ({ affected: 1 }))
    }
    const manager = { findOne: repository.findOne, save: repository.save }
    let preceding: Promise<unknown> = Promise.resolve()
    const transaction = jest.fn((action: (manager: EntityManager) => Promise<unknown>) => {
        const next = preceding.then(() => action(manager as never))
        preceding = next.catch(() => undefined)
        return next
    })
    const service = new XpertAgentExecutionService({ ...repository, manager: { transaction } } as never)
    return { record, repository, service }
}

describe('execution completion persistence', () => {
    const ended = new Date('2026-10-07T12:10:00Z')
    beforeEach(() => {
        jest.useFakeTimers()
        jest.setSystemTime(ended)
    })
    afterEach(() => jest.useRealTimers())

    it.each([Status.SUCCESS, Status.ERROR, Status.TIMEOUT, Status.INTERRUPTED])(
        'records the first %s transition',
        async (status) => {
            const { service, record } = fixture()
            await service.update(record.id, { status, elapsedTime: 10, completedAt: new Date(0) })
            expect(record.completedAt).toEqual(ended)
            expect(record.elapsedTime).toBe(10)
        }
    )

    it('clears a paused end on resume and records the real later completion without using elapsedTime', async () => {
        const { service, record } = fixture()
        await service.update(record.id, { status: Status.INTERRUPTED, elapsedTime: 600000 })
        expect(record.completedAt).toEqual(ended)
        jest.setSystemTime(new Date('2026-10-07T14:00:00Z'))
        await service.update(record.id, { status: Status.RUNNING, completedAt: ended })
        expect(record.completedAt).toBeNull()
        jest.setSystemTime(new Date('2026-10-07T14:05:00Z'))
        await service.update(record.id, { status: Status.SUCCESS, elapsedTime: 300000, completedAt: null })
        expect(record.completedAt).toEqual(new Date('2026-10-07T14:05:00Z'))
        expect(projectTaskRuntimeTiming(record).runtimeCompletedAt).toBe('2026-10-07T14:05:00.000Z')
    })

    it('preserves the first end through stale finalization, metadata changes and repeated cancellation', async () => {
        const { service, record } = fixture()
        await service.update(record.id, { status: Status.INTERRUPTED })
        jest.setSystemTime(new Date('2026-10-08T00:00:00Z'))
        await service.update(record.id, { status: Status.INTERRUPTED, completedAt: null, outputs: { output: 'late' } })
        await service.update(record.id, { title: 'Updated title', completedAt: new Date(0) })
        expect(record.completedAt).toEqual(ended)
    })

    it('does not fabricate an end for a legacy stopped execution or an active metadata update', async () => {
        const { service, record } = fixture({ status: Status.SUCCESS })
        await service.update(record.id, { status: Status.SUCCESS, elapsedTime: 600000 })
        expect(record.completedAt).toBeNull()
        await service.update(record.id, { status: Status.PENDING, completedAt: ended })
        await service.update(record.id, { title: 'Metadata', completedAt: ended })
        expect(record.completedAt).toBeNull()
    })

    it('serializes a metadata update that initially read the running record with terminal finalization', async () => {
        const { service, record, repository } = fixture()
        await Promise.all([
            service.update(record.id, { status: Status.SUCCESS }),
            service.update(record.id, { title: 'Concurrent metadata', completedAt: null })
        ])
        expect(record.status).toBe(Status.SUCCESS)
        expect(record.completedAt).toEqual(ended)
        expect(record.title).toBe('Concurrent metadata')
        expect(repository.findOne).toHaveBeenCalledWith(XpertAgentExecution, {
            where: { id: 'execution', tenantId: 'tenant', organizationId: 'org' },
            lock: { mode: 'pessimistic_write' }
        })
    })

    it.each([Status.RUNNING, Status.SUCCESS])('initializes a newly created %s execution', async (status) => {
        const { service } = fixture()
        const record = await service.create({ status, completedAt: new Date(0) })
        expect(record.completedAt).toEqual(status === Status.SUCCESS ? ended : null)
    })

    it('leaves creation audit timestamps to TypeORM even when the caller supplies an old snapshot', async () => {
        const { service, repository } = fixture()
        await service.create({ status: Status.RUNNING, createdAt: new Date(0), updatedAt: new Date(0) })
        const [created] = repository.create.mock.calls[0]
        expect(created).not.toHaveProperty('createdAt')
        expect(created).not.toHaveProperty('updatedAt')
    })

    it('records bulk interruption time only for still-running authorized executions', async () => {
        const { service, repository } = fixture()
        await service.interruptRunning(['execution'], 'thread', 'Cancelled')
        expect(repository.update).toHaveBeenCalledWith(
            { id: In(['execution']), threadId: 'thread', status: Status.RUNNING },
            { status: Status.INTERRUPTED, error: 'Cancelled', completedAt: ended }
        )
    })
})
