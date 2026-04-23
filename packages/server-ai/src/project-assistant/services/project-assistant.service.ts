import {
	IProjectCore,
	IProjectSprint,
	IProjectTeamBinding,
	IProjectTask,
	IProjectSwimlane,
	ITeamDefinition,
	ProjectSprintStatusEnum,
	ProjectSprintStrategyEnum,
	ProjectSwimlaneKindEnum,
	ProjectTaskStatusEnum,
	ProjectId,
	SprintId,
	TeamId
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
import { TeamBindingService } from '../../team-binding/team-binding.service'
import { TeamDefinitionService } from '../../team-definition/team-definition.service'

export interface ProjectBoundTeam {
	binding: IProjectTeamBinding
	team: ITeamDefinition
}

export interface ProjectAssistantResolvedContext {
	project: IProjectCore
	sprint: IProjectSprint | null
	backlogLane: IProjectSwimlane | null
	executionLanes: IProjectSwimlane[]
	tasks: IProjectTask[]
	boundTeams: ProjectBoundTeam[]
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
		private readonly teamDefinitionService: TeamDefinitionService,
		private readonly teamBindingService: TeamBindingService,
		@InjectRepository(ProjectSprint)
		private readonly sprintRepository: Repository<ProjectSprint>,
		@InjectRepository(ProjectSwimlane)
		private readonly swimlaneRepository: Repository<ProjectSwimlane>,
		@InjectRepository(ProjectTask)
		private readonly taskRepository: Repository<ProjectTask>
	) {}

	async resolveProject(projectId: ProjectId) {
		return this.projectCoreService.findOne(projectId)
	}

	async resolveSprint(projectId: ProjectId, sprintId?: SprintId | null) {
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

	async resolveContext(projectId: ProjectId, sprintId?: SprintId | null): Promise<ProjectAssistantResolvedContext> {
		const project = await this.resolveProject(projectId)
		const boundTeams = await this.listProjectTeams(projectId)
		const sprint = await this.resolveSprint(projectId, sprintId)
		if (!sprint) {
			return {
				project,
				sprint: null,
				backlogLane: null,
				executionLanes: [],
				tasks: [],
				boundTeams,
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
			boundTeams,
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

	async getProjectContext(projectId: ProjectId, sprintId?: SprintId | null) {
		const context = await this.resolveContext(projectId, sprintId)
		return {
			project: context.project,
			sprint: context.sprint,
			backlogLane: context.backlogLane,
			executionLanes: context.executionLanes,
			taskCount: context.tasks.length,
			boundTeams: context.boundTeams,
			executionSnapshot: context.executionSnapshot
		}
	}

	async listProjectTeams(projectId: ProjectId): Promise<ProjectBoundTeam[]> {
		const bindingsResult = await this.teamBindingService.listByProject(projectId)
		const bindings = bindingsResult.items ?? []
		if (!bindings.length) {
			return []
		}

		const teams = await Promise.all(bindings.map((binding) => this.teamDefinitionService.findOne(binding.teamId)))
		const teamById = new Map(teams.map((team) => [team.id, team]))

		return bindings
			.map((binding) => {
				const team = teamById.get(binding.teamId)
				return team
					? {
							binding,
							team
						}
					: null
			})
			.filter((value): value is ProjectBoundTeam => value !== null)
	}

	async listProjectTasks(input: {
		projectId: ProjectId
		sprintId?: SprintId | null
		laneId?: string
		laneKind?: ProjectSwimlaneKindEnum
		status?: ProjectTaskStatusEnum
		query?: string
		teamId?: TeamId
	}) {
		const tasks = await this.projectTaskService.listByProjectContext({
			projectId: input.projectId,
			sprintId: input.sprintId,
			swimlaneId: input.laneId,
			status: input.status,
			query: input.query,
			teamId: input.teamId
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
		projectId: ProjectId
		sprintId?: SprintId | null
		laneId?: string
		tasks: Array<
			Pick<IProjectTask, 'title'> &
				Partial<
					Pick<IProjectTask, 'description' | 'assignedAgentId' | 'status' | 'dependencies' | 'teamId'>
				>
		>
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
				dependencies: task.dependencies ?? [],
				teamId: task.teamId
			})
			created.push(
				createdTask
			)
		}

		return created
	}

	async updateProjectTasks(input: {
		projectId: ProjectId
		tasks: Array<
			Pick<IProjectTask, 'id'> &
				Partial<
					Pick<IProjectTask, 'title' | 'description' | 'assignedAgentId' | 'status' | 'dependencies' | 'teamId'>
				>
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
				dependencies: task.dependencies,
				teamId: task.teamId
			})
			if ('affected' in nextTask) {
				throw new BadRequestException(`Task ${task.id} update did not return the updated entity`)
			}
			updated.push(nextTask as IProjectTask)
		}

		return updated
	}

	async bindProjectTeams(input: {
		projectId: ProjectId
		teams: Array<Pick<IProjectTeamBinding, 'teamId'> & Partial<Pick<IProjectTeamBinding, 'role'>>>
	}) {
		await this.resolveProject(input.projectId)
		const existingBindings = (await this.teamBindingService.listByProject(input.projectId)).items ?? []
		const existingByTeamId = new Map(existingBindings.map((binding) => [binding.teamId, binding]))

		for (const team of input.teams) {
			const existing = existingByTeamId.get(team.teamId)
			if (existing) {
				const nextPartial =
					Object.prototype.hasOwnProperty.call(team, 'role') && team.role !== undefined
						? {
								role: team.role
							}
						: {}
				if (Object.keys(nextPartial).length) {
					await this.teamBindingService.update(existing.id, nextPartial)
				}
				continue
			}

			await this.teamBindingService.create({
				projectId: input.projectId,
				teamId: team.teamId,
				role: team.role
			})
		}

		return this.listProjectTeams(input.projectId)
	}

	async updateProjectTeamBindings(input: {
		projectId: ProjectId
		bindings: Array<Pick<IProjectTeamBinding, 'id'> & Partial<Pick<IProjectTeamBinding, 'role' | 'sortOrder'>>>
	}) {
		const updated: ProjectBoundTeam[] = []
		for (const bindingInput of input.bindings) {
			const current = await this.teamBindingService.findOne(bindingInput.id)
			if (current.projectId !== input.projectId) {
				throw new BadRequestException('Team binding does not belong to the selected project')
			}

			const nextBinding = await this.teamBindingService.update(bindingInput.id, {
				role: bindingInput.role,
				sortOrder: bindingInput.sortOrder
			})
			if (this.isUpdateResult(nextBinding)) {
				throw new BadRequestException(`Team binding ${bindingInput.id} update did not return the updated entity`)
			}

			const team = await this.teamDefinitionService.findOne(nextBinding.teamId)
			updated.push({
				binding: nextBinding,
				team
			})
		}

		return updated
	}

	async removeProjectTeamBinding(projectId: ProjectId, bindingId: string) {
		const binding = await this.teamBindingService.findOne(bindingId)
		if (binding.projectId !== projectId) {
			throw new BadRequestException('Team binding does not belong to the selected project')
		}

		await this.teamBindingService.delete(bindingId)
		return {
			removed: true,
			bindingId
		}
	}

	async reorderProjectTasks(projectId: ProjectId, swimlaneId: string, orderedTaskIds: string[]) {
		await this.loadProjectLane(projectId, swimlaneId)
		return this.projectTaskService.reorderInLane(swimlaneId, orderedTaskIds)
	}

	async moveProjectTasks(projectId: ProjectId, taskIds: string[], targetSwimlaneId: string) {
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
		projectId: ProjectId
		goal: string
		strategyType: ProjectSprintStrategyEnum
		status?: ProjectSprintStatusEnum
		startAt?: Date
		endAt?: Date
		carryOverSprintId?: SprintId
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
		projectId: ProjectId
		sprintId: SprintId
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
		projectId: ProjectId
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

	async getProjectExecutionSnapshot(projectId: ProjectId, sprintId?: SprintId | null) {
		const context = await this.resolveContext(projectId, sprintId)
		return context.executionSnapshot
	}

	private async loadProjectLane(projectId: ProjectId, swimlaneId: string) {
		const swimlane = await this.projectSwimlaneService.findOne(swimlaneId)
		if (swimlane.projectId !== projectId) {
			throw new BadRequestException('Swimlane does not belong to the selected project')
		}
		return swimlane
	}

	private isUpdateResult(value: IProjectTeamBinding | UpdateResult): value is UpdateResult {
		return 'affected' in value
	}
}
