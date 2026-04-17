import { IProjectTask, ProjectTaskStatusEnum } from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository, UpdateResult } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { ProjectSprint } from '../project-sprint/project-sprint.entity'
import { ProjectSwimlane } from '../project-swimlane/project-swimlane.entity'
import { ProjectTask } from './project-task.entity'

@Injectable()
export class ProjectTaskService extends TenantOrganizationAwareCrudService<ProjectTask> {
	constructor(
		@InjectRepository(ProjectTask)
		protected readonly repository: Repository<ProjectTask>,
		@InjectRepository(ProjectSprint)
		private readonly sprintRepository: Repository<ProjectSprint>,
		@InjectRepository(ProjectSwimlane)
		private readonly swimlaneRepository: Repository<ProjectSwimlane>
	) {
		super(repository)
	}

	override async create(entity: Partial<IProjectTask>, ...options: unknown[]) {
		const normalizedEntity = await this.normalizeTaskInput(entity)
		return super.create(normalizedEntity, ...options)
	}

	override async update(
		id: string,
		partialEntity: QueryDeepPartialEntity<ProjectTask>,
		...options: unknown[]
	): Promise<UpdateResult | ProjectTask> {
		const current = await this.findOne(id)
		const nextProjectId =
			typeof partialEntity.projectId === 'string' ? partialEntity.projectId : current.projectId
		const nextSprintId =
			typeof partialEntity.sprintId === 'string' ? partialEntity.sprintId : current.sprintId
		const nextSwimlaneId =
			typeof partialEntity.swimlaneId === 'string' ? partialEntity.swimlaneId : current.swimlaneId
		const nextDependencies = Array.isArray(partialEntity.dependencies)
			? partialEntity.dependencies
			: current.dependencies
		const normalizedEntityInput: Partial<IProjectTask> = {
			projectId: nextProjectId,
			sprintId: nextSprintId,
			swimlaneId: nextSwimlaneId,
			dependencies: nextDependencies,
			status:
				typeof partialEntity.status === 'string'
					? partialEntity.status
					: current.status
		}
		const normalizedEntity = await this.normalizeTaskInput(
			normalizedEntityInput,
			id
		)

		await super.update(
			id,
			{
				...partialEntity,
				projectId: normalizedEntity.projectId,
				sprintId: normalizedEntity.sprintId,
				swimlaneId: normalizedEntity.swimlaneId,
				dependencies: normalizedEntity.dependencies,
				status: normalizedEntity.status
			},
			...options
		)

		return this.findOne(id)
	}

	private async normalizeTaskInput(entity: Partial<IProjectTask>, currentTaskId?: string) {
		const projectId = entity.projectId
		const sprintId = entity.sprintId
		const swimlaneId = entity.swimlaneId
		const dependencies = entity.dependencies ?? []

		if (!projectId || !sprintId || !swimlaneId) {
			throw new BadRequestException('projectId, sprintId, and swimlaneId are required for a task')
		}

		const sprint = await this.sprintRepository.findOneBy({ id: sprintId })
		if (!sprint) {
			throw new BadRequestException(`Sprint ${sprintId} was not found`)
		}
		if (sprint.projectId !== projectId) {
			throw new BadRequestException('Task sprintId must belong to the same projectId')
		}

		const swimlane = await this.swimlaneRepository.findOneBy({ id: swimlaneId })
		if (!swimlane) {
			throw new BadRequestException(`Swimlane ${swimlaneId} was not found`)
		}
		if (swimlane.projectId !== projectId || swimlane.sprintId !== sprintId) {
			throw new BadRequestException('Task swimlaneId must belong to the same projectId and sprintId')
		}

		await this.validateDependencies(dependencies, sprintId, currentTaskId)

		return {
			...entity,
			projectId,
			sprintId,
			swimlaneId,
			dependencies,
			status: entity.status ?? ProjectTaskStatusEnum.Todo
		}
	}

	private async validateDependencies(dependencies: string[], sprintId: string, currentTaskId?: string) {
		if (!Array.isArray(dependencies)) {
			throw new BadRequestException('dependencies must be an array of task ids')
		}

		if (!dependencies.length) {
			return
		}

		if (currentTaskId && dependencies.includes(currentTaskId)) {
			throw new BadRequestException('A task cannot depend on itself')
		}

		const dependencyTasks = await this.repository.findBy({
			id: In(dependencies)
		})
		if (dependencyTasks.length !== dependencies.length) {
			throw new BadRequestException('All task dependencies must reference existing tasks')
		}

		const crossSprintDependency = dependencyTasks.find((task) => task.sprintId !== sprintId)
		if (crossSprintDependency) {
			throw new BadRequestException('Task dependencies must belong to the same sprint')
		}
	}
}
