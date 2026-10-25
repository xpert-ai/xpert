// A durable send reservation is single-use. Losing a reply never authorizes another tools/call.
// All settlement and input admission use the same root lock as termination.
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { EntityManager, LessThanOrEqual, Repository } from 'typeorm'
import { ExecutionTaskControl, TaskControlStore, TaskControlRejected } from '@xpert-ai/server-core'
import type { TaskControlPolicy } from '@xpert-ai/plugin-sdk'
import { McpRemoteOperation } from './mcp-operation.entity'
import type { McpOperationRecord } from '@xpert-ai/contracts'
import { readMcpOperation } from './mcp-operation.schema'

@Injectable()
export class McpOperationStore {
    readonly hostId = randomUUID()
    constructor(
        @InjectRepository(McpRemoteOperation) private readonly operations: Repository<McpRemoteOperation>,
        readonly controls: TaskControlStore
    ) {}

    async reserve(key: string, record: McpOperationRecord, policy: TaskControlPolicy = 'attached') {
        if (!record.scope.actor.tenantId) throw new TaskControlRejected('scope')
        const parent = await this.controls.producer()
        return this.operations.manager.transaction(async (tx) => {
            await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
                JSON.stringify([record.scope.actor.tenantId, key])
            ])
            const old = await tx.findOneBy(McpRemoteOperation, {
                tenantId: record.scope.actor.tenantId,
                operationKey: key
            })
            if (old) {
                readMcpOperation(old)
                if (
                    old.record.identity.inputHash !== record.identity.inputHash ||
                    old.record.identity.toolName !== record.identity.toolName ||
                    old.record.connectionVersion !== record.connectionVersion ||
                    JSON.stringify(old.record.scope) !== JSON.stringify(record.scope) ||
                    old.record.mode !== record.mode
                )
                    throw new TaskControlRejected('scope')
                return { operation: old, owner: false }
            }
            const parentTask = parent ? await this.controls.read(parent.targetId, tx) : null
            const target = await this.controls.register(
                {
                    tenantId: record.scope.actor.tenantId,
                    organizationId: record.scope.actor.organizationId,
                    kind: 'mcp-operation',
                    resourceId: record.identity.operationId,
                    parent,
                    policy,
                    drainOnPause: policy === 'attached' && parentTask?.state === 'running'
                },
                tx
            )
            record.claim = await this.controls.claim(target.id, tx)
            record.hostId = this.hostId
            const operation = this.operations.create({
                id: record.identity.operationId,
                tenantId: record.scope.actor.tenantId,
                organizationId: record.scope.actor.organizationId,
                operationKey: key,
                targetId: target.id,
                generation: record.identity.generation,
                record,
                nextControlAt: new Date()
            })
            return { operation: await tx.save(operation), owner: true }
        })
    }
    async read(id: string) {
        const row = await this.operations.findOneBy({ id })
        return row ? readMcpOperation(row) : null
    }
    async update(
        id: string,
        generation: string,
        change: (row: McpRemoteOperation, tx: EntityManager) => Promise<void> | void
    ) {
        return this.operations.manager.transaction(async (tx) => {
            const found = await tx.findOneByOrFail(McpRemoteOperation, { id })
            const target = await this.controls.read(found.targetId, tx)
            if (!target) throw new TaskControlRejected('missing')
            await tx.findOneOrFail(ExecutionTaskControl, {
                where: { id: target.rootId },
                lock: { mode: 'pessimistic_write' }
            })
            const row = readMcpOperation(
                await tx.findOneOrFail(McpRemoteOperation, { where: { id }, lock: { mode: 'pessimistic_write' } })
            )
            if (row.generation !== generation) throw new TaskControlRejected('scope')
            const settled = row.record.phase === 'settled'
            await change(row, tx)
            if (settled) {
                row.record.phase = 'settled'
                row.nextControlAt = null
            }
            return tx.save(row)
        })
    }
    async admit(row: McpRemoteOperation) {
        return this.update(row.id, row.generation, async (value, tx) => {
            if (value.record.phase !== 'reserved' || value.record.hostId !== this.hostId)
                throw new TaskControlRejected('claimed')
            if ((await this.controls.desired(value.targetId, tx)) === 'terminated')
                throw new TaskControlRejected('terminated')
            value.record.phase = 'sending'
        })
    }
    async finalize(row: McpRemoteOperation) {
        return this.update(row.id, row.generation, async (value, tx) => {
            if (value.record.phase === 'settled') return
            const receipt = value.record.receipt
            const intent = await this.controls.desired(value.targetId, tx)
            const notSent = value.record.phase === 'reserved' && intent === 'terminated'
            const returned = value.record.callReturned === true
            const remoteSettled = receipt?.state === 'settled' && receipt.handlerExited && receipt.descendantsSettled
            if (!notSent && (!value.record.hostExited || (!returned && !remoteSettled))) return
            // Settlement proves work exited; a running waiter also needs its final
            // result. Keep polling inconsistent/older servers without resending tools.
            if (
                value.record.mode === 'task' &&
                !returned &&
                intent !== 'terminated' &&
                !['completed', 'failed', 'cancelled'].includes(value.record.task?.status ?? '')
            )
                return
            if (!(await this.controls.settled(value.targetId, false, tx))) return
            value.record.phase = 'settled'
            value.nextControlAt = null
            await this.controls.receipt(value.targetId, 'completed', value.record.claim, tx)
        })
    }
    due() {
        return this.operations.find({
            where: { nextControlAt: LessThanOrEqual(new Date()) },
            order: { nextControlAt: 'ASC', id: 'ASC' },
            take: 50
        })
    }
}
