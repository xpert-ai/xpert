// Invariants: root lock precedes task lock. Claims do not expire into replay.
// The actual handler and attached descendants must settle before protocol terminal status.
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, LessThanOrEqual, Repository } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { ExecutionTaskControl, TaskControlRejected, TaskControlStore } from '@xpert-ai/server-core'
import type { McpOperationIdentity, McpExecutionReceipt } from '@xpert-ai/contracts'
import { McpTask } from '../entities/mcp-task.entity'
import { controlledMcpTask } from './mcp-task-control.record'
import { invalidTaskParams } from '../mcp-task.helpers'

@Injectable()
export class McpTaskControlStore {
    readonly hostId = randomUUID()
    constructor(
        @InjectRepository(McpTask) private readonly tasks: Repository<McpTask>,
        readonly controls: TaskControlStore
    ) {}

    async reserve(seed: McpTask, operation?: McpOperationIdentity, terminate = false) {
        return this.tasks.manager.transaction(async (tx) => {
            await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
                JSON.stringify([seed.publicationId, seed.idempotencyKey])
            ])
            const previous = await tx
                .getRepository(McpTask)
                .createQueryBuilder('task')
                .where('task.publicationId = :publicationId AND task.idempotencyKey = :key', {
                    publicationId: seed.publicationId,
                    key: seed.idempotencyKey
                })
                .getOne()
            if (previous) {
                if (
                    previous.inputHash !== seed.inputHash ||
                    previous.subjectType !== seed.subjectType ||
                    previous.subjectId !== seed.subjectId ||
                    previous.tenantId !== seed.tenantId ||
                    (previous.organizationId ?? null) !== (seed.organizationId ?? null) ||
                    (operation &&
                        (previous.control?.operation?.operationId !== operation.operationId ||
                            previous.control.generation !== operation.generation))
                )
                    throw invalidTaskParams()
                return { task: previous, owner: false }
            }
            const target = await this.controls.register(
                {
                    tenantId: seed.tenantId,
                    organizationId: seed.organizationId,
                    kind: 'mcp-publication',
                    resourceId: seed.taskId
                },
                tx
            )
            seed.control = {
                version: 1,
                targetId: target.id,
                generation: operation?.generation ?? randomUUID(),
                hostId: null,
                claim: null,
                phase: 'queued',
                handlerExited: false,
                published: false,
                ...(operation ? { operation } : {})
            }
            seed.nextControlAt = new Date()
            if (terminate) await this.controls.change(target.id, 'terminated', tx)
            return { task: await tx.save(seed), owner: true }
        })
    }

    read(id: string, tx = this.tasks.manager) {
        return tx
            .getRepository(McpTask)
            .createQueryBuilder('task')
            .addSelect([
                'task.inputRequests',
                'task.inputResponses',
                'task.requestPayload',
                'task.resultRef',
                'task.error'
            ])
            .where('task.taskId = :id', { id })
            .getOne()
    }

    async byKey(publicationId: string, key: string) {
        const found = await this.tasks
            .createQueryBuilder('task')
            .where('task.publicationId = :publicationId AND task.idempotencyKey = :key', { publicationId, key })
            .getOne()
        return found ? this.read(found.taskId) : null
    }

    async update(id: string, generation: string, change: (task: McpTask, tx: EntityManager) => Promise<void> | void) {
        return this.tasks.manager.transaction(async (tx) => {
            const found = await this.read(id, tx)
            if (!found) throw invalidTaskParams()
            controlledMcpTask(found)
            const target = await this.controls.read(found.control.targetId, tx)
            if (!target) throw new TaskControlRejected('missing')
            await tx.findOneOrFail(ExecutionTaskControl, {
                where: { id: target.rootId },
                lock: { mode: 'pessimistic_write' }
            })
            const task = await tx
                .getRepository(McpTask)
                .createQueryBuilder('task')
                .addSelect([
                    'task.inputRequests',
                    'task.inputResponses',
                    'task.requestPayload',
                    'task.resultRef',
                    'task.error'
                ])
                .where('task.taskId = :id', { id })
                .setLock('pessimistic_write')
                .getOneOrFail()
            controlledMcpTask(task)
            if (task.control.generation !== generation) throw invalidTaskParams()
            await change(task, tx)
            return tx.save(task)
        })
    }

    async claim(task: McpTask) {
        return this.update(task.taskId, task.control.generation, async (current, tx) => {
            if (current.control.phase !== 'queued') throw new TaskControlRejected('claimed')
            current.control.claim = await this.controls.claim(current.control.targetId, tx)
            current.control.phase = 'running'
            current.control.hostId = this.hostId
        })
    }

    async terminate(task: McpTask) {
        return this.update(task.taskId, task.control.generation, async (current, tx) => {
            await this.controls.change(current.control.targetId, 'terminated', tx)
            current.nextControlAt = new Date()
        })
    }

    async finalize(task: McpTask) {
        return this.update(task.taskId, task.control.generation, async (current, tx) => {
            const c = current.control
            if (c.phase === 'settled') return
            const intent = await this.controls.desired(c.targetId, tx)
            if (c.phase === 'queued' && intent === 'terminated') c.handlerExited = true
            if (!c.handlerExited || !(await this.controls.settled(c.targetId, false, tx))) return
            c.phase = 'settled'
            current.status = intent === 'terminated' ? 'cancelled' : (c.outcome ?? 'failed')
            current.inputRequests = null
            current.statusMessage = null
            current.nextControlAt = null
            await this.controls.receipt(c.targetId, 'completed', c.claim ?? undefined, tx)
        })
    }

    async evidence(task: McpTask): Promise<McpExecutionReceipt | undefined> {
        if (!task.control?.operation) return undefined
        controlledMcpTask(task)
        const target = await this.controls.read(task.control.targetId)
        return {
            version: 1,
            serverId: task.publicationId,
            operationId: task.control.operation.operationId,
            generation: task.control.generation,
            taskId: task.taskId,
            state: task.control.phase === 'settled' ? 'settled' : 'pending',
            intent: await this.controls.desired(task.control.targetId),
            revision: target.revision,
            handlerExited: task.control.handlerExited,
            descendantsSettled: await this.controls.settled(task.control.targetId, false)
        }
    }

    due() {
        return this.tasks
            .createQueryBuilder('task')
            .where('task.nextControlAt <= :now', { now: new Date() })
            .orderBy('task.nextControlAt', 'ASC')
            .addOrderBy('task.taskId', 'ASC')
            .take(50)
            .getMany()
    }
}
