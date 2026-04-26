import {
	IProjectTaskDispatchResult,
	ProjectSprintStatusEnum,
	ProjectSwimlaneKindEnum,
	ProjectTaskDispatchSkippedReasonEnum,
	ProjectTaskExecutionStatusEnum,
	ProjectTaskStatusEnum,
	SprintId,
	XPERT_EVENT_TYPES,
	XpertProjectTaskEventPayload
} from '@xpert-ai/contracts'
import { BadRequestException, Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { HandoffMessage, RequestContext } from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'crypto'
import { Repository } from 'typeorm'
import { HandoffQueueService } from '../handoff/message-queue.service'
import { ProjectSprint } from '../project-sprint/project-sprint.entity'
import { ProjectSwimlane } from '../project-swimlane/project-swimlane.entity'
import { ProjectTaskExecution } from '../project-task/project-task-execution.entity'
import { ProjectTask } from '../project-task/project-task.entity'
import { TeamDefinitionService } from '../team-definition/team-definition.service'
import type { ProjectTaskDispatchPayload } from './project-task-dispatch.processor'
import { PROJECT_TASK_DISPATCH_MESSAGE_TYPE } from './project-task-dispatch.constants'
import { ProjectTaskAssignmentService } from './project-task-assignment.service'
import { XpertEventPublisher } from '../event-system'

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

interface PendingProjectTaskDispatch {
	taskId: string
	taskExecutionId: string
	teamId: ProjectTaskExecution['teamId']
	xpertId: ProjectTaskExecution['xpertId']
	dispatchId: string
	projectId: ProjectTaskExecution['projectId']
	sprintId: ProjectTaskExecution['sprintId']
	tenantId: string
	organizationId?: string | null
	userId?: string | null
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
		private readonly taskRepository: Repository<ProjectTask>,
		@InjectRepository(ProjectTaskExecution)
		private readonly taskExecutionRepository: Repository<ProjectTaskExecution>,
		private readonly taskAssignmentService: ProjectTaskAssignmentService,
		private readonly teamDefinitionService: TeamDefinitionService,
		private readonly handoffQueueService: HandoffQueueService,
		@Optional() private readonly eventPublisher?: XpertEventPublisher
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

	async dispatchRunnableTasks(sprintId: SprintId): Promise<IProjectTaskDispatchResult> {
		const transactionResult = await this.taskRepository.manager.transaction(async (manager) => {
			const sprintRepository = manager.getRepository(ProjectSprint)
			const swimlaneRepository = manager.getRepository(ProjectSwimlane)
			const taskRepository = manager.getRepository(ProjectTask)
			const taskExecutionRepository = manager.getRepository(ProjectTaskExecution)
			const sprint = await sprintRepository.findOne({
				where: { id: sprintId },
				lock: { mode: 'pessimistic_write' }
			})

			if (!sprint) {
				throw new BadRequestException(`Sprint ${sprintId} was not found`)
			}

			const skipped: IProjectTaskDispatchResult['skipped'] = []
			const pendingDispatches: PendingProjectTaskDispatch[] = []

			if (sprint.status !== ProjectSprintStatusEnum.Running) {
				skipped.push({
					reason: ProjectTaskDispatchSkippedReasonEnum.SprintNotRunning,
					message: 'Only running sprints can dispatch project tasks.'
				})
				return {
					skipped,
					pendingDispatches
				}
			}

			const [swimlanes, tasks] = await Promise.all([
				swimlaneRepository.findBy({ sprintId }),
				taskRepository.findBy({ sprintId })
			])
			const snapshot = buildSprintExecutionSnapshot(sprint, swimlanes, tasks)
			const laneById = new Map(swimlanes.map((lane) => [lane.id, lane]))
			const reservedTeamCounts = new Map<string, number>()

			for (const runnable of snapshot.runnableTasks) {
				const task = await taskRepository.findOne({
					where: { id: runnable.task.id },
					lock: { mode: 'pessimistic_write' }
				})

				if (!task || task.status !== ProjectTaskStatusEnum.Todo) {
					skipped.push({
						taskId: runnable.task.id,
						reason: ProjectTaskDispatchSkippedReasonEnum.ClaimLost,
						message: 'Task was already claimed or changed before dispatch.'
					})
					continue
				}

				const lane = laneById.get(task.swimlaneId)
				if (!lane) {
					skipped.push({
						taskId: task.id,
						reason: ProjectTaskDispatchSkippedReasonEnum.Blocked,
						message: 'Task lane could not be resolved during dispatch.'
					})
					continue
				}

				const assignment = await this.taskAssignmentService.validateOrAssignTaskTeam(
					task,
					lane,
					{ reservedTeamCounts },
					manager
				)
				if (assignment.assigned === false) {
					skipped.push({
						taskId: task.id,
						reason: assignment.reason,
						message: assignment.message
					})
					continue
				}

				const team = await this.teamDefinitionService.findOne(assignment.binding.teamId).catch(() => null)
				if (!team) {
					skipped.push({
						taskId: task.id,
						reason: ProjectTaskDispatchSkippedReasonEnum.InvalidTeamAssignment,
						message: 'Assigned team no longer resolves to an accessible published Xpert.'
					})
					continue
				}

				const dispatchId = `project-task-dispatch-${randomUUID()}`
				await taskRepository.update(task.id, {
					status: ProjectTaskStatusEnum.Doing,
					teamId: assignment.binding.teamId,
					assignedAgentId: team.leadAssistantId
				})

				const taskExecution = await taskExecutionRepository.save(
					taskExecutionRepository.create({
						projectId: task.projectId,
						sprintId: task.sprintId,
						taskId: task.id,
						teamId: assignment.binding.teamId,
						xpertId: team.leadAssistantId,
						dispatchId,
						status: ProjectTaskExecutionStatusEnum.Pending,
						tenantId: task.tenantId,
						organizationId: task.organizationId ?? null
					})
				)

				reservedTeamCounts.set(
					assignment.binding.teamId,
					(reservedTeamCounts.get(assignment.binding.teamId) ?? 0) + 1
				)

				pendingDispatches.push({
					taskId: task.id,
					taskExecutionId: taskExecution.id,
					teamId: assignment.binding.teamId,
					xpertId: team.leadAssistantId,
					dispatchId,
					projectId: task.projectId,
					sprintId: task.sprintId,
					tenantId: task.tenantId,
					organizationId: task.organizationId ?? null,
					userId: RequestContext.currentUserId() ?? null
				})
			}

			return {
				skipped,
				pendingDispatches
			}
		})

		const dispatched: IProjectTaskDispatchResult['dispatched'] = []
		const skipped: IProjectTaskDispatchResult['skipped'] = [...transactionResult.skipped]

		for (const pending of transactionResult.pendingDispatches) {
			this.publishProjectTaskEvent(XPERT_EVENT_TYPES.ProjectTaskClaimed, pending, {
				task: {
					id: pending.taskId,
					status: ProjectTaskStatusEnum.Doing,
					teamId: pending.teamId,
					assignedAgentId: pending.xpertId
				},
				latestExecution: {
					id: pending.taskExecutionId,
					projectId: pending.projectId,
					sprintId: pending.sprintId,
					taskId: pending.taskId,
					teamId: pending.teamId,
					xpertId: pending.xpertId,
					dispatchId: pending.dispatchId,
					status: ProjectTaskExecutionStatusEnum.Pending
				}
			})
			try {
				await this.handoffQueueService.enqueue(this.buildProjectTaskDispatchMessage(pending))
				this.publishProjectTaskEvent(XPERT_EVENT_TYPES.ProjectTaskDispatchEnqueued, pending)
				dispatched.push({
					taskId: pending.taskId,
					taskExecutionId: pending.taskExecutionId,
					teamId: pending.teamId,
					xpertId: pending.xpertId,
					dispatchId: pending.dispatchId
				})
			} catch (error) {
				await this.markDispatchEnqueueFailure(pending, getErrorMessage(error))
				skipped.push({
					taskId: pending.taskId,
					reason: ProjectTaskDispatchSkippedReasonEnum.ClaimLost,
					message: 'Task was claimed but dispatch enqueue failed.'
				})
			}
		}

		return {
			dispatched,
			skipped
		}
	}

	private buildProjectTaskDispatchMessage(
		pending: PendingProjectTaskDispatch
	): HandoffMessage<ProjectTaskDispatchPayload> {
		return {
			id: pending.dispatchId,
			type: PROJECT_TASK_DISPATCH_MESSAGE_TYPE,
			version: 1,
			tenantId: pending.tenantId,
			sessionKey: pending.taskExecutionId,
			businessKey: pending.taskExecutionId,
			attempt: 1,
			maxAttempts: 1,
			enqueuedAt: Date.now(),
			traceId: pending.taskExecutionId,
			payload: {
				taskExecutionId: pending.taskExecutionId
			},
			headers: {
				...(pending.organizationId ? { organizationId: pending.organizationId } : {}),
				...(pending.userId ? { userId: pending.userId } : {})
			}
		}
	}

	private async markDispatchEnqueueFailure(pending: PendingProjectTaskDispatch, error: string) {
		await Promise.all([
			this.taskExecutionRepository.update(pending.taskExecutionId, {
				status: ProjectTaskExecutionStatusEnum.Failed,
				error,
				completedAt: new Date()
			}),
			this.taskRepository.update(pending.taskId, {
				status: ProjectTaskStatusEnum.Failed
			})
		])
		this.publishProjectTaskEvent(XPERT_EVENT_TYPES.ProjectTaskExecutionFailed, pending, {
			task: {
				id: pending.taskId,
				status: ProjectTaskStatusEnum.Failed
			},
			latestExecution: {
				id: pending.taskExecutionId,
				projectId: pending.projectId,
				sprintId: pending.sprintId,
				taskId: pending.taskId,
				teamId: pending.teamId,
				xpertId: pending.xpertId,
				dispatchId: pending.dispatchId,
				status: ProjectTaskExecutionStatusEnum.Failed,
				error,
				completedAt: new Date()
			},
			error
		})
	}

	private publishProjectTaskEvent(
		type: string,
		pending: PendingProjectTaskDispatch,
		payload?: Partial<XpertProjectTaskEventPayload>
	) {
		this.eventPublisher
			?.publish<XpertProjectTaskEventPayload>({
				type,
				scope: {
					projectId: pending.projectId,
					sprintId: pending.sprintId,
					taskId: pending.taskId,
					taskExecutionId: pending.taskExecutionId,
					xpertId: pending.xpertId
				},
				source: {
					type: 'project',
					id: pending.taskExecutionId
				},
				payload: {
					taskId: pending.taskId,
					taskExecutionId: pending.taskExecutionId,
					dispatchId: pending.dispatchId,
					...payload
				},
				meta: {
					tenantId: pending.tenantId,
					organizationId: pending.organizationId ?? null,
					userId: pending.userId ?? null,
					traceId: pending.taskExecutionId
				}
			})
			.catch(() => null)
	}
}

function getErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message
	}
	if (typeof error === 'string') {
		return error
	}
	return 'Unknown project task dispatch error'
}
