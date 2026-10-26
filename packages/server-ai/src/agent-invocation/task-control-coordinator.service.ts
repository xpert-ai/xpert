// Delivery leases coordinate replicas, but never grant permission to replay business work.
// Native checkpoints and handler receipts prove local boundaries; remote unknown remains unknown.
import { invocationCanRelease } from './invocation-control-evidence'
import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { ExecutionTaskControl, TaskControlStore } from '@xpert-ai/server-core'
import { DefaultRuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { AgentInvocationEntity } from './invocation.entity'
import { AgentInvocationRuntime } from './invocation-runtime'
import { AgentInvocationFactoryService } from './invocation-factory.service'
import { RuntimeMessageAccessService } from '../handoff/runtime-messaging/runtime-message-access.service'
import { AssistantTaskExecution } from './assistant-task-execution'
import { ControlAssistantTaskCommand } from '../xpert-agent-execution/runtime/control-assistant-task.command'
import { ControlOwnedExecutionCommand } from '../chat-conversation/commands/control-owned-execution.command'

@Injectable()
export class TaskControlCoordinator {
    private scanning = false
    private readonly logger = new Logger(TaskControlCoordinator.name)
    constructor(
        private readonly tasks: TaskControlStore,
        private readonly database: DataSource,
        private readonly runtime: AgentInvocationRuntime,
        private readonly factory: AgentInvocationFactoryService,
        private readonly access: RuntimeMessageAccessService,
        private readonly commands: CommandBus
    ) {}

    @Interval(1000)
    async reconcile() {
        if (this.scanning) return
        this.scanning = true
        try {
            await this.runtime.reconcileOwned((scope, work) => this.access.withControlActor(scope, work))
            for (const task of await this.tasks.due(['invocation', 'execution', 'handoff', 'managed-queue']))
                await this.deliver(task)
        } catch {
            this.logger.warn('Task control scan deferred')
        } finally {
            this.scanning = false
        }
    }

    async deliver(task: ExecutionTaskControl) {
        const token = await this.tasks.delivery(task.id)
        if (!token) return
        try {
            const desired = await this.tasks.desired(task.id)
            if (desired === 'terminated' && (await this.tasks.settleUnstarted(task.id))) {
                // Atomic admission check proves no handler started; a stale scan cannot settle claimed work.
            } else if (task.kind === 'invocation') {
                await this.invocation(task, desired)
            } else if (task.kind === 'execution' && task.parentId && !task.drainOnPause) {
                const ancestor = await this.invocationAncestor(task)
                if (ancestor)
                    await this.access.withControlActor(ancestor.invocation.scope, () =>
                        this.commands.execute(new ControlOwnedExecutionCommand(task.id))
                    )
            } else if (task.kind === 'handoff') {
                const children = (await this.tasks.descendants(task.id)).filter(
                    (child) => child.parentId === task.id && child.kind === 'managed-queue'
                )
                if (children.length && children.every((child) => child.state === 'completed'))
                    await this.tasks.receipt(task.id, 'completed')
            }
            await this.tasks.delivered(task.id, token, null)
        } catch {
            await this.tasks.delivered(task.id, token, 'control_unconfirmed', 5000)
        }
    }

    private async invocation(task: ExecutionTaskControl, desired: string) {
        const record = await this.database
            .getRepository(AgentInvocationEntity)
            .findOneBy({ id: task.resourceId, tenantId: task.tenantId, organizationId: task.organizationId })
        if (!record) throw new Error('Invocation receipt unavailable')
        const children = (await this.tasks.descendants(task.id)).filter(
            (child) => child.parentId === task.id && child.kind === 'execution'
        )
        if (record.invocation.controlAdapter === 'native-graph') {
            // Inline graphs are drained by their actual host call and phase-1 tool receipts.
            // A suspended call has exited; termination can discard its checkpoint without starting it again.
            if (desired === 'terminated' && task.state === 'paused') await this.tasks.receipt(task.id, 'completed')
            return
        }
        if (desired === 'paused' && children.length && (await this.tasks.settled(task.id, true))) {
            await this.tasks.receipt(task.id, 'paused')
            return
        }
        await this.access.withControlActor(record.invocation.scope, async () => {
            const native =
                record.invocation.controlAdapter === 'native-assistant-task' && children.length === 1
                    ? children[0]
                    : null
            const api = native
                ? this.runtime.scoped({
                      scope: record.invocation.scope,
                      authorize: async () => {
                          await this.commands.execute(new ControlAssistantTaskCommand(native.attempts[0], 'inspect'))
                      },
                      capabilities: new DefaultRuntimeCapabilityRegistry().register(AssistantTaskExecution, {
                          start: async () => {
                              throw new Error('Control delivery cannot start a task')
                          },
                          inspect: () =>
                              this.commands.execute(new ControlAssistantTaskCommand(native.attempts[0], 'inspect')),
                          cancel: () =>
                              this.commands.execute(new ControlAssistantTaskCommand(native.attempts[0], 'cancel'))
                      })
                  })
                : this.factory.createCapturedApi(record.invocation.scope)
            const result = desired === 'terminated' ? await api.cancel(record.id) : await api.inspect(record.id)
            if (invocationCanRelease(result)) await this.tasks.receipt(task.id, 'completed')
            else if (task.state === 'paused' && desired === 'running') await this.tasks.receipt(task.id, 'running')
        })
    }

    private async invocationAncestor(task: ExecutionTaskControl) {
        for (const id of [...task.ancestors].reverse()) {
            const target = await this.tasks.read(id)
            if (target?.kind === 'invocation')
                return this.database
                    .getRepository(AgentInvocationEntity)
                    .findOneBy({ id: target.resourceId, tenantId: task.tenantId, organizationId: task.organizationId })
        }
        return null
    }
}
