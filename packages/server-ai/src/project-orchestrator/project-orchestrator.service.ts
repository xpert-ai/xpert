import { ProjectSwimlaneKindEnum, ProjectTaskStatusEnum, SprintId } from '@xpert-ai/contracts'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ProjectSprint } from '../project-sprint/project-sprint.entity'
import { ProjectSwimlane } from '../project-swimlane/project-swimlane.entity'
import { ProjectTask } from '../project-task/project-task.entity'

export interface ProjectSwimlaneExecutionSnapshot {
	lane: ProjectSwimlane
	tasks: ProjectTask[]
	inProgressCount: number
	queuedCount: number
	availableSlots: number
	blockedTaskIds: string[]
	runnableTaskIds: string[]
}

export interface ProjectSprintExecutionSnapshot {
	sprint: ProjectSprint
	lanes: ProjectSwimlaneExecutionSnapshot[]
	blockedTaskIds: string[]
	runnableTasks: Array<{ lane: ProjectSwimlane; task: ProjectTask }>
}

export function buildSprintExecutionSnapshot(
	sprint: ProjectSprint,
	swimlanes: ProjectSwimlane[],
	tasks: ProjectTask[]
): ProjectSprintExecutionSnapshot {
	const tasksById = new Map(tasks.map((task) => [task.id, task]))
	const doneTaskIds = new Set(tasks.filter((task) => task.status === ProjectTaskStatusEnum.Done).map((task) => task.id))
	const tasksByLaneId = new Map<string, ProjectTask[]>()
	const executionSwimlanes = swimlanes.filter(
		(lane) => (lane.kind ?? ProjectSwimlaneKindEnum.Execution) === ProjectSwimlaneKindEnum.Execution
	)

	for (const task of tasks) {
		const laneTasks = tasksByLaneId.get(task.swimlaneId) ?? []
		laneTasks.push(task)
		tasksByLaneId.set(task.swimlaneId, laneTasks)
	}

	const sortedSwimlanes = [...executionSwimlanes].sort(
		(left, right) =>
			right.priority - left.priority || right.weight - left.weight || left.sortOrder - right.sortOrder
	)
	const runnableTasks: Array<{ lane: ProjectSwimlane; task: ProjectTask }> = []
	const blockedTaskIds: string[] = []
	const lanes = sortedSwimlanes.map((lane) => {
		const laneTasks = [...(tasksByLaneId.get(lane.id) ?? [])].sort((left, right) => {
			return left.sortOrder - right.sortOrder || (left.createdAt?.getTime() ?? 0) - (right.createdAt?.getTime() ?? 0)
		})
		const inProgressCount = laneTasks.filter((task) => task.status === ProjectTaskStatusEnum.Doing).length
		const queuedTasks = laneTasks.filter((task) => task.status === ProjectTaskStatusEnum.Todo)
		const slotLimit = Math.min(lane.concurrencyLimit, lane.wipLimit)
		const availableSlots = Math.max(slotLimit - inProgressCount, 0)
		const runnableQueuedTasks = queuedTasks.filter((task) =>
			task.dependencies.every((dependencyId) => {
				const dependencyTask = tasksById.get(dependencyId)
				return dependencyTask ? doneTaskIds.has(dependencyId) : false
			})
		)
		const runnableLaneTasks = runnableQueuedTasks.slice(0, availableSlots)
		const runnableTaskIds = runnableLaneTasks.map((task) => task.id)
		const blockedLaneTaskIds = queuedTasks
			.filter((task) => !runnableTaskIds.includes(task.id))
			.map((task) => task.id)

		for (const task of runnableLaneTasks) {
			runnableTasks.push({ lane, task })
		}
		blockedTaskIds.push(...blockedLaneTaskIds)

		return {
			lane,
			tasks: laneTasks,
			inProgressCount,
			queuedCount: queuedTasks.length,
			availableSlots,
			blockedTaskIds: blockedLaneTaskIds,
			runnableTaskIds
		}
	})

	return {
		sprint,
		lanes,
		blockedTaskIds,
		runnableTasks
	}
}

@Injectable()
export class ProjectOrchestratorService {
	constructor(
		@InjectRepository(ProjectSprint)
		private readonly sprintRepository: Repository<ProjectSprint>,
		@InjectRepository(ProjectSwimlane)
		private readonly swimlaneRepository: Repository<ProjectSwimlane>,
		@InjectRepository(ProjectTask)
		private readonly taskRepository: Repository<ProjectTask>
	) {}

	async getSprintExecutionSnapshot(sprintId: SprintId) {
		const sprint = await this.sprintRepository.findOneBy({ id: sprintId })
		if (!sprint) {
			throw new BadRequestException(`Sprint ${sprintId} was not found`)
		}

		const [swimlanes, tasks] = await Promise.all([
			this.swimlaneRepository.findBy({ sprintId }),
			this.taskRepository.findBy({ sprintId })
		])

		return buildSprintExecutionSnapshot(sprint, swimlanes, tasks)
	}

	async pickRunnableTasks(sprintId: SprintId) {
		const snapshot = await this.getSprintExecutionSnapshot(sprintId)
		return snapshot.runnableTasks.map(({ task }) => task)
	}
}
