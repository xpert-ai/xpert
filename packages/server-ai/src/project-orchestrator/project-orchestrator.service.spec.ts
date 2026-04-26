import {
	createProjectId,
	createSprintId,
	createTeamId,
	createXpertId,
	ProjectAgentRole,
	ProjectExecutionEnvironmentType,
	ProjectSprintStatusEnum,
	ProjectSwimlaneKindEnum,
	ProjectTaskDispatchSkippedReasonEnum,
	ProjectTaskExecutionStatusEnum,
	ProjectTaskStatusEnum
} from '@xpert-ai/contracts'
import { HandoffQueueService } from '../handoff/message-queue.service'
import { Repository } from 'typeorm'
import { ProjectTaskExecution } from '../project-task/project-task-execution.entity'
import { ProjectTeamBinding } from '../team-binding/project-team-binding.entity'
import { TeamDefinitionService } from '../team-definition/team-definition.service'
import { ProjectTaskAssignmentService } from './project-task-assignment.service'
import { PROJECT_TASK_DISPATCH_MESSAGE_TYPE } from './project-task-dispatch.constants'
jest.mock('../team-definition/team-definition.service', () => ({
	TeamDefinitionService: class TeamDefinitionService {}
}))
jest.mock('../project-core/project-core.service', () => ({
	ProjectCoreService: class ProjectCoreService {}
}))
import { buildSprintExecutionSnapshot, ProjectOrchestratorService } from './project-orchestrator.service'
import { ProjectSprint } from '../project-sprint/project-sprint.entity'
import { ProjectSwimlane } from '../project-swimlane/project-swimlane.entity'
import { ProjectTask } from '../project-task/project-task.entity'

describe('buildSprintExecutionSnapshot', () => {
	it('filters blocked tasks and applies lane concurrency and wip limits', () => {
		const sprint = {
			id: 'sprint-1'
		} as ProjectSprint
		const swimlanes = [
			{
				id: 'lane-high',
				kind: ProjectSwimlaneKindEnum.Execution,
				priority: 2,
				weight: 2,
				sortOrder: 1,
				concurrencyLimit: 2,
				wipLimit: 2
			},
			{
				id: 'lane-low',
				kind: ProjectSwimlaneKindEnum.Execution,
				priority: 1,
				weight: 1,
				sortOrder: 2,
				concurrencyLimit: 1,
				wipLimit: 1
			},
			{
				id: 'lane-backlog',
				kind: ProjectSwimlaneKindEnum.Backlog,
				priority: 100,
				weight: 100,
				sortOrder: 0,
				concurrencyLimit: 0,
				wipLimit: 0
			}
		] as ProjectSwimlane[]
		const tasks = [
			{
				id: 'task-dependency',
				swimlaneId: 'lane-high',
				status: ProjectTaskStatusEnum.Done,
				dependencies: [],
				sortOrder: 0,
				createdAt: new Date('2024-01-01T00:00:00.000Z')
			},
			{
				id: 'task-running',
				swimlaneId: 'lane-high',
				status: ProjectTaskStatusEnum.Doing,
				dependencies: [],
				sortOrder: 1,
				createdAt: new Date('2024-01-01T00:01:00.000Z')
			},
			{
				id: 'task-ready',
				swimlaneId: 'lane-high',
				status: ProjectTaskStatusEnum.Todo,
				dependencies: ['task-dependency'],
				sortOrder: 2,
				createdAt: new Date('2024-01-01T00:02:00.000Z')
			},
			{
				id: 'task-waiting-for-slot',
				swimlaneId: 'lane-high',
				status: ProjectTaskStatusEnum.Todo,
				dependencies: [],
				sortOrder: 3,
				createdAt: new Date('2024-01-01T00:03:00.000Z')
			},
			{
				id: 'task-blocked',
				swimlaneId: 'lane-high',
				status: ProjectTaskStatusEnum.Todo,
				dependencies: ['task-missing'],
				sortOrder: 4,
				createdAt: new Date('2024-01-01T00:04:00.000Z')
			},
			{
				id: 'task-low-lane',
				swimlaneId: 'lane-low',
				status: ProjectTaskStatusEnum.Todo,
				dependencies: [],
				sortOrder: 0,
				createdAt: new Date('2024-01-01T00:05:00.000Z')
			},
			{
				id: 'task-backlog',
				swimlaneId: 'lane-backlog',
				status: ProjectTaskStatusEnum.Todo,
				dependencies: [],
				sortOrder: 0,
				createdAt: new Date('2024-01-01T00:05:00.000Z')
			}
		] as ProjectTask[]

		const snapshot = buildSprintExecutionSnapshot(sprint, swimlanes, tasks)

		expect(snapshot.runnableTasks.map(({ task }) => task.id)).toEqual(['task-ready', 'task-low-lane'])
		expect(snapshot.runnableTasks.map(({ task }) => task.id)).not.toContain('task-backlog')
		expect(snapshot.blockedTaskIds).toEqual(expect.arrayContaining(['task-waiting-for-slot', 'task-blocked']))
		expect(snapshot.lanes[0]).toEqual(
			expect.objectContaining({
				availableSlots: 1,
				runnableTaskIds: ['task-ready']
			})
		)
	})
})

