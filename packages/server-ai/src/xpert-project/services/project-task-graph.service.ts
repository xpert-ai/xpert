import { latestImplementationExecutor } from '../runtime/project-task-executor'
import { observeProjectTaskInvocations } from '../runtime/project-task-invocation-view'
// Task graph reads never acquire projection locks or invoke plugin callbacks.
// Runtime success does not override a provider's business acceptance status.
import { createHash } from 'node:crypto'
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { In, IsNull, Repository } from 'typeorm'
import {
    validateProjectTaskGraph,
    type ProjectTaskGraph,
    type ProjectTaskNode,
    type ProjectTaskGraphChange
} from '@xpert-ai/contracts'
import {
    ProjectTaskProviderRegistry,
    ProjectTasksRuntimeCapability,
    type ProjectTaskContext,
    type ProjectTasksApi
} from '@xpert-ai/plugin-sdk'
import { RuntimeCapabilityProvider } from '../../shared/runtime/runtime-capability-provider.decorator'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { ProjectAccessRuntimeService } from './project-access-runtime.service'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { projectTaskRuntimeTiming } from './project-task-runtime-timing'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { Xpert } from '../../xpert/xpert.entity'
import { avatarForChat } from '../../shared/avatar'
import { registeredProjectTaskTypes } from './project-task-types'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'

import { ProjectTaskProjectionService } from './task-projection/project-task-projection.service'
export { projectTaskIdentity } from './project-task-identity'

@Injectable()
@RuntimeCapabilityProvider(ProjectTasksRuntimeCapability)
export class ProjectTaskGraphService implements ProjectTasksApi {
    constructor(
        @InjectRepository(XpertProjectTask) private readonly tasks: Repository<XpertProjectTask>,
        private readonly access: ProjectAccessRuntimeService,
        private readonly providers: ProjectTaskProviderRegistry,
        private readonly projection: ProjectTaskProjectionService
    ) {}

    private where(context: ProjectTaskContext) {
        return {
            projectId: context.projectId,
            tenantId: context.actor.tenantId,
            organizationId: context.actor.organizationId ?? IsNull()
        }
    }

    private async assertRead(context: ProjectTaskContext) {
        const readable = await this.access.listReadable({ actor: context.actor, projectIds: [context.projectId] })
        if (!readable.length) throw new ForbiddenException(t('server-ai:Error.ProjectTaskAccessDenied'))
        return readable[0]
    }

    async graph(context: ProjectTaskContext): Promise<ProjectTaskGraph> {
        const access = await this.assertRead(context)
        return {
            ...(await this.readGraph(context, await this.projection.diagnostics(context))),
            canEditPlan: !access.archived && ['owner', 'manager', 'editor'].includes(access.role)
        }
    }

    async refresh(context: ProjectTaskContext) {
        return this.projection.request(context)
    }

