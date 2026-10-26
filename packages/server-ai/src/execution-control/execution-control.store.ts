// Invariants: the root row serializes child registration, control and tool admission.
// Termination is a tombstone; notices are hints, never the source of truth.
// A wrapper ending does not settle its tools. Only tool completion receipts drain work.
import { z } from 'zod'
import { Injectable } from '@nestjs/common'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { readRunLease } from '../chat-conversation/thread-run-lease'
import { TExecutionControlIntent, TExecutionOwnership } from '@xpert-ai/contracts'
import { DataSource, EntityManager, In, IsNull } from 'typeorm'
import { ExecutionCancelledError } from './execution-cancelled.error'
import { ExecutionControl } from './execution-control.entity'
import { TaskControlStore, currentTaskControl } from '@xpert-ai/server-core'

export type ExecutionControlScope = { tenantId?: string; organizationId?: string | null; threadId: string }

@Injectable()
export class ExecutionControlStore {
    constructor(
        private readonly database: DataSource,
        readonly tasks: TaskControlStore
    ) {}

    async root(manager: EntityManager, scope: ExecutionControlScope, executionId: string) {
        // The shared base permits tenant-less entities; execution control always requires a tenant.
        if (!scope.tenantId) this.reject(executionId)
        await manager
            .createQueryBuilder()
            .insert()
            .into(ExecutionControl)
            .values({
                tenantId: scope.tenantId,
                organizationId: scope.organizationId ?? null,
                threadId: scope.threadId,
                executionId,
                rootExecutionId: executionId,
                ownership: { policy: 'attached', rootExecutionId: executionId },
                ancestors: [executionId],
                desired: 'running',
                revision: 1,
                graphEnded: false,
                work: []
            })
            .orIgnore()
            .execute()
        const record = await manager.findOneOrFail(ExecutionControl, {
            where: { executionId },
            lock: { mode: 'pessimistic_write' }
        })
        if (
            record.tenantId !== scope.tenantId ||
            record.organizationId !== (scope.organizationId ?? null) ||
            record.threadId !== scope.threadId ||
            record.desired === 'terminated'
        )
            this.reject(executionId)
        validateExecutionControl(record)
        const task = await this.tasks.execution(executionId, manager)
        if (task) {
            if (
                task.tenantId !== scope.tenantId ||
                task.organizationId !== (scope.organizationId ?? null) ||
                task.threadId !== scope.threadId ||
                task.currentExecutionId !== executionId ||
                (await this.tasks.desired(task.id, manager)) === 'terminated'
            )
                this.reject(executionId)
        } else {
            await this.tasks.register(
                {
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId,
                    kind: 'execution',
                    resourceId: executionId,
                    executionId,
                    threadId: scope.threadId
                },
                manager
            )
        }
        const activeTask = await this.tasks.execution(executionId, manager)
        if (activeTask.state === 'queued' || activeTask.state === 'paused')
            await this.tasks.receipt(activeTask.id, 'running', undefined, manager)
        return record
    }

    /** The caller has already authorized the exact thread and holds its writer lock. */
    async intent(
        manager: EntityManager,
        executionId: string,
        desired: TExecutionControlIntent,
        updateTask = true,
        reopenInput = false
    ) {
        const record = await this.lock(manager, executionId)
        const task = updateTask ? await this.tasks.execution(executionId, manager) : null
        if (task) await this.tasks.change(task.id, desired, manager)
        if (!record) return // Legacy rows are fenced by the thread until registered by the host.
        if (record.target.desired === 'terminated') {
            if (desired !== 'terminated') this.reject(executionId)
            return
        }
        if (record.target.desired !== desired || ((desired === 'running' || reopenInput) && record.target.graphEnded)) {
            record.target.desired = desired
            record.target.revision++
            if (desired === 'running' || reopenInput) record.target.graphEnded = false
            await manager.save(record.target)
        }
    }

