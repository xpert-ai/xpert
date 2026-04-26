import {
	ProjectTaskDispatchSkippedReasonEnum,
	ProjectTaskStatusEnum
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import { ProjectCoreService } from '../project-core/project-core.service'
import { ProjectSwimlane } from '../project-swimlane/project-swimlane.entity'
import { ProjectTask } from '../project-task/project-task.entity'
import { ProjectTeamBinding } from '../team-binding/project-team-binding.entity'
import { TeamDefinitionService } from '../team-definition/team-definition.service'

export interface ProjectTaskTeamAssignmentContext {
	reservedTeamCounts?: Map<string, number>
}

export interface ProjectTaskTeamAssignmentSuccess {
	assigned: true
	task: ProjectTask
	binding: ProjectTeamBinding
}

export interface ProjectTaskTeamAssignmentSkipped {
	assigned: false
	task: ProjectTask
	reason: ProjectTaskDispatchSkippedReasonEnum
	message: string
}

export type ProjectTaskTeamAssignmentResult =
	| ProjectTaskTeamAssignmentSuccess
	| ProjectTaskTeamAssignmentSkipped

@Injectable()
export class ProjectTaskAssignmentService {
	constructor(
		@InjectRepository(ProjectTask)
		private readonly taskRepository: Repository<ProjectTask>,
		@InjectRepository(ProjectTeamBinding)
		private readonly teamBindingRepository: Repository<ProjectTeamBinding>,
		private readonly projectCoreService: ProjectCoreService,
		private readonly teamDefinitionService: TeamDefinitionService
	) {}

	async validateOrAssignTaskTeam(
		task: ProjectTask,
		lane: ProjectSwimlane,
		context: ProjectTaskTeamAssignmentContext = {},
		manager?: EntityManager
	): Promise<ProjectTaskTeamAssignmentResult> {
		if (task.teamId) {
			return this.validateAssignedTeam(task, lane, context, manager)
		}

		const candidateResult = await this.findAutoAssignmentCandidates(task, lane, context, manager)
		if (!candidateResult.candidates.length) {
			return {
				assigned: false,
				task,
				reason: candidateResult.capacityFull
					? ProjectTaskDispatchSkippedReasonEnum.CapacityFull
					: ProjectTaskDispatchSkippedReasonEnum.NoMatchingTeam,
				message: candidateResult.capacityFull
					? 'Matching bound teams are already at their project task concurrency limit.'
					: 'No bound team capability matches this task lane.'
			}
		}

		const [candidate] = candidateResult.candidates
		task.teamId = candidate.binding.teamId
		await this.getTaskRepository(manager).update(task.id, {
			teamId: candidate.binding.teamId
		})

		return {
			assigned: true,
			task,
			binding: candidate.binding
		}
	}

	private async validateAssignedTeam(
		task: ProjectTask,
		lane: ProjectSwimlane,
		context: ProjectTaskTeamAssignmentContext,
		manager?: EntityManager
	): Promise<ProjectTaskTeamAssignmentResult> {
		const binding = await this.getTeamBindingRepository(manager).findOne({
			where: {
				projectId: task.projectId,
				teamId: task.teamId
			}
		})

		if (!binding) {
			return {
				assigned: false,
				task,
				reason: ProjectTaskDispatchSkippedReasonEnum.InvalidTeamAssignment,
				message: 'Task teamId is not bound to the selected project.'
			}
		}

		if (await this.isMainAssistantTeam(task.projectId, binding)) {
			return {
				assigned: false,
				task,
				reason: ProjectTaskDispatchSkippedReasonEnum.InvalidTeamAssignment,
				message: 'Task teamId targets the project main assistant, which cannot execute project tasks.'
			}
		}

		if (!bindingMatchesLane(binding, lane, { allowEmptyAgentRoles: true })) {
			return {
				assigned: false,
				task,
				reason: ProjectTaskDispatchSkippedReasonEnum.InvalidTeamAssignment,
				message: 'Task teamId is bound but does not match the lane routing capability.'
			}
		}

		if (await this.isCapacityFull(task.projectId, binding, context, manager)) {
			return {
				assigned: false,
				task,
				reason: ProjectTaskDispatchSkippedReasonEnum.CapacityFull,
				message: 'The assigned team is already at its project task concurrency limit.'
			}
		}

		return {
			assigned: true,
			task,
			binding
		}
	}

	private async findAutoAssignmentCandidates(
		task: ProjectTask,
		lane: ProjectSwimlane,
		context: ProjectTaskTeamAssignmentContext,
		manager?: EntityManager
	) {
		const bindings = await this.getTeamBindingRepository(manager).find({
			where: {
				projectId: task.projectId
			},
			order: {
				assignmentPriority: 'DESC',
				sortOrder: 'ASC',
				createdAt: 'ASC'
			}
		})

		const candidates: Array<{
			binding: ProjectTeamBinding
			runningCount: number
		}> = []
		let capacityFull = false

		for (const binding of bindings) {
			if (await this.isMainAssistantTeam(task.projectId, binding)) {
				continue
			}

			if (!bindingMatchesLane(binding, lane, { allowEmptyAgentRoles: false })) {
				continue
			}

			const runningCount = await this.countRunningTasksForTeam(task.projectId, binding, manager)
			const reservedCount = context.reservedTeamCounts?.get(binding.teamId) ?? 0
			if (isBindingCapacityFull(binding, runningCount + reservedCount)) {
				capacityFull = true
				continue
			}

			candidates.push({
				binding,
				runningCount
			})
		}

		return {
			capacityFull,
			candidates: candidates.sort((left, right) => {
				return (
					right.binding.assignmentPriority - left.binding.assignmentPriority ||
					left.runningCount - right.runningCount ||
					left.binding.sortOrder - right.binding.sortOrder ||
					(left.binding.createdAt?.getTime() ?? 0) - (right.binding.createdAt?.getTime() ?? 0)
				)
			})
		}
	}

	private async isCapacityFull(
		projectId: ProjectTask['projectId'],
		binding: ProjectTeamBinding,
		context: ProjectTaskTeamAssignmentContext,
		manager?: EntityManager
	) {
		const runningCount = await this.countRunningTasksForTeam(projectId, binding, manager)
		const reservedCount = context.reservedTeamCounts?.get(binding.teamId) ?? 0
		return isBindingCapacityFull(binding, runningCount + reservedCount)
	}

	private countRunningTasksForTeam(
		projectId: ProjectTask['projectId'],
		binding: ProjectTeamBinding,
		manager?: EntityManager
	) {
		return this.getTaskRepository(manager).count({
			where: {
				projectId,
				teamId: binding.teamId,
				status: ProjectTaskStatusEnum.Doing
			}
		})
	}

	private getTaskRepository(manager?: EntityManager) {
		return manager?.getRepository(ProjectTask) ?? this.taskRepository
	}

	private getTeamBindingRepository(manager?: EntityManager) {
		return manager?.getRepository(ProjectTeamBinding) ?? this.teamBindingRepository
	}

	private async isMainAssistantTeam(projectId: ProjectTask['projectId'], binding: ProjectTeamBinding) {
		const [project, team] = await Promise.all([
			this.projectCoreService.findOne(projectId),
			this.teamDefinitionService.findOne(binding.teamId).catch(() => null)
		])
		return !!project.mainAssistantId && team?.leadAssistantId === project.mainAssistantId
	}
}

function bindingMatchesLane(
	binding: ProjectTeamBinding,
	lane: ProjectSwimlane,
	options: { allowEmptyAgentRoles: boolean }
) {
	const agentRoles = binding.agentRoles ?? []
	if (!agentRoles.length) {
		if (!options.allowEmptyAgentRoles) {
			return false
		}
	} else if (!agentRoles.includes(lane.agentRole)) {
		return false
	}

	const environmentTypes = binding.environmentTypes ?? []
	if (environmentTypes.length && !environmentTypes.includes(lane.environmentType)) {
		return false
	}

	const swimlaneKeys = binding.swimlaneKeys ?? []
	if (swimlaneKeys.length && !swimlaneKeys.includes(lane.key)) {
		return false
	}

	return true
}

function isBindingCapacityFull(binding: ProjectTeamBinding, runningCount: number) {
	return typeof binding.maxConcurrentTasks === 'number' && runningCount >= binding.maxConcurrentTasks
}
