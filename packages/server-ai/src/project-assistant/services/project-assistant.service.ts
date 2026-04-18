import {
	IProjectCore,
	IProjectSprint,
	IProjectTask,
	IProjectSwimlane,
	ProjectSprintStatusEnum,
	ProjectSprintStrategyEnum,
	ProjectSwimlaneKindEnum,
	ProjectTaskStatusEnum
} from '@xpert-ai/contracts'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository, UpdateResult } from 'typeorm'
import { ProjectCoreService } from '../../project-core/project-core.service'
import { ProjectOrchestratorService } from '../../project-orchestrator/project-orchestrator.service'
import { ProjectSprint } from '../../project-sprint/project-sprint.entity'
import { ProjectSprintService } from '../../project-sprint/project-sprint.service'
import { ProjectSwimlane } from '../../project-swimlane/project-swimlane.entity'
import { ProjectSwimlaneService } from '../../project-swimlane/project-swimlane.service'
import { ProjectTask } from '../../project-task/project-task.entity'
import { ProjectTaskService } from '../../project-task/project-task.service'

export interface ProjectAssistantResolvedContext {
	project: IProjectCore
	sprint: IProjectSprint | null
	backlogLane: IProjectSwimlane | null
	executionLanes: IProjectSwimlane[]
	tasks: IProjectTask[]
	executionSnapshot: Awaited<ReturnType<ProjectOrchestratorService['getSprintExecutionSnapshot']>> | null
}

export interface ProjectExecutionSnapshotSummary {
	blockedTaskCount: number
	runnableTaskCount: number
	laneCount: number
}

@Injectable()
export class ProjectAssistantService {
	constructor(
		private readonly projectCoreService: ProjectCoreService,
		private readonly projectSprintService: ProjectSprintService,
		private readonly projectSwimlaneService: ProjectSwimlaneService,
		private readonly projectTaskService: ProjectTaskService,
		private readonly projectOrchestratorService: ProjectOrchestratorService,
		@InjectRepository(ProjectSprint)
		private readonly sprintRepository: Repository<ProjectSprint>,
		@InjectRepository(ProjectSwimlane)
		private readonly swimlaneRepository: Repository<ProjectSwimlane>,
		@InjectRepository(ProjectTask)
		private readonly taskRepository: Repository<ProjectTask>
	) {}

	async resolveProject(projectId: string) {
		return this.projectCoreService.findOne(projectId)
	}

	async resolveSprint(projectId: string, sprintId?: string | null) {
		if (sprintId) {
			const sprint = await this.projectSprintService.findOne(sprintId)
			if (sprint.projectId !== projectId) {
				throw new BadRequestException('Sprint does not belong to the selected project')
			}
			return sprint
		}

		const sprints = await this.sprintRepository.find({
			where: { projectId },
			order: {
				createdAt: 'DESC'
			}
		})
		if (!sprints.length) {
			return null
		}

		return (
			sprints.find((item) => item.status === ProjectSprintStatusEnum.Running) ??
			sprints.find((item) => item.status === ProjectSprintStatusEnum.Review) ??
			sprints.find((item) => item.status === ProjectSprintStatusEnum.Planned) ??
			sprints[0]
		)
	}

	async resolveContext(projectId: string, sprintId?: string | null): Promise<ProjectAssistantResolvedContext> {
		const project = await this.resolveProject(projectId)
		const sprint = await this.resolveSprint(projectId, sprintId)
		if (!sprint) {
			return {
				project,
				sprint: null,
				backlogLane: null,
				executionLanes: [],
				tasks: [],
				executionSnapshot: null
			}
		}

		const backlogLane = await this.projectSwimlaneService.ensureReservedBacklogLane(sprint.id)
		const swimlanes = await this.swimlaneRepository.find({
			where: { sprintId: sprint.id },
			order: { sortOrder: 'ASC', createdAt: 'ASC' }
		})
		const tasks = await this.taskRepository.find({
			where: { sprintId: sprint.id },
			order: { sortOrder: 'ASC', createdAt: 'ASC' }
		})
		const executionSnapshot = await this.projectOrchestratorService.getSprintExecutionSnapshot(sprint.id)

		return {
			project,
			sprint,
			backlogLane,
			executionLanes: swimlanes.filter(
				(item) => (item.kind ?? ProjectSwimlaneKindEnum.Execution) === ProjectSwimlaneKindEnum.Execution
			),
			tasks,
			executionSnapshot
		}
	}

