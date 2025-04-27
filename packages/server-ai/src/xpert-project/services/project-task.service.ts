import { IXpertProjectTask, OrderTypeEnum } from '@metad/contracts'
import { DeepPartial } from '@metad/server-common'
import { RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { I18nService } from 'nestjs-i18n'
import { Repository } from 'typeorm'
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
}
