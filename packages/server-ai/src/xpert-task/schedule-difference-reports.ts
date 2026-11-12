import { createHash } from 'node:crypto'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext, type IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { IsNull, Repository } from 'typeorm'
import { t } from 'i18next'
import { z } from 'zod/v3'
import { ScheduledTaskExecution, ScheduledTaskExecutionStatus } from './scheduled-task-execution.entity'
import { XpertTask } from './xpert-task.entity'

export const differenceReport = z.object({
    differences: z
        .array(
            z
                .object({
                    subject: z.string().trim().min(1).max(512).describe('Stable source, record and field identifier'),
                    before: z.string().trim().max(2048),
                    after: z.string().trim().max(2048)
                })
                .strict()
        )
        .max(100)
})

@Injectable()
export class ScheduleDifferenceReports {
    constructor(
        @InjectRepository(ScheduledTaskExecution) private readonly executions: Repository<ScheduledTaskExecution>
    ) {}

    async bind(context: IAgentMiddlewareContext) {
        if (!context.executionId || !context.threadId || !context.conversationId || !context.xpertId) return null
        const scope = { tenantId: context.tenantId, organizationId: context.organizationId ?? IsNull() }
        const run = await this.executions.findOneBy({
            ...scope,
            executionId: context.executionId,
            conversationId: context.conversationId,
            status: ScheduledTaskExecutionStatus.RUNNING
        })
        if (!run) return null
        const task = await this.executions.manager.getRepository(XpertTask).findOneBy({
            ...scope,
            id: run.taskId,
            xpertId: context.xpertId,
            runAsUserId: context.userId
        })
        if (!task?.monitor) return null
        if (
            task.monitor.target !== 'new_chat' &&
            (task.monitor.threadId !== context.threadId || task.monitor.conversationId !== context.conversationId)
        )
            return null
        const revision = task.monitor.observationRevision
        return async (report: z.infer<typeof differenceReport>) => {
            if (RequestContext.currentUserId() !== context.userId)
                throw new ForbiddenException(t('server-ai:Error.ScheduleReportUnavailable'))
            const keys = report.differences
                .filter((item) => item.before !== item.after)
                .map((item) =>
                    createHash('sha256')
                        .update(
                            JSON.stringify(
                                revision
                                    ? [revision, item.subject, item.before, item.after]
                                    : [item.subject, item.before, item.after]
                            )
                        )
                        .digest('hex')
                )
            const updated = await this.executions.update(
                {
                    ...scope,
                    id: run.id,
                    executionId: context.executionId,
                    attempt: run.attempt,
                    ownerId: run.ownerId,
                    status: ScheduledTaskExecutionStatus.RUNNING
                },
                { differenceKeys: [...new Set(keys)].sort() }
            )
            if (updated.affected !== 1) throw new ForbiddenException(t('server-ai:Error.ScheduleReportUnavailable'))
            return 'Recorded'
        }
    }
}
