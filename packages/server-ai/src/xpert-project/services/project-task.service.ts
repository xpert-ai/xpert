import { IXpertProjectTask, mapTranslationLanguage, OrderTypeEnum } from '@xpert-ai/contracts'
import { DeepPartial } from '@xpert-ai/server-common'
import { RequestContext, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { I18nService } from 'nestjs-i18n'
import { In, Repository } from 'typeorm'
import { XpertProjectTaskStep } from '../entities/project-task-step.entity'
import { XpertProjectTask } from '../entities/project-task.entity'

@Injectable()
export class XpertProjectTaskService extends TenantOrganizationAwareCrudService<XpertProjectTask> {
    readonly #logger = new Logger(XpertProjectTaskService.name)

    constructor(
        @InjectRepository(XpertProjectTask)
        repository: Repository<XpertProjectTask>,
        @InjectRepository(XpertProjectTaskStep)
        private stepRepository: Repository<XpertProjectTaskStep>,
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

    async updateTaskSteps(projectId: string, threadId: string, ...entities: DeepPartial<IXpertProjectTask>[]) {
        const { items: tasks } = await this.findAll({
            where: { projectId, threadId },
            relations: ['steps'],
            order: { createdAt: OrderTypeEnum.ASC }
        })
        for await (const entity of entities) {
            const task = tasks.find((_) => _.name === entity.name)
            if (!task) {
                throw new Error(`Task not exists with name '${entity.name}'`)
            }
            entity.steps.forEach((step) => {
                if (!task.steps[step.stepIndex]) {
                    throw new Error(`Step with index '${step.stepIndex}' not exists in task '${entity.name}'`)
                }
                task.steps[step.stepIndex].status = step.status
                task.steps[step.stepIndex].notes += step.notes || ''
            })
            task.steps = await this.stepRepository.save(task.steps)
        }

        return tasks
    }

    async createTask(projectId: string, input: Partial<IXpertProjectTask>) {
        const [task] = await this.saveAll({
            ...input,
            projectId,
            name: input.name?.trim() || input.title?.trim() || 'Untitled task',
            title: input.title ?? input.name,
            status: input.status ?? 'todo',
            priority: input.priority ?? 'medium',
            steps: input.steps ?? []
        } as IXpertProjectTask)
        return task
    }

    async updateTask(projectId: string, taskId: string, input: Partial<IXpertProjectTask>) {
        const task = await this.findOne({ where: { id: taskId, projectId } })
        if (!task) throw new NotFoundException('Project task not found')
        Object.assign(task, input, { projectId })
        return this.save(task)
    }

    async reorder(projectId: string, items: Array<{ id: string; order: number; column?: string }>) {
        if (!items.length) return []
        const tasks = await this.repository.find({ where: { projectId, id: In(items.map((item) => item.id)) } })
        const taskById = new Map(tasks.map((task) => [task.id, task]))
        if (tasks.length !== items.length) {
            throw new NotFoundException('One or more project tasks were not found')
        }
        for (const item of items) {
            const task = taskById.get(item.id)
            if (!task) continue
            task.order = item.order
            if (item.column !== undefined) task.column = item.column
        }
        return this.repository.save(tasks)
    }

    async batchUpdate(
        projectId: string,
        input: {
            ids: string[]
            status?: IXpertProjectTask['status']
            assigneeId?: string
            priority?: IXpertProjectTask['priority']
        }
    ) {
        const result = []
        for (const id of input.ids) {
            result.push(
                await this.updateTask(projectId, id, {
                    ...(input.status !== undefined ? { status: input.status } : {}),
                    ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
                    ...(input.priority !== undefined ? { priority: input.priority } : {})
                })
            )
        }
        return result
    }
}