    /** Only explicit backend policy creates a lifecycle boundary. */
    async attach(executionId: string, parentExecutionId: string, policy: TExecutionOwnership['policy']) {
        await this.database.transaction(async (manager) => {
            const parent = await this.lock(manager, parentExecutionId)
            if (!parent) this.reject(parentExecutionId)
            await this.assertLive(manager, parent.target)
            const independent = policy !== 'attached'
            const rootExecutionId = independent ? executionId : parent.root.executionId
            const ownership: TExecutionOwnership = { policy, parentExecutionId, rootExecutionId }
            await manager
                .createQueryBuilder()
                .insert()
                .into(ExecutionControl)
                .values({
                    executionId,
                    tenantId: parent.target.tenantId,
                    organizationId: parent.target.organizationId,
                    threadId: parent.target.threadId,
                    rootExecutionId,
                    ownership,
                    ancestors: independent ? [executionId] : [...parent.target.ancestors, executionId],
                    desired: 'running',
                    revision: 1,
                    graphEnded: false,
                    work: []
                })
                .orIgnore()
                .execute()
            const child = await manager.findOneOrFail(ExecutionControl, { where: { executionId } })
            if (
                child.ownership.parentExecutionId !== parentExecutionId ||
                child.ownership.policy !== policy ||
                child.rootExecutionId !== rootExecutionId
            )
                this.reject(executionId)
            validateExecutionControl(child)
            await this.assertLive(manager, child)
            const owner = await this.tasks.execution(parentExecutionId, manager)
            if (!owner) this.reject(parentExecutionId)
            const context = currentTaskControl()
            const invocation = context ? await this.tasks.read(context.targetId, manager) : null
            const logicalParent =
                invocation?.kind === 'invocation' && invocation.rootId === owner.rootId ? invocation : owner
            await this.tasks.register(
                {
                    tenantId: child.tenantId,
                    organizationId: child.organizationId,
                    kind: 'execution',
                    resourceId: executionId,
                    executionId,
                    threadId: child.threadId,
                    parent: { version: 2, targetId: logicalParent.id },
                    policy,
                    drainOnPause: true
                },
                manager
            )
        })
    }

    async terminate(executionIds: string[]) {
        // Stable ordering makes overlapping multi-target requests converge without opposite lock order.
        for (const executionId of [...new Set(executionIds)].sort()) {
            await this.database.transaction((manager) => this.intent(manager, executionId, 'terminated'))
        }
    }

    async has(executionId: string) {
        return this.database.getRepository(ExecutionControl).existsBy({ executionId })
    }

    async isTerminated(executionId: string) {
        const target = await this.database.getRepository(ExecutionControl).findOneBy({ executionId })
        if (!target) return false
        validateExecutionControl(target)
        return this.database.getRepository(ExecutionControl).existsBy({
            executionId: In(target.ancestors),
            desired: 'terminated'
        })
    }

    async shouldAbort(executionId: string) {
        const task = await this.tasks.execution(executionId)
        if (task && (task.currentExecutionId !== executionId || (await this.tasks.desired(task.id)) === 'terminated'))
            return true
        const target = await this.database.getRepository(ExecutionControl).findOneBy({ executionId })
        if (!target) return false
        validateExecutionControl(target)
        return this.database.getRepository(ExecutionControl).exists({
            where: [
                { executionId: In(target.ancestors), desired: 'terminated' },
                { executionId: In(target.ancestors), graphEnded: true }
            ]
        })
    }

    async admit(executionId: string, workId: string, expectedRoot?: string) {
        await this.database.transaction(async (manager) => {
            const record = await this.lock(manager, executionId)
            if (!record) this.reject(executionId)
            if (expectedRoot && record.root.executionId !== expectedRoot) this.reject(executionId)
            await this.assertLive(manager, record.target)
            if (record.root.work.some((work) => work.id === workId)) this.reject(executionId)
            record.root.work.push({ id: workId, executionId, settled: false })
            await manager.save(record.root)
        })
    }

