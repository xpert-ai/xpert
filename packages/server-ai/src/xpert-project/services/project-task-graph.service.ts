// Provider snapshots are replayable read models. Projection never starts Agents,
// and runtime success does not override a provider's business acceptance status.
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
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { Xpert } from '../../xpert/xpert.entity'
import { avatarForChat } from '../../shared/avatar'
import { registeredProjectTaskTypes, invalidProjectTaskType } from './project-task-types'
import { assertProjectTaskProgress } from './project-task-progress'

export function projectTaskIdentity(projectId: string, provider: string, key: string): string {
    const hex = createHash('sha256')
        .update(JSON.stringify([projectId, provider, key]))
        .digest('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

@Injectable()
@RuntimeCapabilityProvider(ProjectTasksRuntimeCapability)
export class ProjectTaskGraphService implements ProjectTasksApi {
    constructor(
        @InjectRepository(XpertProjectTask) private readonly tasks: Repository<XpertProjectTask>,
        private readonly access: ProjectAccessRuntimeService,
        private readonly providers: ProjectTaskProviderRegistry
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
        const diagnostics: ProjectTaskGraph['diagnostics'] = []
        for (const provider of this.providers.list(context.actor.organizationId ?? undefined)) {
            try {
                const taskTypes = registeredProjectTaskTypes(provider)
                const links = await this.tasks.manager.transaction(async (manager) => {
                    // Serialize snapshot acquisition too: an older snapshot cannot overwrite a newer one.
                    await manager.findOneOrFail(XpertProject, {
                        where: { id: context.projectId, tenantId: context.actor.tenantId },
                        lock: { mode: 'pessimistic_write' }
                    })
                    const snapshot = await provider.snapshot(context)
                    if (!snapshot) return
                    const identity = (key: string) => projectTaskIdentity(context.projectId, provider.key, key)
                    const existing = await manager.find(XpertProjectTask, {
                        where: { ...this.where(context), providerKey: provider.key }
                    })
                    const nodes: ProjectTaskNode[] = snapshot.tasks.map((item) => ({
                        id: identity(item.key),
                        title: item.title,
                        status: item.status,
                        progress: item.progress ?? null,
                        kind: item.kind,
                        taskType: item.taskType ?? null,
                        parentTaskId: item.parentKey ? identity(item.parentKey) : null,
                        predecessorIds: item.predecessorKeys.map(identity),
                        providerKey: provider.key,
                        sourceKey: item.key,
                        revision: 0,
                        plannedStartAt: null,
                        plannedEndAt: null,
                        estimatedDurationMs: null,
                        actualStartAt: null,
                        actualEndAt: null,
                        diagnostic: item.diagnostic ?? null,
                        assigneeXpertId: item.assigneeXpertId ?? null
                    }))
                    validateProjectTaskGraph(nodes)
                    for (const item of snapshot.tasks) {
                        assertProjectTaskProgress(item.progress)
                        if (!item.key.trim() || !item.title.trim()) throw Error('PROJECT_TASK_SOURCE_INVALID')
                        if (item.taskType != null && !taskTypes.has(item.taskType)) throw invalidProjectTaskType()
                        if (new Set(item.executions.map((execution) => execution.key)).size !== item.executions.length)
                            throw Error('PROJECT_TASK_ATTEMPT_DUPLICATE')
                        for (const execution of item.executions) {
                            if (!execution.key.trim() || !Number.isInteger(execution.attempt) || execution.attempt < 1)
                                throw Error('PROJECT_TASK_ATTEMPT_INVALID')
                            for (const date of [execution.startedAt, execution.completedAt]) {
                                if (date && !Number.isFinite(Date.parse(date)))
                                    throw Error('PROJECT_TASK_EXECUTION_DATE_INVALID')
                            }
                        }
                    }
                    for (const [index, item] of snapshot.tasks.entries()) {
                        const node = nodes[index]
                        const sourceRevision = createHash('sha256').update(JSON.stringify(item)).digest('hex')
                        const old = existing.find((task) => task.id === node.id)
                        if (old?.sourceRevision === sourceRevision) continue
                        const row =
                            old ??
                            manager.create(XpertProjectTask, {
                                id: node.id,
                                projectId: context.projectId,
                                tenantId: context.actor.tenantId,
                                organizationId: context.actor.organizationId,
                                createdById: context.actor.userId,
                                steps: []
                            })
                        Object.assign(row, {
                            name: item.title,
                            title: item.title,
                            status: item.status,
                            ...(item.progress !== undefined ? { progress: item.progress } : {}),
                            kind: item.kind,
                            ...(item.taskType !== undefined ? { type: item.taskType } : {}),
                            providerKey: provider.key,
                            sourceKey: item.key,
                            sourceRevision,
                            parentTaskId: node.parentTaskId,
                            predecessorIds: node.predecessorIds,
                            diagnostic: node.diagnostic,
                            assigneeXpertId: item.assigneeXpertId ?? null
                        })
                        await manager.save(row)
                        for (const execution of item.executions) {
                            const executionId = projectTaskIdentity(node.id, provider.key, execution.key)
                            const previous = await manager.findOneBy(XpertProjectTaskExecution, {
                                id: executionId,
                                ...this.where(context)
                            })
                            await manager.save(
                                XpertProjectTaskExecution,
                                manager.create(XpertProjectTaskExecution, {
                                    ...previous,
                                    id: executionId,
                                    ...execution,
                                    sourceKey: execution.key,
                                    taskId: node.id,
                                    projectId: context.projectId,
                                    tenantId: context.actor.tenantId,
                                    organizationId: context.actor.organizationId,
                                    createdById: context.actor.userId,
                                    startedAt: execution.startedAt ? new Date(execution.startedAt) : null,
                                    completedAt: execution.completedAt ? new Date(execution.completedAt) : null
                                })
                            )
                        }
                    }
                    for (const removed of existing.filter((row) => !nodes.some((node) => node.id === row.id))) {
                        if (removed.status === 'cancelled') continue
                        removed.status = 'cancelled'
                        removed.sourceRevision = null
                        removed.diagnostic = t('server-ai:Error.ProjectTaskRemovedFromPlan')
                        await manager.save(removed)
                    }
                    return nodes.map((node) => ({ sourceKey: node.sourceKey!, taskId: node.id }))
                })
                if (links) await provider.linked?.(context, links)
            } catch (error) {
                diagnostics.push({
                    providerKey: provider.key,
                    message: error instanceof Error ? error.message : String(error)
                })
            }
        }
        return {
            ...(await this.readGraph(context, diagnostics)),
            canEditPlan: !access.archived && ['owner', 'manager', 'editor'].includes(access.role)
        }
    }

    private async readGraph(
        context: ProjectTaskContext,
        diagnostics: ProjectTaskGraph['diagnostics'] = []
    ): Promise<ProjectTaskGraph> {
        const rows = await this.tasks.find({ where: this.where(context), order: { createdAt: 'ASC' } })
        const executions = await this.tasks.manager.find(XpertProjectTaskExecution, {
            where: this.where(context),
            order: { startedAt: 'ASC', attempt: 'ASC' }
        })
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
            const run = runtime.find((run) => run.id === item.agentExecutionId)
            return {
                ...item,
                runtimeStatus: run?.status ?? ('unknown' as const),
                // Runtime timestamps are separate from domain acceptance/lease timestamps.
                runtimeStartedAt: run?.createdAt?.toISOString() ?? null,
                runtimeCompletedAt:
                    run && ['success', 'error', 'timeout'].includes(run.status)
                        ? (run.updatedAt?.toISOString() ?? null)
                        : null
            }
        })
        const nodes = rows.map((row) =>
            toProjectTaskNode(
                row,
                observed
                    .filter((item) => item.taskId === row.id)
                    .map((item) => ({
                        ...item,
                        startedAt: item.agentExecutionId
                            ? item.runtimeStartedAt
                                ? new Date(item.runtimeStartedAt)
                                : null
                            : item.startedAt,
                        completedAt: item.agentExecutionId
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
        if (!attempt?.conversationId || !attempt.agentExecutionId)
            throw new NotFoundException(t('server-ai:Error.ProjectTaskExecutionUnavailable'))
        const conversation = await this.tasks.manager.findOneBy(ChatConversation, {
            id: attempt.conversationId,
            ...this.where(context)
        })
        if (!conversation?.threadId || !conversation.xpertId)
            throw new NotFoundException(t('server-ai:Error.ProjectTaskExecutionUnavailable'))
        const scope = { tenantId: context.actor.tenantId, organizationId: context.actor.organizationId ?? IsNull() }
        // Registered conversation branches are navigable; internal expert graph threads are not.
        const thread = attempt.threadId
            ? await this.tasks.manager.findOneBy(ChatConversationThread, { threadId: attempt.threadId, ...scope })
            : null
        if (thread && thread.conversationId !== conversation.id)
            throw new NotFoundException(t('server-ai:Error.ProjectTaskExecutionUnavailable'))
        let execution = await this.tasks.manager.findOneBy(XpertAgentExecution, {
            id: attempt.agentExecutionId,
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
            conversationId: conversation.id,
            threadId: thread?.threadId ?? conversation.threadId,
            agentExecutionId: attempt.agentExecutionId,
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
