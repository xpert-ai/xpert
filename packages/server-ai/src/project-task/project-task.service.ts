import {
	IProjectTask,
	createProjectId,
	createSprintId,
	ProjectSwimlaneKindEnum,
	ProjectTaskStatusEnum,
	createOptionalTeamId,
	ProjectId
} from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository, UpdateResult } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { ProjectSprint } from '../project-sprint/project-sprint.entity'
import { normalizeOptionalBrandedId, normalizeRequiredBrandedId } from '../shared/utils'
import { ProjectSwimlane } from '../project-swimlane/project-swimlane.entity'
import { ProjectTeamBinding } from '../team-binding/project-team-binding.entity'
import { ProjectTask } from './project-task.entity'

@Injectable()
export class ProjectTaskService extends TenantOrganizationAwareCrudService<ProjectTask> {
	constructor(
		@InjectRepository(ProjectTask)
		protected readonly repository: Repository<ProjectTask>,
		@InjectRepository(ProjectSprint)
		private readonly sprintRepository: Repository<ProjectSprint>,
		@InjectRepository(ProjectSwimlane)
		private readonly swimlaneRepository: Repository<ProjectSwimlane>,
		@InjectRepository(ProjectTeamBinding)
		private readonly teamBindingRepository: Repository<ProjectTeamBinding>
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
		const currentSwimlane = await this.loadSwimlaneOrFail(current.swimlaneId)
		const nextProjectId =
			typeof partialEntity.projectId === 'string' ? partialEntity.projectId : current.projectId
		const nextSprintId =
			typeof partialEntity.sprintId === 'string' ? partialEntity.sprintId : current.sprintId
		const nextSwimlaneId =
			typeof partialEntity.swimlaneId === 'string' ? partialEntity.swimlaneId : current.swimlaneId
		const nextDependencies = Array.isArray(partialEntity.dependencies)
			? partialEntity.dependencies
			: current.dependencies
		const nextTeamId =
			typeof partialEntity.teamId === 'string'
				? partialEntity.teamId
				: partialEntity.teamId === null
					? null
					: current.teamId
		const normalizedEntityInput: Partial<IProjectTask> = {
			projectId: nextProjectId,
			sprintId: nextSprintId,
			swimlaneId: nextSwimlaneId,
			dependencies: nextDependencies,
			teamId: nextTeamId,
			sortOrder:
				typeof partialEntity.sortOrder === 'number'
					? partialEntity.sortOrder
					: nextSwimlaneId === current.swimlaneId
						? current.sortOrder
						: undefined,
			status:
				typeof partialEntity.status === 'string'
					? partialEntity.status
					: current.status
		}
		const normalizedEntity = await this.normalizeTaskInput(
			normalizedEntityInput,
			current,
			currentSwimlane
		)

		await super.update(
			id,
			{
				...partialEntity,
				projectId: normalizedEntity.projectId,
				sprintId: normalizedEntity.sprintId,
				swimlaneId: normalizedEntity.swimlaneId,
				dependencies: normalizedEntity.dependencies,
				teamId: normalizedEntity.teamId ?? null,
				sortOrder: normalizedEntity.sortOrder,
				status: normalizedEntity.status
			},
			...options
		)

		return this.findOne(id)
	}

	async listByProjectContext(filters: {
		projectId: string
		sprintId?: string
		swimlaneId?: string
		status?: ProjectTaskStatusEnum
		query?: string
		teamId?: IProjectTask['teamId']
	}) {
		const queryBuilder = this.repository.createQueryBuilder('task')
		queryBuilder.where('task.projectId = :projectId', { projectId: filters.projectId })

		if (filters.sprintId) {
			queryBuilder.andWhere('task.sprintId = :sprintId', { sprintId: filters.sprintId })
		}
		if (filters.swimlaneId) {
			queryBuilder.andWhere('task.swimlaneId = :swimlaneId', { swimlaneId: filters.swimlaneId })
		}
		if (filters.status) {
			queryBuilder.andWhere('task.status = :status', { status: filters.status })
		}
		if (filters.query?.trim()) {
			queryBuilder.andWhere('(task.title ILIKE :query OR task.description ILIKE :query)', {
				query: `%${filters.query.trim()}%`
			})
		}
		if (filters.teamId) {
			queryBuilder.andWhere('task.teamId = :teamId', { teamId: filters.teamId })
		}

		queryBuilder.orderBy('task.sortOrder', 'ASC').addOrderBy('task.createdAt', 'ASC')
		return queryBuilder.getMany()
	}