	buildExecutionSnapshotSummary(snapshot: ProjectAssistantResolvedContext['executionSnapshot']): ProjectExecutionSnapshotSummary | null {
		if (!snapshot) {
			return null
		}

		return {
			blockedTaskCount: snapshot.blockedTaskIds.length,
			runnableTaskCount: snapshot.runnableTasks.length,
			laneCount: snapshot.lanes.length
		}
	}

	async getProjectContext(projectId: string, sprintId?: string | null) {
		const context = await this.resolveContext(projectId, sprintId)
		return {
			project: context.project,
			sprint: context.sprint,
			backlogLane: context.backlogLane,
			executionLanes: context.executionLanes,
			taskCount: context.tasks.length,
			executionSnapshot: context.executionSnapshot
		}
	}

	async listProjectTasks(input: {
		projectId: string
		sprintId?: string
		laneId?: string
		laneKind?: ProjectSwimlaneKindEnum
		status?: ProjectTaskStatusEnum
		query?: string
	}) {
		const tasks = await this.projectTaskService.listByProjectContext({
			projectId: input.projectId,
			sprintId: input.sprintId,
			swimlaneId: input.laneId,
			status: input.status,
			query: input.query
		})
		if (!input.laneKind) {
			return tasks
		}

		const laneIds = [
			...new Set(tasks.map((task) => task.swimlaneId))
		]
		const swimlanes = laneIds.length
			? await this.swimlaneRepository.findBy({ id: In(laneIds) })
			: []
		const laneKindById = new Map(
			swimlanes.map((lane) => [lane.id, lane.kind ?? ProjectSwimlaneKindEnum.Execution])
		)

		return tasks.filter(
			(task) => laneKindById.get(task.swimlaneId) === input.laneKind
		)
	}

	async createProjectTasks(input: {
		projectId: string
		sprintId?: string
		laneId?: string
		tasks: Array<Pick<IProjectTask, 'title'> & Partial<Pick<IProjectTask, 'description' | 'assignedAgentId' | 'status' | 'dependencies'>>>
	}) {
		const context = await this.resolveContext(input.projectId, input.sprintId)
		if (!context.sprint || !context.backlogLane) {
			throw new BadRequestException('Project does not have an active sprint context yet')
		}

		const targetLane = input.laneId
			? await this.loadProjectLane(input.projectId, input.laneId)
			: context.backlogLane

		const created: IProjectTask[] = []
		for (const task of input.tasks) {
			const createdTask = await this.projectTaskService.create({
				projectId: input.projectId,
				sprintId: targetLane.sprintId,
				swimlaneId: targetLane.id,
				title: task.title,
				description: task.description,
				assignedAgentId: task.assignedAgentId,
				status: task.status,
				dependencies: task.dependencies ?? []
			})
			created.push(
				createdTask
			)
		}

		return created
	}

	async updateProjectTasks(input: {
		projectId: string
		tasks: Array<
			Pick<IProjectTask, 'id'> &
				Partial<Pick<IProjectTask, 'title' | 'description' | 'assignedAgentId' | 'status' | 'dependencies'>>
		>
	}) {
		const updated: IProjectTask[] = []
		for (const task of input.tasks) {
			const current = await this.projectTaskService.findOne(task.id)
			if (current.projectId !== input.projectId) {
				throw new BadRequestException('Task does not belong to the selected project')
			}

			const nextTask = await this.projectTaskService.update(task.id, {
				title: task.title,
				description: task.description,
				assignedAgentId: task.assignedAgentId,
				status: task.status,
				dependencies: task.dependencies
			})
			if ('affected' in nextTask) {
				throw new BadRequestException(`Task ${task.id} update did not return the updated entity`)
			}
			updated.push(nextTask as IProjectTask)
		}

		return updated
	}

	async reorderProjectTasks(projectId: string, swimlaneId: string, orderedTaskIds: string[]) {
		await this.loadProjectLane(projectId, swimlaneId)
		return this.projectTaskService.reorderInLane(swimlaneId, orderedTaskIds)
	}

