import {
    IXpertProjectTask,
    IXpertProjectTaskConversation,
    IXpertProjectTaskExecution,
    mapTranslationLanguage,
    OrderTypeEnum
} from '@xpert-ai/contracts'
import { DeepPartial } from '@xpert-ai/server-common'
import { RequestContext, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { I18nService } from 'nestjs-i18n'
import { t } from 'i18next'
import { In, Repository } from 'typeorm'
import { XpertProjectTaskStep } from '../entities/project-task-step.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskConversation } from '../entities/project-task-conversation.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { XpertProject } from '../entities/project.entity'

@Injectable()
export class XpertProjectTaskService extends TenantOrganizationAwareCrudService<XpertProjectTask> {
    readonly #logger = new Logger(XpertProjectTaskService.name)

    constructor(
        @InjectRepository(XpertProjectTask)
        repository: Repository<XpertProjectTask>,
        @InjectRepository(XpertProjectTaskStep)
        private stepRepository: Repository<XpertProjectTaskStep>,
        @InjectRepository(XpertProjectTaskConversation)
        private readonly conversationLinkRepository: Repository<XpertProjectTaskConversation>,
        @InjectRepository(XpertProjectTaskExecution)
        private readonly executionRepository: Repository<XpertProjectTaskExecution>,
        @InjectRepository(ChatConversation)
        private readonly conversationRepository: Repository<ChatConversation>,
        @InjectRepository(XpertProject)
        private readonly projectRepository: Repository<XpertProject>,
        private readonly i18n: I18nService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {
        super(repository)
    }

    async translate(key: string, options?: any) {
        options ??= {}
        options.lang = mapTranslationLanguage(RequestContext.getLanguageCode())
        return await this.i18n.t(key, options)
    }

    async saveAll(...entities: IXpertProjectTask[]) {
        const items = []
        for await (const entity of entities) {
            const task = await this.repository.save({
                ...entity,
                tenantId: RequestContext.currentTenantId(),
                organizationId: RequestContext.getOrganizationId(),
                createdById: RequestContext.currentUserId()
            })
            if (entity.steps) {
                task.steps = await this.stepRepository.save(
                    entity.steps.map((_) => ({
                        ..._,
                        taskId: task.id,
                        tenantId: RequestContext.currentTenantId(),
                        organizationId: RequestContext.getOrganizationId(),
                        createdById: RequestContext.currentUserId()
                    }))
                )
            }
            items.push(task)
        }

        return items
    }

    async updateTaskSteps(
        projectId: string,
        threadId: string | undefined,
        ...entities: DeepPartial<IXpertProjectTask>[]
    ) {
        const { items: tasks } = await this.findAll({
            where: { projectId },
            relations: ['steps'],
            order: { createdAt: OrderTypeEnum.ASC }
        })
        for await (const entity of entities) {
            const task = tasks.find(
                (_) =>
                    (entity.id && _.id === entity.id) ||
                    (Boolean(threadId) && _.threadId === threadId && !!entity.name && _.name === entity.name) ||
                    (!!entity.name && _.name === entity.name)
            )
            if (!task) {
                throw new Error(`Task not exists with id or name '${entity.id || entity.name}'`)
            }
            for (const step of entity.steps ?? []) {
                const taskStep =
                    task.steps.find((item) => item.stepIndex === step.stepIndex) || task.steps[step.stepIndex - 1]
                if (!taskStep) {
                    throw new Error(`Step with index '${step.stepIndex}' not exists in task '${entity.name}'`)
                }
                taskStep.status = step.status
                if (step.notes) taskStep.notes = [taskStep.notes, step.notes].filter(Boolean).join('\n')
            }
            task.steps = await this.stepRepository.save(task.steps)
            if (entity.status) {
                task.status = entity.status
            } else if (task.steps.length > 0 && task.steps.every((step) => step.status === 'done')) {
                // A completed step list is the project expert's canonical completion signal.
                // Persist the task state even when the model omits the redundant status field.
                task.status = 'done'
            }
            await this.repository.save(task)
        }

        return tasks
    }

    async createTask(projectId: string, input: Partial<IXpertProjectTask>) {
        await this.validateTaskMode(projectId, input.status)
        const project = await this.projectRepository.findOne({ where: { id: projectId }, relations: ['xperts'] })
        if (!project) throw new NotFoundException('Xpert project not found')
        const assigneeXpertId = await this.resolveAssigneeXpertId(project, input.assigneeXpertId)
        const [task] = await this.saveAll({
            ...input,
            projectId,
            assigneeXpertId,
            name: input.name?.trim() || input.title?.trim() || 'Untitled task',
            title: input.title ?? input.name,
            status: input.status ?? 'todo',
            priority: input.priority ?? 'medium',
            steps: input.steps ?? []
        } as IXpertProjectTask)
        return task
    }

    async updateTask(projectId: string, taskId: string, input: Partial<IXpertProjectTask>) {
        await this.validateTaskMode(projectId, input.status)
        const project = await this.projectRepository.findOne({ where: { id: projectId }, relations: ['xperts'] })
        if (!project) throw new NotFoundException('Xpert project not found')
        const task = await this.findOne({ where: { id: taskId, projectId } })
        if (!task) throw new NotFoundException('Project task not found')
        const nextInput = { ...input } as Partial<IXpertProjectTask>
        if (Object.prototype.hasOwnProperty.call(input, 'assigneeXpertId')) {
            nextInput.assigneeXpertId = await this.resolveAssigneeXpertId(project, input.assigneeXpertId)
        }
        Object.assign(task, nextInput, { projectId })
        return this.save(task)
    }

    private async resolveAssigneeXpertId(project: XpertProject, requestedId?: string): Promise<string | undefined> {
        const normalizedId = typeof requestedId === 'string' ? requestedId.trim() : ''
        if (!normalizedId) return undefined
        const assigneeXpertId = normalizedId
        if (!project.xperts?.some((xpert) => xpert.id === assigneeXpertId)) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectTaskXpertNotMember', {
                    defaultValue: 'The task execution Xpert must be a member of this Project'
                })
            )
        }
        return assigneeXpertId
    }

    private async validateTaskMode(projectId: string, status?: IXpertProjectTask['status']) {
        if (!status) return
        const project = await this.projectRepository.findOne({ where: { id: projectId } })
        if (!project) throw new NotFoundException('Xpert project not found')
        if (
            project.settings?.managementMode !== 'advanced' &&
            !['todo', 'in_progress', 'paused', 'done', 'blocked', 'cancelled'].includes(status)
        ) {
            throw new BadRequestException('Simple projects use the fixed task lanes')
        }
    }

    async listTaskRelations(projectId: string, taskId: string) {
        const task = await this.repository.findOne({ where: { id: taskId, projectId } })
        if (!task) throw new NotFoundException('Project task not found')
        const [conversations, executions] = await Promise.all([
            this.conversationLinkRepository.find({
                where: { projectId, taskId },
                relations: ['conversation'],
                order: { createdAt: OrderTypeEnum.ASC }
            }),
            this.executionRepository.find({ where: { projectId, taskId }, order: { createdAt: OrderTypeEnum.DESC } })
        ])
        return {
            conversations: conversations.map((link) => ({
                ...link,
                conversation: link.conversation
                    ? {
                          id: link.conversation.id,
                          threadId: link.conversation.threadId,
                          title: link.conversation.title,
                          status: link.conversation.status,
                          xpertId: link.conversation.xpertId
                      }
                    : undefined
            })),
            executions
        }
    }

    async linkConversation(
        projectId: string,
        taskId: string,
        input: Pick<IXpertProjectTaskConversation, 'conversationId' | 'relationType'> &
            Partial<IXpertProjectTaskConversation>
    ) {
        const task = await this.repository.findOne({ where: { id: taskId, projectId } })
        if (!task) throw new NotFoundException('Project task not found')
        const conversation = await this.conversationRepository.findOne({ where: { id: input.conversationId } })
        if (!conversation || conversation.projectId !== projectId) {
            throw new NotFoundException('Project conversation not found')
        }
        const existing = await this.conversationLinkRepository.findOne({
            where: { projectId, taskId, conversationId: input.conversationId, relationType: input.relationType }
        })
        if (existing) return existing
        return this.conversationLinkRepository.save(
            this.conversationLinkRepository.create({
                projectId,
                taskId,
                conversationId: input.conversationId,
                relationType: input.relationType,
                isPrimary: input.isPrimary ?? false,
                sourceMessageId: input.sourceMessageId,
                sourceExecutionId: input.sourceExecutionId,
                tenantId: task.tenantId,
                organizationId: task.organizationId,
                createdById: RequestContext.currentUserId()
            })
        )
    }

    async createExecution(projectId: string, taskId: string, input: Partial<IXpertProjectTaskExecution>) {
        const task = await this.repository.findOne({ where: { id: taskId, projectId } })
        if (!task) throw new NotFoundException('Project task not found')
        if (input.conversationId) {
            const conversation = await this.conversationRepository.findOne({ where: { id: input.conversationId } })
            if (!conversation || conversation.projectId !== projectId)
                throw new NotFoundException('Project conversation not found')
        }
        if (input.status === 'queued' && input.threadId && input.xpertId) {
            const queued = await this.executionRepository.findOne({
                where: { projectId, taskId, threadId: input.threadId, xpertId: input.xpertId, status: 'queued' },
                order: { createdAt: OrderTypeEnum.ASC }
            })
            if (queued) return queued
        }
        const latest = await this.executionRepository.findOne({
            where: { projectId, taskId },
            order: { attempt: 'DESC' }
        })
        return this.executionRepository.save(
            this.executionRepository.create({
                projectId,
                taskId,
                ...input,
                attempt: input.attempt ?? (latest?.attempt ?? 0) + 1,
                status: input.status ?? 'queued',
                tenantId: task.tenantId,
                organizationId: task.organizationId,
                createdById: RequestContext.currentUserId()
            })
        )
    }

    async updateExecution(
        projectId: string,
        taskId: string,
        executionId: string,
        input: Partial<IXpertProjectTaskExecution>
    ) {
        const execution = await this.executionRepository.findOne({ where: { id: executionId, projectId, taskId } })
        if (!execution) throw new NotFoundException('Project task execution not found')
        Object.assign(execution, input, { projectId, taskId })
        if (input.status && ['succeeded', 'failed', 'cancelled'].includes(input.status))
            execution.completedAt ??= new Date()
        if (input.status === 'running') execution.startedAt ??= new Date()
        return this.executionRepository.save(execution)
    }

    async claimExecution(projectId: string, input: { threadId?: string; xpertId?: string; agentExecutionId: string }) {
        if (!input.threadId || !input.xpertId) return null
        const execution = await this.executionRepository.findOne({
            where: { projectId, threadId: input.threadId, xpertId: input.xpertId, status: 'queued' },
            order: { createdAt: OrderTypeEnum.ASC }
        })
        if (!execution) return null
        execution.agentExecutionId = input.agentExecutionId
        execution.status = 'running'
        execution.startedAt ??= new Date()
        return this.executionRepository.save(execution)
    }

    async reorder(projectId: string, items: Array<{ id: string; order: number; column?: string }>) {
        if (!items.length) return []
        return this.repository.manager.transaction(async (manager) => {
            const repository = manager.getRepository(XpertProjectTask)
            const tasks = await repository.find({ where: { projectId, id: In(items.map((item) => item.id)) } })
            const taskById = new Map(tasks.map((task) => [task.id, task]))
            if (tasks.length !== items.length) throw new NotFoundException('One or more project tasks were not found')
            for (const item of items) {
                const task = taskById.get(item.id)
                if (!task) continue
                task.order = item.order
                if (item.column !== undefined) task.column = item.column
            }
            return repository.save(tasks)
        })
    }

    async batchUpdate(
        projectId: string,
        input: {
            ids: string[]
            status?: IXpertProjectTask['status']
            assigneeId?: string
            assigneeXpertId?: string
            priority?: IXpertProjectTask['priority']
        }
    ) {
        await this.validateTaskMode(projectId, input.status)
        return this.repository.manager.transaction(async (manager) => {
            const repository = manager.getRepository(XpertProjectTask)
            const tasks = await repository.find({ where: { projectId, id: In(input.ids) } })
            if (tasks.length !== input.ids.length)
                throw new NotFoundException('One or more project tasks were not found')
            if (input.assigneeXpertId !== undefined) {
                const project = await this.projectRepository.findOne({
                    where: { id: projectId },
                    relations: ['xperts']
                })
                if (!project) throw new NotFoundException('Xpert project not found')
                await this.resolveAssigneeXpertId(project, input.assigneeXpertId)
            }
            for (const task of tasks) {
                Object.assign(task, {
                    ...(input.status !== undefined ? { status: input.status } : {}),
                    ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
                    ...(input.assigneeXpertId !== undefined
                        ? { assigneeXpertId: input.assigneeXpertId.trim() || undefined }
                        : {}),
                    ...(input.priority !== undefined ? { priority: input.priority } : {})
                })
            }
            return repository.save(tasks)
        })
    }
}