    private async readGraph(
        context: ProjectTaskContext,
        diagnostics: ProjectTaskGraph['diagnostics'] = []
    ): Promise<ProjectTaskGraph> {
        const rows = await this.tasks.find({ where: this.where(context), order: { createdAt: 'ASC' } })
        const storedExecutions = await this.tasks.manager.find(XpertProjectTaskExecution, {
            where: this.where(context),
            order: { startedAt: 'ASC', attempt: 'ASC' }
        })
        const executions = await observeProjectTaskInvocations(
            this.tasks.manager,
            {
                projectId: context.projectId,
                tenantId: context.actor.tenantId,
                organizationId: context.actor.organizationId
            },
            storedExecutions
        )
        const ids = executions.flatMap((item) => (item.agentExecutionId ? [item.agentExecutionId] : []))
        const runtime = ids.length
            ? await this.tasks.manager.find(XpertAgentExecution, {
                  where: {
                      id: In(ids),
                      tenantId: context.actor.tenantId,
                      organizationId: context.actor.organizationId ?? IsNull()
                  }
              })
            : []
        const observed = executions.map((item) => {
            if (item.invocationId) return item
            const run = runtime.find((run) => run.id === item.agentExecutionId)
            return {
                ...item,
                // Runtime timestamps are separate from domain acceptance/lease timestamps.
                ...projectTaskRuntimeTiming(run)
            }
        })
        const nodes = rows.map((row) =>
            toProjectTaskNode(
                row,
                observed
                    .filter((item) => item.taskId === row.id)
                    .map((item) => ({
                        ...item,
                        startedAt:
                            item.invocationId || item.agentExecutionId
                                ? item.runtimeStartedAt
                                    ? new Date(item.runtimeStartedAt)
                                    : null
                                : item.startedAt,
                        completedAt:
                            item.invocationId || item.agentExecutionId
                                ? item.runtimeCompletedAt
                                    ? new Date(item.runtimeCompletedAt)
                                    : null
                                : item.completedAt
                    }))
            )
        )
        const scope = { tenantId: context.actor.tenantId, organizationId: context.actor.organizationId ?? IsNull() }
        const assigneeIds = [...new Set(rows.flatMap((row) => (row.assigneeXpertId ? [row.assigneeXpertId] : [])))]
        const [project, assignees] = await Promise.all([
            this.tasks.manager.findOne(XpertProject, {
                where: { id: context.projectId, ...scope },
                select: ['id', 'name']
            }),
            assigneeIds.length
                ? this.tasks.manager.find(Xpert, {
                      where: { id: In(assigneeIds), ...scope },
                      select: ['id', 'title', 'name', 'avatar']
                  })
                : Promise.resolve([])
        ])
        const assistants = new Map(assignees.map((item) => [item.id, item]))
        const typeRegistrations = new Map<string, ReturnType<typeof registeredProjectTaskTypes>>()
        for (const provider of this.providers.list(context.actor.organizationId ?? undefined)) {
            try {
                typeRegistrations.set(provider.key, registeredProjectTaskTypes(provider))
            } catch {
                // Invalid/unavailable registrations cannot erase persisted business identity.
            }
        }
        const displayNodes = nodes.map((node) => {
            const assistant = assistants.get(node.assigneeXpertId)
            return {
                ...node,
                presentation: typeRegistrations.get(node.providerKey)?.get(node.taskType) ?? null,
                executor: latestImplementationExecutor(observed.filter((attempt) => attempt.taskId === node.id)),
                assigneeName: assistant ? assistant.title || assistant.name : null,
                assigneeAvatar: avatarForChat(assistant?.avatar) ?? null
            }
        })
        const cursor = createHash('sha256')
            .update(JSON.stringify([project?.name, displayNodes, observed, diagnostics]))
            .digest('hex')
        return {
            projectId: context.projectId,
            projectTitle: project?.name,
            tasks: displayNodes,
            executions: observed,
            diagnostics,
            cursor
        }
    }

    async change(context: ProjectTaskContext, input: ProjectTaskGraphChange): Promise<ProjectTaskGraph> {
        await this.access.assertEdit(context)
        const graph = await this.graph(context)
        const current = graph.tasks.find((task) => task.id === input.taskId)
        if (!current) throw new NotFoundException(t('server-ai:Error.ProjectTaskNotFound'))
        if (current.revision !== input.expectedRevision)
            throw new ConflictException(t('server-ai:Error.ProjectTaskRevisionConflict'))
        const next = graph.tasks.map((task) => (task.id === input.taskId ? { ...task, ...input, id: task.id } : task))
        try {
            validateProjectTaskGraph(next)
        } catch (error) {
            throw new BadRequestException(error instanceof Error ? error.message : String(error))
        }
        const relationsChanged = input.parentTaskId !== undefined || input.predecessorIds !== undefined
        if (current.providerKey && relationsChanged) {
            throw new BadRequestException(t('server-ai:Error.ProjectTaskProviderCommandRequired'))
        }
        await this.tasks.manager.transaction(async (manager) => {
            await manager.findOneOrFail(XpertProject, {
                where: { id: context.projectId, tenantId: context.actor.tenantId },
                lock: { mode: 'pessimistic_write' }
            })
            const row = await manager.findOneOrFail(XpertProjectTask, {
                where: { id: input.taskId, ...this.where(context) },
                lock: { mode: 'pessimistic_write' }
            })
            if (row.revision !== input.expectedRevision)
                throw new ConflictException(t('server-ai:Error.ProjectTaskRevisionConflict'))
            const rows = await manager.find(XpertProjectTask, { where: this.where(context) })
            validateProjectTaskGraph(
                rows.map((item) =>
                    item.id === input.taskId
                        ? { ...toProjectTaskNode(item, []), ...input, id: item.id }
                        : toProjectTaskNode(item, [])
                )
            )
            if (!current.providerKey) {
                if (input.parentTaskId !== undefined) row.parentTaskId = input.parentTaskId
                if (input.predecessorIds !== undefined) row.predecessorIds = input.predecessorIds
            }
            if (input.plannedStartAt !== undefined)
                row.plannedStartAt = input.plannedStartAt ? new Date(input.plannedStartAt) : null
            if (input.plannedEndAt !== undefined)
                row.plannedEndAt = input.plannedEndAt ? new Date(input.plannedEndAt) : null
            if (input.estimatedDurationMs !== undefined) row.estimatedDurationMs = input.estimatedDurationMs
            await manager.save(row)
        })
        return this.graph(context)
    }

