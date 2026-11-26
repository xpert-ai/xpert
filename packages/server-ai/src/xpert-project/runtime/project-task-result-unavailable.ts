import { HttpException } from '@nestjs/common'
import type { AgentInvocation } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { projectTaskRuntimeError } from './project-task-runtime.errors'

/** A scoped read established absence, not a malformed paging request. HTTP readers retain 409. */
export class ProjectTaskResultUnavailable extends HttpException {
    constructor(
        readonly observation: {
            projectId: string
            taskId: string
            executionId: string
            invocationId: string
            invocationRevision: number
            invocationStatus: AgentInvocation['status']
            error?: AgentInvocation['error']
        },
        readonly conversationId?: string,
        readonly threadId?: string
    ) {
        super(projectTaskRuntimeError('ResultUnavailable').message, 409)
    }

    forCoordinator(conversationId?: string, threadId?: string) {
        const pending = ['queued', 'running'].includes(this.observation.invocationStatus)
        const canAwaitDelivery = Boolean(
            pending &&
            conversationId &&
            threadId &&
            this.conversationId === conversationId &&
            this.threadId === threadId
        )
        return {
            ...this.observation,
            reportStatus: pending ? ('pending' as const) : ('unavailable' as const),
            canAwaitDelivery,
            nextAction: canAwaitDelivery ? 'await_delivery' : 'read_task',
            message: canAwaitDelivery
                ? t('server-ai:ProjectTask.ReportPending', {
                      defaultValue:
                          'The delegated execution is still active and has no report yet. Finish independent coordination, then end this turn. Durable result delivery will resume coordination. Do not poll this report or change expectedRevision.'
                  })
                : t('server-ai:ProjectTask.ReportUnavailable', {
                      defaultValue:
                          'No report is available. Read the task status, error or interaction and decide the next action. Changing expectedRevision cannot create a report.'
                  })
        }
    }
}
