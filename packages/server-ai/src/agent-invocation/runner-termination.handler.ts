// No business authorization or external I/O under a repository lock. Exact persisted scope/runner + CAS
// fence stale supervisors; only matching descendant-exit proof permits terminal bookkeeping.
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { TaskControlStore } from '@xpert-ai/server-core'
import {
    isAgentInvocationTerminal,
    type AgentInvocation,
    type AgentRunnerTerminationReason
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { AgentInvocationStore } from './invocation-store'
import { RecordRunnerTerminationCommand } from './runner-termination.command'
import { invocationCanRelease } from './invocation-control-evidence'
import { invocationError, sameInvocationData } from './invocation-runtime'
import { ProjectRuntimeObservationCommand } from '../handoff/runtime-messaging/runtime-message.commands'

@CommandHandler(RecordRunnerTerminationCommand)
export class RecordRunnerTerminationHandler implements ICommandHandler<RecordRunnerTerminationCommand> {
    constructor(
        private readonly store: AgentInvocationStore,
        private readonly tasks: TaskControlStore,
        private readonly commands: CommandBus
    ) {}

    async execute(command: RecordRunnerTerminationCommand): Promise<boolean> {
        for (let attempt = 0; attempt < 8; attempt++) {
            const record = await this.store.read(command.receipt.invocationId, command.scope)
            if (!record) return false
            const current = record.invocation
            const handle = current.handle
            if (
                !sameInvocationData(current.scope, command.scope) ||
                !handle?.runner ||
                !sameInvocationData(handle.runner, command.receipt) ||
                current.id !== command.receipt.invocationId ||
                command.receipt.supervision !== 1
            )
                throw invocationError('InvalidScope')
            if (command.action.type === 'confirm') {
                const proof = command.action.completion
                if (
                    proof.version !== 1 ||
                    proof.coverage !== 'descendants' ||
                    proof.invocationId !== current.id ||
                    proof.processId !== command.receipt.processId ||
                    !sameInvocationData(proof.environment, command.receipt.environment)
                )
                    throw invocationError('InvalidScope')
            }
            if (isAgentInvocationTerminal(current.status)) {
                // Retry projection/control receipts after a crash following the Invocation commit.
                if (current.runnerTermination && invocationCanRelease(current) && command.action.type === 'confirm')
                    await this.project(current)
                return false
            }
            if (command.action.type === 'confirm' && !current.runnerTermination) return false
            if (command.action.type === 'request' && current.runnerTermination) return true
            const now = new Date().toISOString()
            const next: AgentInvocation = { ...current, revision: current.revision + 1, updatedAt: now }
            if (command.action.type === 'request') {
                next.runnerTermination = { reason: command.action.reason, requestedAt: now }
                next.status = 'cancelling'
            } else {
                const code = current.runnerTermination.reason
                const message = terminationMessage(code)
                next.status = 'failed'
                next.error = `[${code}] ${message}`
                next.handle = { ...handle, metadata: { ...handle.metadata, completion: { code, message } } }
                next.interaction = undefined
                next.reportedOutcome = 'failed'
                next.startPendingId = undefined
                next.startPendingUntil = undefined
                next.controlEvidence = {
                    version: 1,
                    source: 'provider',
                    subject: { kind: 'invocation', id: current.id },
                    scope: 'operation',
                    state: 'settled',
                    outcome: 'failed',
                    sessionId: handle.sessionId,
                    runId: handle.runId,
                    ...(current.executionTarget ? { target: current.executionTarget } : {}),
                    receiptKey: `runner:${command.receipt.processId}`,
                    observedAt: now
                }
                if (!invocationCanRelease(next)) throw invocationError('InvalidRequest')
            }
            if (!(await this.store.replace({ ...record, invocation: next }, current.revision))) continue
            if (command.action.type === 'confirm') await this.project(next)
            return true
        }
        throw invocationError('ConcurrentUpdate')
    }

    private async project(invocation: AgentInvocation) {
        const task = await this.tasks.find(invocation.scope, 'invocation', invocation.id)
        if (task) await this.tasks.receipt(task.id, 'completed', task.claim ?? undefined)
        await this.commands.execute(
            new ProjectRuntimeObservationCommand(invocation.id, {
                tenantId: invocation.scope.tenantId,
                organizationId: invocation.scope.organizationId,
                userId: invocation.scope.userId
            })
        )
    }
}

function terminationMessage(reason: AgentRunnerTerminationReason): string {
    return reason === 'runner_unavailable'
        ? t('server-ai:Error.ModelExecutionUnknown', {
              defaultValue: 'The previous execution outcome is unknown; it will not be restarted automatically.'
          })
        : t('server-ai:Error.ModelExecutionDenied', {
              defaultValue: 'The execution authorization has expired, changed, or been revoked.'
          })
}