	async reorderInLane(swimlaneId: string, orderedTaskIds: string[]) {
		const tasks = await this.repository.find({
			where: { swimlaneId },
			order: { sortOrder: 'ASC', createdAt: 'ASC' }
		})
		const taskIdsInLane = new Set(tasks.map((task) => task.id))
		const unknownTaskId = orderedTaskIds.find((taskId) => !taskIdsInLane.has(taskId))
		if (unknownTaskId) {
			throw new BadRequestException(`Task ${unknownTaskId} does not belong to swimlane ${swimlaneId}`)
		}

		const untouchedTasks = tasks.filter((task) => !orderedTaskIds.includes(task.id))
		const nextOrder = [...orderedTaskIds, ...untouchedTasks.map((task) => task.id)]
		const taskById = new Map(tasks.map((task) => [task.id, task]))

		for (const [index, taskId] of nextOrder.entries()) {
			const task = taskById.get(taskId)
			if (!task || task.sortOrder === index) {
				continue
			}
			task.sortOrder = index
			await this.repository.save(task)
		}

		return this.repository.find({
			where: { swimlaneId },
			order: { sortOrder: 'ASC', createdAt: 'ASC' }
		})
	}

	async moveTasks(taskIds: string[], targetSwimlaneId: string) {
		if (!taskIds.length) {
			return []
		}

		const targetSwimlane = await this.loadSwimlaneOrFail(targetSwimlaneId)
		const tasks = await this.repository.findBy({
			id: In(taskIds)
		})
		if (tasks.length !== taskIds.length) {
			throw new BadRequestException('All moved tasks must reference existing tasks')
		}

		const targetLaneKind = targetSwimlane.kind ?? ProjectSwimlaneKindEnum.Execution
		const targetSortBase = await this.getNextSortOrder(targetSwimlaneId)

		for (const [index, task] of tasks.entries()) {
			if (task.projectId !== targetSwimlane.projectId) {
				throw new BadRequestException('Tasks can only be moved within the same project')
			}

			const sourceSwimlane = await this.loadSwimlaneOrFail(task.swimlaneId)
			const sourceLaneKind = sourceSwimlane.kind ?? ProjectSwimlaneKindEnum.Execution
			const isCrossSprintMove = task.sprintId !== targetSwimlane.sprintId

			if (isCrossSprintMove && (sourceLaneKind !== ProjectSwimlaneKindEnum.Backlog || targetLaneKind !== ProjectSwimlaneKindEnum.Backlog)) {
				throw new BadRequestException('Only backlog tasks can be carried over across sprints')
			}

			task.projectId = targetSwimlane.projectId
			task.sprintId = targetSwimlane.sprintId
			task.swimlaneId = targetSwimlane.id
			task.sortOrder = targetSortBase + index

			if (targetLaneKind === ProjectSwimlaneKindEnum.Backlog) {
				task.dependencies = []
				task.status = ProjectTaskStatusEnum.Todo
			}

			await this.repository.save(task)
		}

		return this.repository.findBy({
			id: In(taskIds)
		})
	}

