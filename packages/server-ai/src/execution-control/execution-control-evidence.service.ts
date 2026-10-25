// A repeatable snapshot combines stable ownership with actual tool receipts, never cancel-request IDs.
// Evidence only reports the authorized task; it never grants execution or resume permission.
import { Injectable } from '@nestjs/common'
import { DataSource, In } from 'typeorm'
import { ExecutionControlEvidence, unknownExecutionControl } from '@xpert-ai/contracts'
import { TaskControlStore } from '@xpert-ai/server-core'
import { ExecutionControl } from './execution-control.entity'
import { validateExecutionControl } from './execution-control.store'

@Injectable()
export class ExecutionControlEvidenceService {
    constructor(
        private readonly database: DataSource,
        private readonly tasks: TaskControlStore
    ) {}

    /** Call only after domain authorization for the exact execution/thread. */
    async read(
        executionId: string,
        scope: { tenantId: string; organizationId?: string | null }
    ): Promise<ExecutionControlEvidence> {
        const subject = { kind: 'execution' as const, id: executionId }
        return this.database.transaction('REPEATABLE READ', async (manager): Promise<ExecutionControlEvidence> => {
            const task = await this.tasks.execution(executionId, manager)
            if (
                !task ||
                task.kind !== 'execution' ||
                !task.currentExecutionId ||
                !task.threadId ||
                task.tenantId !== scope.tenantId ||
                task.organizationId !== (scope.organizationId ?? null)
            )
                return unknownExecutionControl(subject, 'unregistered')
            const desired = await this.tasks.desired(task.id, manager)
            const local = await manager.findOneBy(ExecutionControl, { executionId: task.currentExecutionId })
            const family = await this.tasks.descendants(task.id, manager)
            if (
                family.some(
                    (item) =>
                        !item ||
                        item.tenantId !== scope.tenantId ||
                        item.organizationId !== (scope.organizationId ?? null) ||
                        item.rootId !== task.rootId
                )
            )
                return unknownExecutionControl(subject, 'unregistered')
            const executions = family.flatMap((target) =>
                target.kind === 'execution' && target.currentExecutionId ? [target.currentExecutionId] : []
            )
            const controls = executions.length
                ? await manager.findBy(ExecutionControl, { executionId: In(executions) })
                : []
            const roots = controls.length
                ? await manager.findBy(ExecutionControl, {
                      executionId: In([...new Set(controls.map((control) => control.rootExecutionId))])
                  })
                : []
            controls.forEach(validateExecutionControl)
            roots.forEach(validateExecutionControl)
            const completeLedger =
                controls.length === executions.length &&
                roots.length === new Set(controls.map((item) => item.rootExecutionId)).size
            if (
                !local ||
                !completeLedger ||
                [...controls, ...roots].some(
                    (item) => item.tenantId !== scope.tenantId || item.organizationId !== (scope.organizationId ?? null)
                )
            )
                return unknownExecutionControl(subject, 'unregistered')
            const toolsEnded = roots.every((root) =>
                root.work.every((work) => !executions.includes(work.executionId) || work.settled)
            )
            const graphEnded =
                local?.graphEnded &&
                local.tenantId === scope.tenantId &&
                local.organizationId === (scope.organizationId ?? null)
            const ended =
                graphEnded &&
                toolsEnded &&
                task.state === 'completed' &&
                family.every((target) => target.state === 'completed')
            const paused =
                graphEnded &&
                toolsEnded &&
                task.state === 'paused' &&
                (await this.tasks.settled(task.id, true, manager))
            return {
                version: 1,
                source: 'platform',
                subject,
                scope: 'owned_subtree',
                state: ended
                    ? 'settled'
                    : desired === 'terminated'
                      ? 'terminating'
                      : paused
                        ? 'paused'
                        : desired === 'paused'
                          ? 'pausing'
                          : 'running',
                desired,
                taskId: task.id,
                rootId: task.rootId,
                revision: task.revision,
                executionId: task.currentExecutionId,
                threadId: task.threadId,
                observedAt: new Date().toISOString()
            }
        })
    }
}