    async resolveExecution(context: ProjectTaskContext, taskExecutionId: string) {
        await this.assertRead(context)
        const attempt = await this.tasks.manager.findOneBy(XpertProjectTaskExecution, {
            id: taskExecutionId,
            ...this.where(context)
        })
        let executionId = attempt?.agentExecutionId
        let invocationId: string | undefined
        let codingInvocationId: string | undefined
        if (attempt?.invocationId) {
            const record = await this.tasks.manager.findOneBy(AgentInvocationEntity, {
                id: attempt.invocationId,
                tenantId: context.actor.tenantId,
                organizationId: context.actor.organizationId ?? IsNull(),
                ownerId: context.actor.userId
            })
            if (
                record?.invocation.request.dispatch?.projectTask?.taskExecutionId === attempt.id &&
                record.invocation.scope.projectId === context.projectId &&
                record.invocation.scope.conversationId === attempt.conversationId
            ) {
                executionId = record.invocation.scope.parentExecutionId
                invocationId = record.invocation.id
                if (record.invocation.activity?.presentation === 'coding') codingInvocationId = record.invocation.id
            }
        }
        if (!attempt?.conversationId || !executionId)
            throw new NotFoundException(t('server-ai:Error.ProjectTaskExecutionUnavailable'))
        const conversation = await this.tasks.manager.findOneBy(ChatConversation, {
            id: attempt.conversationId,
            ...this.where(context)
        })
        if (!conversation?.threadId || (!conversation.xpertId && !invocationId))
            throw new NotFoundException(t('server-ai:Error.ProjectTaskExecutionUnavailable'))
        const scope = { tenantId: context.actor.tenantId, organizationId: context.actor.organizationId ?? IsNull() }
        // Registered conversation branches are navigable; internal expert graph threads are not.
        const thread = attempt.threadId
            ? await this.tasks.manager.findOneBy(ChatConversationThread, { threadId: attempt.threadId, ...scope })
            : null
        if (thread && thread.conversationId !== conversation.id)
            throw new NotFoundException(t('server-ai:Error.ProjectTaskExecutionUnavailable'))
        let execution = await this.tasks.manager.findOneBy(XpertAgentExecution, {
            id: executionId,
            ...scope
        })
        const seen = new Set<string>()
        let belongs = false
        while (execution && !seen.has(execution.id)) {
            seen.add(execution.id)
            if (
                await this.tasks.manager.existsBy(ChatMessage, {
                    conversationId: conversation.id,
                    executionId: execution.id,
                    ...scope
                })
            ) {
                belongs = true
                break
            }
            execution = execution.parentId
                ? await this.tasks.manager.findOneBy(XpertAgentExecution, { id: execution.parentId, ...scope })
                : null
        }
        if (!belongs) throw new NotFoundException(t('server-ai:Error.ProjectTaskExecutionUnavailable'))
        return {
            projectId: context.projectId,
            taskId: attempt.taskId,
            taskExecutionId: attempt.id,
            invocationId,
            codingInvocationId,
            conversationId: conversation.id,
            threadId: thread?.threadId ?? conversation.threadId,
            agentExecutionId: executionId,
            xpertId: conversation.xpertId
        }
    }
}

export function toProjectTaskNode(row: XpertProjectTask, executions: XpertProjectTaskExecution[]): ProjectTaskNode {
    const starts = executions.flatMap((item) => (item.startedAt ? [item.startedAt.getTime()] : []))
    const ends = executions.flatMap((item) => (item.completedAt ? [item.completedAt.getTime()] : []))
    return {
        id: row.id,
        title: row.title ?? row.name,
        kind: row.kind ?? 'task',
        taskType: row.type ?? null,
        progress: row.progress ?? null,
        status:
            row.status === 'completed'
                ? 'done'
                : row.status === 'pending'
                  ? 'todo'
                  : row.status === 'failed'
                    ? 'blocked'
                    : row.status,
        parentTaskId: row.parentTaskId ?? null,
        predecessorIds: row.predecessorIds ?? [],
        providerKey: row.providerKey ?? null,
        sourceKey: row.sourceKey ?? null,
        revision: row.revision ?? 1,
        plannedStartAt: row.plannedStartAt?.toISOString() ?? null,
        plannedEndAt: row.plannedEndAt?.toISOString() ?? null,
        estimatedDurationMs: row.estimatedDurationMs ?? null,
        diagnostic: row.diagnostic ?? null,
        actualStartAt: starts.length ? new Date(Math.min(...starts)).toISOString() : null,
        actualEndAt:
            ends.length && executions.every((item) => item.completedAt)
                ? new Date(Math.max(...ends)).toISOString()
                : null,
        assigneeXpertId: row.assigneeXpertId ?? null
    }
}
