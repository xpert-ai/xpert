import {
	createProjectId,
	createSprintId,
	createTeamId,
	createXpertId,
	ProjectAgentRole,
	ProjectExecutionEnvironmentType,
	ProjectTaskDispatchSkippedReasonEnum,
	ProjectTaskStatusEnum
} from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { ProjectCoreService } from '../project-core/project-core.service'
import { ProjectSwimlane } from '../project-swimlane/project-swimlane.entity'
import { ProjectTask } from '../project-task/project-task.entity'
import { ProjectTeamBinding } from '../team-binding/project-team-binding.entity'
import { TeamDefinitionService } from '../team-definition/team-definition.service'
import { ProjectTaskAssignmentService } from './project-task-assignment.service'

jest.mock('../project-core/project-core.service', () => ({
	ProjectCoreService: class ProjectCoreService {}
}))
jest.mock('../team-definition/team-definition.service', () => ({
	TeamDefinitionService: class TeamDefinitionService {}
}))

describe('ProjectTaskAssignmentService', () => {
	let service: ProjectTaskAssignmentService
	let taskRepository: {
		count: jest.Mock
		update: jest.Mock
	}
	let teamBindingRepository: {
		find: jest.Mock
		findOne: jest.Mock
	}
	let projectCoreService: {
		findOne: jest.Mock
	}
	let teamDefinitionService: {
		findOne: jest.Mock
	}
	const projectId = createProjectId('project-1')
	const sprintId = createSprintId('sprint-1')
	const lane = {
		id: 'lane-coding',
		projectId,
		sprintId,
		key: 'coding',
		agentRole: ProjectAgentRole.Coder,
		environmentType: ProjectExecutionEnvironmentType.Container
	} as ProjectSwimlane

	beforeEach(() => {
		taskRepository = {
			count: jest.fn().mockResolvedValue(0),
			update: jest.fn().mockResolvedValue({ affected: 1 })
		}
		teamBindingRepository = {
			find: jest.fn().mockResolvedValue([]),
			findOne: jest.fn().mockResolvedValue(null)
		}
		projectCoreService = {
			findOne: jest.fn().mockResolvedValue({
				id: projectId,
				mainAssistantId: createXpertId('assistant-main')
			})
		}
		teamDefinitionService = {
			findOne: jest.fn((teamId: string) =>
				Promise.resolve({
					id: teamId,
					leadAssistantId:
						teamId === createTeamId('team-main')
							? createXpertId('assistant-main')
							: createXpertId(`${teamId}-assistant`)
				})
			)
		}

		service = new ProjectTaskAssignmentService(
			taskRepository as unknown as Repository<ProjectTask>,
			teamBindingRepository as unknown as Repository<ProjectTeamBinding>,
			projectCoreService as unknown as ProjectCoreService,
			teamDefinitionService as unknown as TeamDefinitionService
		)
	})

	it('assigns a missing teamId from matching typed binding capability', async () => {
		teamBindingRepository.find.mockResolvedValueOnce([
			createBinding({
				teamId: createTeamId('team-low'),
				assignmentPriority: 1,
				sortOrder: 0
			}),
			createBinding({
				teamId: createTeamId('team-high'),
				assignmentPriority: 2,
				sortOrder: 1
			})
		])
		const task = createTask()

		const result = await service.validateOrAssignTaskTeam(task, lane)

		expect(result.assigned).toBe(true)
		expect(taskRepository.update).toHaveBeenCalledWith('task-1', {
			teamId: createTeamId('team-high')
		})
		if (result.assigned === true) {
			expect(result.binding.teamId).toEqual(createTeamId('team-high'))
		}
	})

	it('does not auto-assign bindings without agentRoles', async () => {
		teamBindingRepository.find.mockResolvedValueOnce([
			createBinding({
				teamId: createTeamId('team-manual'),
				agentRoles: []
			})
		])

		const result = await service.validateOrAssignTaskTeam(createTask(), lane)

		expect(result.assigned).toBe(false)
		if (result.assigned === false) {
			expect(result.reason).toBe(ProjectTaskDispatchSkippedReasonEnum.NoMatchingTeam)
		}
		expect(taskRepository.update).not.toHaveBeenCalled()
	})

	it('does not auto-assign a binding backed by the project main assistant', async () => {
		teamBindingRepository.find.mockResolvedValueOnce([
			createBinding({
				teamId: createTeamId('team-main'),
				assignmentPriority: 10,
				sortOrder: 0
			}),
			createBinding({
				teamId: createTeamId('team-worker'),
				assignmentPriority: 1,
				sortOrder: 1
			})
		])

		const result = await service.validateOrAssignTaskTeam(createTask(), lane)

		expect(result.assigned).toBe(true)
		expect(taskRepository.update).toHaveBeenCalledWith('task-1', {
			teamId: createTeamId('team-worker')
		})
	})

	it('returns capacity_full when matching teams are at their limit', async () => {
		taskRepository.count.mockResolvedValueOnce(1)
		teamBindingRepository.find.mockResolvedValueOnce([
			createBinding({
				teamId: createTeamId('team-full'),
				maxConcurrentTasks: 1
			})
		])

		const result = await service.validateOrAssignTaskTeam(createTask(), lane)

		expect(result.assigned).toBe(false)
		if (result.assigned === false) {
			expect(result.reason).toBe(ProjectTaskDispatchSkippedReasonEnum.CapacityFull)
		}
	})

	it('accepts manually assigned bindings without agentRoles', async () => {
		const teamId = createTeamId('team-manual')
		teamBindingRepository.findOne.mockResolvedValueOnce(
			createBinding({
				teamId,
				agentRoles: []
			})
		)

		const result = await service.validateOrAssignTaskTeam(
			createTask({
				teamId
			}),
			lane
		)

		expect(result.assigned).toBe(true)
	})

	it('rejects manually assigned bindings with incompatible capability', async () => {
		const teamId = createTeamId('team-review')
		teamBindingRepository.findOne.mockResolvedValueOnce(
			createBinding({
				teamId,
				agentRoles: [ProjectAgentRole.Reviewer]
			})
		)

		const result = await service.validateOrAssignTaskTeam(
			createTask({
				teamId
			}),
			lane
		)

		expect(result.assigned).toBe(false)
		if (result.assigned === false) {
			expect(result.reason).toBe(ProjectTaskDispatchSkippedReasonEnum.InvalidTeamAssignment)
		}
	})

	it('rejects manually assigned bindings backed by the project main assistant', async () => {
		const teamId = createTeamId('team-main')
		teamBindingRepository.findOne.mockResolvedValueOnce(
			createBinding({
				teamId
			})
		)

		const result = await service.validateOrAssignTaskTeam(
			createTask({
				teamId
			}),
			lane
		)

		expect(result.assigned).toBe(false)
		if (result.assigned === false) {
			expect(result.reason).toBe(ProjectTaskDispatchSkippedReasonEnum.InvalidTeamAssignment)
		}
	})

	function createTask(overrides: Partial<ProjectTask> = {}) {
		return {
			id: 'task-1',
			projectId,
			sprintId,
			swimlaneId: lane.id,
			status: ProjectTaskStatusEnum.Todo,
			dependencies: [],
			...overrides
		} as ProjectTask
	}

	function createBinding(overrides: Partial<ProjectTeamBinding> = {}) {
		return {
			id: 'binding-1',
			projectId,
			teamId: createTeamId('team-1'),
			sortOrder: 0,
			agentRoles: [ProjectAgentRole.Coder],
			environmentTypes: [ProjectExecutionEnvironmentType.Container],
			swimlaneKeys: ['coding'],
			assignmentPriority: 0,
			maxConcurrentTasks: null,
			createdAt: new Date('2024-01-01T00:00:00.000Z'),
			...overrides
		} as ProjectTeamBinding
	}
})
