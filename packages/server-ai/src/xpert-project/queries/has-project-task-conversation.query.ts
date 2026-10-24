import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { XpertProjectAccessService } from '../services/project-access.service'

/** Verify a persisted Project task conversation before navigating between bound Assistants.
 * Callers must separately authorize conversation access and any requested branch/message.
 */
export class HasProjectTaskConversationQuery extends Query<boolean> {
    constructor(
        readonly projectId: string,
        readonly conversationId: string,
        readonly requesterXpertId: string,
        readonly targetXpertId: string
    ) {
        super()
    }
}

// A shared Project alone is insufficient. Require a task, its native execution and an
// actual message in this exact conversation, all within the authenticated scope.
@QueryHandler(HasProjectTaskConversationQuery)
export class HasProjectTaskConversationHandler implements IQueryHandler<HasProjectTaskConversationQuery> {
    constructor(
        @InjectRepository(XpertProjectTaskExecution) private readonly attempts: Repository<XpertProjectTaskExecution>,
        private readonly access: XpertProjectAccessService
    ) {}

    async execute(query: HasProjectTaskConversationQuery): Promise<boolean> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId() ?? null
        if (!tenantId || !RequestContext.currentUserId()) return false
        await Promise.all([
            this.access.assertCanReadXpert(query.projectId, query.requesterXpertId),
            this.access.assertCanReadXpert(query.projectId, query.targetXpertId)
        ])
        const scoped = (alias: string) => `${alias}."tenantId" = attempt."tenantId" AND
            ${alias}."organizationId" IS NOT DISTINCT FROM attempt."organizationId"`
        return this.attempts
            .createQueryBuilder('attempt')
            .innerJoin(
                XpertProjectTask,
                'task',
                `task.id::text = attempt."taskId"::text AND
                task."projectId" = attempt."projectId" AND ${scoped('task')}`
            )
            .innerJoin(
                ChatConversation,
                'conversation',
                `conversation.id::text = attempt."conversationId"::text AND
                conversation."projectId" = attempt."projectId" AND ${scoped('conversation')}`
            )
            .innerJoin(
                XpertAgentExecution,
                'execution',
                `execution.id::text = attempt."agentExecutionId"::text AND
                execution."xpertId"::text = conversation."xpertId"::text AND ${scoped('execution')}`
            )
            .innerJoin(
                ChatMessage,
                'message',
                `message."executionId"::text = execution.id::text AND
                message."conversationId"::text = conversation.id::text AND ${scoped('message')}`
            )
            .where('attempt."projectId" = :projectId AND attempt."tenantId" = :tenantId', {
                projectId: query.projectId,
                tenantId
            })
            .andWhere('attempt."organizationId" IS NOT DISTINCT FROM :organizationId', { organizationId })
            .andWhere('conversation.id = :conversationId AND conversation."xpertId" = :targetXpertId', query)
            .andWhere('attempt."xpertId"::text = conversation."xpertId"::text')
            .getExists()
    }
}