	async moveProjectTasks(projectId: string, taskIds: string[], targetSwimlaneId: string) {
		await this.loadProjectLane(projectId, targetSwimlaneId)
		for (const taskId of taskIds) {
			const task = await this.projectTaskService.findOne(taskId)
			if (task.projectId !== projectId) {
				throw new BadRequestException('Task does not belong to the selected project')
			}
		}

		return this.projectTaskService.moveTasks(taskIds, targetSwimlaneId)
	}

	async createProjectSprint(input: {
		projectId: string
		goal: string
		strategyType: ProjectSprintStrategyEnum
		status?: ProjectSprintStatusEnum
		startAt?: Date
		endAt?: Date
		carryOverSprintId?: string
	}) {
		const sprint = await this.projectSprintService.create({
			projectId: input.projectId,
			goal: input.goal,
			strategyType: input.strategyType,
			status: input.status,
			startAt: input.startAt,
			endAt: input.endAt
		})

		if (input.carryOverSprintId) {
			const sourceContext = await this.resolveContext(input.projectId, input.carryOverSprintId)
			const targetContext = await this.resolveContext(input.projectId, sprint.id)
			if (sourceContext.backlogLane && targetContext.backlogLane) {
				const taskIds = sourceContext.tasks
					.filter((task) => task.swimlaneId === sourceContext.backlogLane?.id)
					.map((task) => task.id)

				if (taskIds.length) {
					await this.projectTaskService.moveTasks(taskIds, targetContext.backlogLane.id)
				}
			}
		}

		return sprint
	}

	async updateProjectSprint(input: {
		projectId: string
		sprintId: string
		goal?: string
		status?: ProjectSprintStatusEnum
		retrospective?: string
		startAt?: Date
		endAt?: Date
	}) {
		const sprint = await this.projectSprintService.findOne(input.sprintId)
		if (sprint.projectId !== input.projectId) {
			throw new BadRequestException('Sprint does not belong to the selected project')
		}

		const nextSprint = await this.projectSprintService.update(input.sprintId, {
			goal: input.goal,
			status: input.status,
			retrospective: input.retrospective,
			startAt: input.startAt,
			endAt: input.endAt
		})
		if ('affected' in nextSprint) {
			throw new BadRequestException(`Sprint ${input.sprintId} update did not return the updated entity`)
		}
		return nextSprint as IProjectSprint
	}

	async updateProjectSwimlanes(input: {
		projectId: string
		swimlanes: Array<
			Pick<IProjectSwimlane, 'id'> &
				Partial<
					Pick<
						IProjectSwimlane,
						'priority' | 'weight' | 'concurrencyLimit' | 'wipLimit' | 'agentRole' | 'environmentType'
					>
				>
		>
	}) {
		const updated: IProjectSwimlane[] = []
		for (const swimlaneInput of input.swimlanes) {
			const swimlane = await this.loadProjectLane(input.projectId, swimlaneInput.id)
			if ((swimlane.kind ?? ProjectSwimlaneKindEnum.Execution) !== ProjectSwimlaneKindEnum.Execution) {
				throw new BadRequestException('Reserved backlog lane cannot be mutated as an execution lane')
			}

			const nextSwimlane = await this.projectSwimlaneService.update(swimlane.id, {
				priority: swimlaneInput.priority,
				weight: swimlaneInput.weight,
				concurrencyLimit: swimlaneInput.concurrencyLimit,
				wipLimit: swimlaneInput.wipLimit,
				agentRole: swimlaneInput.agentRole,
				environmentType: swimlaneInput.environmentType
			})
			if ('affected' in nextSwimlane) {
				throw new BadRequestException(`Swimlane ${swimlane.id} update did not return the updated entity`)
			}
			updated.push(nextSwimlane as IProjectSwimlane)
		}

		return updated
	}

	async getProjectExecutionSnapshot(projectId: string, sprintId?: string) {
		const context = await this.resolveContext(projectId, sprintId)
		return context.executionSnapshot
	}

	private async loadProjectLane(projectId: string, swimlaneId: string) {
		const swimlane = await this.projectSwimlaneService.findOne(swimlaneId)
		if (swimlane.projectId !== projectId) {
			throw new BadRequestException('Swimlane does not belong to the selected project')
		}
		return swimlane
	}
}