	private async normalizeTaskInput(
		entity: Partial<IProjectTask>,
		currentTask?: Pick<ProjectTask, 'id' | 'projectId' | 'sprintId'>,
		currentSwimlane?: ProjectSwimlane
	) {
		const projectId = normalizeRequiredBrandedId(entity.projectId, 'projectId', createProjectId, {
			missingMessage: 'projectId, sprintId, and swimlaneId are required for a task'
		})
		const sprintId = normalizeRequiredBrandedId(entity.sprintId, 'sprintId', createSprintId, {
			missingMessage: 'projectId, sprintId, and swimlaneId are required for a task'
		})
		const swimlaneId = entity.swimlaneId
		const dependencies = entity.dependencies ?? []
		const teamId = normalizeOptionalBrandedId(entity.teamId, 'teamId', createOptionalTeamIdValue, {
			blankAs: 'null'
		}) ?? null

		if (!swimlaneId) {
			throw new BadRequestException('projectId, sprintId, and swimlaneId are required for a task')
		}

		const sprint = await this.sprintRepository.findOneBy({ id: sprintId })
		if (!sprint) {
			throw new BadRequestException(`Sprint ${sprintId} was not found`)
		}
		if (sprint.projectId !== projectId) {
			throw new BadRequestException('Task sprintId must belong to the same projectId')
		}

		const swimlane = await this.loadSwimlaneOrFail(swimlaneId)
		if (swimlane.projectId !== projectId || swimlane.sprintId !== sprintId) {
			throw new BadRequestException('Task swimlaneId must belong to the same projectId and sprintId')
		}

		if (currentTask && projectId !== currentTask.projectId) {
			throw new BadRequestException('Changing a task projectId is not supported')
		}

		if (currentTask && currentSwimlane && sprintId !== currentTask.sprintId) {
			const currentLaneKind = currentSwimlane.kind ?? ProjectSwimlaneKindEnum.Execution
			const targetLaneKind = swimlane.kind ?? ProjectSwimlaneKindEnum.Execution
			if (currentLaneKind !== ProjectSwimlaneKindEnum.Backlog || targetLaneKind !== ProjectSwimlaneKindEnum.Backlog) {
				throw new BadRequestException('Only backlog tasks can be carried over across sprints')
			}
		}

		await this.validateDependencies(dependencies, sprintId, currentTask?.id)
		await this.validateTeamBinding(projectId, teamId)
		this.validateLaneSpecificRules(swimlane, dependencies, entity.status ?? ProjectTaskStatusEnum.Todo)

		const sortOrder =
			typeof entity.sortOrder === 'number' && entity.sortOrder >= 0
				? entity.sortOrder
				: await this.getNextSortOrder(swimlaneId, currentTask?.id)

		return {
			...entity,
			projectId,
			sprintId,
			swimlaneId,
			dependencies,
			teamId,
			sortOrder,
			status: entity.status ?? ProjectTaskStatusEnum.Todo
		}
	}

	private validateLaneSpecificRules(
		swimlane: Pick<ProjectSwimlane, 'kind'>,
		dependencies: string[],
		status: ProjectTaskStatusEnum
	) {
		if ((swimlane.kind ?? ProjectSwimlaneKindEnum.Execution) !== ProjectSwimlaneKindEnum.Backlog) {
			return
		}

		if (dependencies.length > 0) {
			throw new BadRequestException('Backlog tasks cannot declare task dependencies')
		}

		if (status !== ProjectTaskStatusEnum.Todo) {
			throw new BadRequestException('Backlog tasks must stay in todo status')
		}
	}

	private async getNextSortOrder(swimlaneId: string, currentTaskId?: string) {
		const tasks = await this.repository.find({
			where: { swimlaneId },
			order: { sortOrder: 'DESC', createdAt: 'DESC' },
			take: 1
		})
		const [lastTask] = currentTaskId ? tasks.filter((task) => task.id !== currentTaskId) : tasks
		return lastTask ? lastTask.sortOrder + 1 : 0
	}

	private async loadSwimlaneOrFail(swimlaneId: string) {
		const swimlane = await this.swimlaneRepository.findOneBy({ id: swimlaneId })
		if (!swimlane) {
			throw new BadRequestException(`Swimlane ${swimlaneId} was not found`)
		}
		return swimlane
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

	private async validateTeamBinding(projectId: ProjectId, teamId?: IProjectTask['teamId']) {
		if (!teamId) {
			return
		}

		const binding = await this.teamBindingRepository.findOne({
			where: {
				projectId,
				teamId
			}
		})

		if (!binding) {
			throw new BadRequestException('Task teamId must belong to a bound team on the same project')
		}
	}
}

function createOptionalTeamIdValue(value: string) {
	return createOptionalTeamId(value) ?? null
}
