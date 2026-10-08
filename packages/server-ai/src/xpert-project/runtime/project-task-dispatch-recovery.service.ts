import { isRuntimeMessageBlocked } from '../../handoff/runtime-messaging/runtime-message.errors'
import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { DataSource, LessThanOrEqual } from 'typeorm'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { ProjectTaskDispatchService } from './project-task-dispatch.service'
import { RuntimeMessageAccessService } from '../../handoff/runtime-messaging/runtime-message-access.service'

@Injectable()
export class ProjectTaskDispatchRecoveryService {
    private scanning = false
    private readonly logger = new Logger(ProjectTaskDispatchRecoveryService.name)
    constructor(
        private readonly dataSource: DataSource,
        private readonly dispatch: ProjectTaskDispatchService,
        private readonly access: RuntimeMessageAccessService
    ) {}

    @Interval(5000)
    async reconcile() {
        if (this.scanning) return
        this.scanning = true
        try {
            const rows = await this.dataSource
                .getRepository(XpertProjectTaskExecution)
                .createQueryBuilder('attempt')
                .addSelect('attempt.dispatchIntent')
                .where({ dispatchState: 'pending', dispatchNextAttemptAt: LessThanOrEqual(new Date()) })
                .orderBy('attempt.dispatchNextAttemptAt', 'ASC')
                .take(20)
                .getMany()
            await Promise.allSettled(rows.map((row) => this.recover(row)))
        } catch {
            this.logger.warn('Project dispatch recovery deferred')
        } finally {
            this.scanning = false
        }
    }

    async recover(row: XpertProjectTaskExecution) {
        const repo = this.dataSource.getRepository(XpertProjectTaskExecution)
        const claimed = await repo.update(
            { id: row.id, dispatchState: 'pending', dispatchNextAttemptAt: LessThanOrEqual(new Date()) },
            {
                dispatchNextAttemptAt: new Date(Date.now() + 60_000)
            }
        )
        if (!claimed.affected) return
        try {
            const intent = this.dispatch.intent(row)
            await this.access.withActor(intent.scope, () =>
                this.dispatch.dispatch(row.projectId, intent.input, {
                    executionId: intent.scope.parentExecutionId,
                    conversationId: intent.scope.conversationId,
                    threadId: intent.request.dispatch.replyTo.threadId,
                    type: intent.scope.callerType ?? 'xpert',
                    xpertId: intent.scope.callerXpertId,
                    agentKey: intent.scope.callerAgentKey,
                    sourceMessageId: intent.request.dispatch.sourceMessageId
                })
            )
            await repo.update(row.id, { dispatchError: null, dispatchNextAttemptAt: null })
        } catch (error) {
            const denied = isRuntimeMessageBlocked(error)
            await repo.update(row.id, {
                dispatchError: denied ? 'dispatch_blocked' : 'dispatch_unavailable',
                dispatchNextAttemptAt: denied ? null : new Date(Date.now() + 60_000)
            })
        }
    }
}