    async settle(executionId: string, workId: string) {
        await this.database.transaction(async (manager) => {
            const record = await this.lock(manager, executionId)
            if (!record) return
            const work = record.root.work.find((work) => work.id === workId && work.executionId === executionId)
            if (work && !work.settled) {
                work.settled = true
                await manager.save(record.root)
            }
        })
    }

    async end(manager: EntityManager, executionId: string): Promise<boolean> {
        const record = await this.lock(manager, executionId)
        if (!record) return true
        record.target.graphEnded = true
        await manager.save(record.target)
        return this.drained(record.root)
    }

    async drainedExecution(manager: EntityManager, executionId: string) {
        const record = await this.lock(manager, executionId)
        return !record || (record.target.graphEnded && this.drained(record.root))
    }

    private drained(root: ExecutionControl) {
        return root.work.every((work) => work.settled)
    }

    private async lock(manager: EntityManager, executionId: string) {
        const target = await manager.findOne(ExecutionControl, { where: { executionId } })
        if (!target) return null
        validateExecutionControl(target)
        const root = await manager.findOneOrFail(ExecutionControl, {
            where: { executionId: target.rootExecutionId },
            lock: { mode: 'pessimistic_write' }
        })
        validateExecutionControl(root)
        return {
            root,
            target:
                executionId === root.executionId
                    ? root
                    : await manager.findOneOrFail(ExecutionControl, { where: { executionId } })
        }
    }

    // A pause drains the current node, including its admitted tool group. Graph guards stop subsequent nodes.
    private async assertLive(manager: EntityManager, target: ExecutionControl) {
        const task = await this.tasks.execution(target.executionId, manager)
        if (
            task &&
            (task.currentExecutionId !== target.executionId ||
                (await this.tasks.desired(task.id, manager)) === 'terminated')
        )
            this.reject(target.executionId)
        const ancestors = await manager.find(ExecutionControl, { where: { executionId: In(target.ancestors) } })
        const root = ancestors.find((record) => record.executionId === target.rootExecutionId)
        if (root?.ownership.policy === 'attached') {
            const thread = await manager.findOne(ChatConversationThread, {
                where: {
                    threadId: root.threadId,
                    tenantId: root.tenantId,
                    organizationId: root.organizationId ?? IsNull()
                }
            })
            const lease = readRunLease(thread?.metadata)
            if (
                thread?.runControl?.executionId !== root.executionId ||
                !['running', 'pausing'].includes(thread.runControl.state) ||
                (lease && Date.parse(lease.expiresAt) <= Date.now())
            )
                this.reject(target.executionId)
        }

        if (
            ancestors.length !== target.ancestors.length ||
            ancestors.some((record) => record.desired === 'terminated' || record.graphEnded)
        )
            this.reject(target.executionId)
    }

    private reject(executionId: string): never {
        throw new ExecutionCancelledError(executionId, 'Execution ownership ended')
    }
}

export function validateExecutionControl(record: ExecutionControl) {
    const parsed = z
        .object({
            ownership: z.object({
                policy: z.enum(['attached', 'detached', 'shared']),
                parentExecutionId: z.string().min(1).optional(),
                rootExecutionId: z.string().min(1)
            }),
            ancestors: z.array(z.string().min(1)).nonempty(),
            work: z.array(z.object({ id: z.string().min(1), executionId: z.string().min(1), settled: z.boolean() }))
        })
        .safeParse(record)
    if (
        !parsed.success ||
        record.ownership.rootExecutionId !== record.rootExecutionId ||
        record.ancestors[0] !== record.rootExecutionId ||
        record.ancestors[record.ancestors.length - 1] !== record.executionId ||
        new Set(record.ancestors).size !== record.ancestors.length
    )
        throw new ExecutionCancelledError(record.executionId, 'Execution ownership ended')
}