describe('ProjectOrchestratorService.dispatchRunnableTasks', () => {
	const projectId = createProjectId('project-1')
	const sprintId = createSprintId('sprint-1')
	const teamId = createTeamId('team-1')
	const xpertId = createXpertId('xpert-1')
	let service: ProjectOrchestratorService
	let sprintRepository: { findOne: jest.Mock }
	let swimlaneRepository: { findBy: jest.Mock }
	let taskRepository: {
		manager: { transaction: jest.Mock }
		findBy: jest.Mock
		findOne: jest.Mock
		update: jest.Mock
	}
	let taskExecutionRepository: {
		create: jest.Mock
		save: jest.Mock
		update: jest.Mock
	}
	let taskAssignmentService: { validateOrAssignTaskTeam: jest.Mock }
	let teamDefinitionService: { findOne: jest.Mock }
	let handoffQueueService: { enqueue: jest.Mock }

	beforeEach(() => {
		sprintRepository = {
			findOne: jest.fn()
		}
		swimlaneRepository = {
			findBy: jest.fn()
		}
		taskExecutionRepository = {
			create: jest.fn((value) => value),
			save: jest.fn(async (value) => ({ id: 'execution-1', ...value })),
			update: jest.fn()
		}
		taskRepository = {
			manager: {
				transaction: jest.fn((handler) =>
					handler({
						getRepository: (entity: Function) => {
							if (entity === ProjectSprint) {
								return sprintRepository
							}
							if (entity === ProjectSwimlane) {
								return swimlaneRepository
							}
							if (entity === ProjectTask) {
								return taskRepository
							}
							if (entity === ProjectTaskExecution) {
								return taskExecutionRepository
							}
							throw new Error(`Unexpected repository ${entity.name}`)
						}
					})
				)
			},
			findBy: jest.fn(),
			findOne: jest.fn(),
			update: jest.fn()
		}
		taskAssignmentService = {
			validateOrAssignTaskTeam: jest.fn()
		}
		teamDefinitionService = {
			findOne: jest.fn().mockResolvedValue({ id: teamId, leadAssistantId: xpertId })
		}
		handoffQueueService = {
			enqueue: jest.fn().mockResolvedValue({ id: 'dispatch-1' })
		}

		service = new ProjectOrchestratorService(
			sprintRepository as unknown as Repository<ProjectSprint>,
			swimlaneRepository as unknown as Repository<ProjectSwimlane>,
			taskRepository as unknown as Repository<ProjectTask>,
			taskExecutionRepository as unknown as Repository<ProjectTaskExecution>,
			taskAssignmentService as unknown as ProjectTaskAssignmentService,
			teamDefinitionService as unknown as TeamDefinitionService,
			handoffQueueService as unknown as HandoffQueueService
		)
	})

	it('skips dispatch for planned sprints', async () => {
		sprintRepository.findOne.mockResolvedValueOnce({
			id: sprintId,
			status: ProjectSprintStatusEnum.Planned
		})

		const result = await service.dispatchRunnableTasks(sprintId)

		expect(result.dispatched).toEqual([])
		expect(result.skipped).toEqual([
			expect.objectContaining({
				reason: ProjectTaskDispatchSkippedReasonEnum.SprintNotRunning
			})
		])
		expect(handoffQueueService.enqueue).not.toHaveBeenCalled()
	})

	it('claims and enqueues runnable tasks for running sprints', async () => {
		const lane = {
			id: 'lane-1',
			projectId,
			sprintId,
			key: 'coding',
			kind: ProjectSwimlaneKindEnum.Execution,
			priority: 1,
			weight: 1,
			sortOrder: 0,
			concurrencyLimit: 1,
			wipLimit: 1,
			agentRole: ProjectAgentRole.Coder,
			environmentType: ProjectExecutionEnvironmentType.Container
		} as ProjectSwimlane
		const task = {
			id: 'task-1',
			projectId,
			sprintId,
			swimlaneId: lane.id,
			status: ProjectTaskStatusEnum.Todo,
			dependencies: [],
			sortOrder: 0,
			title: 'Implement feature',
			tenantId: 'tenant-1',
			organizationId: 'organization-1'
		} as ProjectTask
		const binding = {
			id: 'binding-1',
			projectId,
			teamId,
			sortOrder: 0
		} as ProjectTeamBinding
		sprintRepository.findOne.mockResolvedValueOnce({
			id: sprintId,
			status: ProjectSprintStatusEnum.Running
		})
		swimlaneRepository.findBy.mockResolvedValueOnce([lane])
		taskRepository.findBy.mockResolvedValueOnce([task])
		taskRepository.findOne.mockResolvedValueOnce(task)
		taskAssignmentService.validateOrAssignTaskTeam.mockResolvedValueOnce({
			assigned: true,
			task,
			binding
		})

		const result = await service.dispatchRunnableTasks(sprintId)

		expect(taskRepository.update).toHaveBeenCalledWith('task-1', {
			status: ProjectTaskStatusEnum.Doing,
			teamId,
			assignedAgentId: xpertId
		})
		expect(taskExecutionRepository.save).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId,
				sprintId,
				taskId: 'task-1',
				teamId,
				xpertId,
				status: ProjectTaskExecutionStatusEnum.Pending
			})
		)
		expect(handoffQueueService.enqueue).toHaveBeenCalledWith(
			expect.objectContaining({
				type: PROJECT_TASK_DISPATCH_MESSAGE_TYPE,
				payload: {
					taskExecutionId: 'execution-1'
				}
			})
		)
		expect(result.dispatched).toEqual([
			expect.objectContaining({
				taskId: 'task-1',
				taskExecutionId: 'execution-1',
				teamId,
				xpertId
			})
		])
	})

	it('does not dispatch tasks that are already doing', async () => {
		const lane = {
			id: 'lane-1',
			projectId,
			sprintId,
			key: 'coding',
			kind: ProjectSwimlaneKindEnum.Execution,
			priority: 1,
			weight: 1,
			sortOrder: 0,
			concurrencyLimit: 1,
			wipLimit: 1,
			agentRole: ProjectAgentRole.Coder,
			environmentType: ProjectExecutionEnvironmentType.Container
		} as ProjectSwimlane
		const task = {
			id: 'task-1',
			projectId,
			sprintId,
			swimlaneId: lane.id,
			status: ProjectTaskStatusEnum.Doing,
			dependencies: [],
			sortOrder: 0,
			title: 'Already claimed',
			tenantId: 'tenant-1'
		} as ProjectTask
		sprintRepository.findOne.mockResolvedValueOnce({
			id: sprintId,
			status: ProjectSprintStatusEnum.Running
		})
		swimlaneRepository.findBy.mockResolvedValueOnce([lane])
		taskRepository.findBy.mockResolvedValueOnce([task])

		const result = await service.dispatchRunnableTasks(sprintId)

		expect(result.dispatched).toEqual([])
		expect(result.skipped).toEqual([])
		expect(taskAssignmentService.validateOrAssignTaskTeam).not.toHaveBeenCalled()
		expect(taskExecutionRepository.save).not.toHaveBeenCalled()
		expect(handoffQueueService.enqueue).not.toHaveBeenCalled()
	})
})
