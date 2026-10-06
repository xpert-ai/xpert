import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { AgentInvocationScope, RequestContext } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { z } from 'zod/v3'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { XpertProjectAccessService } from '../services/project-access.service'
import { ProjectTaskCaller, projectTaskCallerSchema } from './project-task-dispatch.schema'
import { projectTaskRuntimeError } from './project-task-runtime.errors'

@Injectable()
export class ProjectTaskRuntimeContextService {
    constructor(
        private readonly access: XpertProjectAccessService,
        @InjectRepository(ChatConversation) private readonly conversations: Repository<ChatConversation>,
        @InjectRepository(XpertAgentExecution) private readonly executions: Repository<XpertAgentExecution>
    ) {}

    async resolve(projectId: string, caller: ProjectTaskCaller): Promise<AgentInvocationScope> {
        const parsed = projectTaskCallerSchema.safeParse(caller)
        if (!parsed.success || !z.string().uuid().safeParse(projectId).success) throw projectTaskRuntimeError('Invalid')
        caller = parsed.data
        const actor = this.actor()
        const { project } = await this.access.assertCanEdit(projectId)
        if (caller.type === 'xpert') {
            if (!caller.xpertId) throw projectTaskRuntimeError('Scope')
            await this.access.assertCanUseXpert(projectId, caller.xpertId, actor)
        }
        const [conversation, execution] = await Promise.all([
            this.conversations.findOneBy({ id: caller.conversationId, projectId, ...actorWhere(actor) }),
            this.executions.findOne({ where: { id: caller.executionId, ...actorWhere(actor) }, relations: ['xpert'] })
        ])
        if (
            !conversation ||
            !execution ||
            execution.threadId !== caller.threadId ||
            execution.agentKey !== caller.agentKey
        )
            throw projectTaskRuntimeError('Scope')
        if (caller.type === 'project_agent' && conversation.threadId !== caller.threadId)
            throw projectTaskRuntimeError('Scope')
        if (conversation.threadId !== caller.threadId) {
            const branch = await this.conversations.manager.getRepository(ChatConversationThread).findOneBy({
                conversationId: conversation.id,
                threadId: caller.threadId,
                tenantId: actor.tenantId,
                organizationId: actor.organizationId
            })
            if (!branch) throw projectTaskRuntimeError('Scope')
        }
        const workspaceId = caller.type === 'project_agent' ? project.workspaceId : execution.xpert?.workspaceId
        if (
            !workspaceId ||
            (caller.type === 'project_agent'
                ? execution.type !== 'project_agent' ||
                  caller.agentKey !== 'general_agent' ||
                  Boolean(execution.xpertId) ||
                  Boolean(caller.xpertId)
                : execution.xpertId !== caller.xpertId)
        )
            throw projectTaskRuntimeError('Scope')
        return {
            ...actor,
            projectId,
            conversationId: conversation.id,
            workspaceId,
            parentExecutionId: execution.id,
            ...(caller.type === 'project_agent'
                ? { callerType: 'project_agent' as const }
                : { callerXpertId: caller.xpertId }),
            callerAgentKey: caller.agentKey
        }
    }

    actor() {
        const actor = {
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId(),
            userId: RequestContext.currentUserId()
        }
        if (!Object.values(actor).every((value) => z.string().uuid().safeParse(value).success))
            throw projectTaskRuntimeError('Scope')
        return actor
    }
}

function actorWhere(actor: { tenantId: string; organizationId: string; userId: string }) {
    return { tenantId: actor.tenantId, organizationId: actor.organizationId, createdById: actor.userId }
}
