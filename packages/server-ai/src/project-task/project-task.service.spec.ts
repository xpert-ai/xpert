import { BadRequestException } from '@nestjs/common'
import {
	createProjectId,
	createSprintId,
	createXpertId,
	ProjectSwimlaneKindEnum,
	ProjectTaskStatusEnum,
	createTeamId
} from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { ProjectCoreService } from '../project-core/project-core.service'
import { ProjectSprint } from '../project-sprint/project-sprint.entity'
import { ProjectSwimlane } from '../project-swimlane/project-swimlane.entity'
import { ProjectTeamBinding } from '../team-binding/project-team-binding.entity'
import { TeamDefinitionService } from '../team-definition/team-definition.service'
import { ProjectTaskExecution } from './project-task-execution.entity'
import { ProjectTask } from './project-task.entity'
import { ProjectTaskService } from './project-task.service'

jest.mock('../project-core/project-core.service', () => ({
	ProjectCoreService: class ProjectCoreService {}
}))
jest.mock('../team-definition/team-definition.service', () => ({
	TeamDefinitionService: class TeamDefinitionService {}
}))

describe('ProjectTaskService', () => {
	let service: ProjectTaskService
	let taskRepository: {
		create: jest.Mock
		save: jest.Mock
		update: jest.Mock
		find: jest.Mock
		findBy: jest.Mock
		findAndCount: jest.Mock
	}
	let sprintRepository: {
		findOneBy: jest.Mock
	}
	let swimlaneRepository: {
		findOneBy: jest.Mock
	}
	let teamBindingRepository: {
		findOne: jest.Mock
	}
	let taskExecutionRepository: {
		find: jest.Mock
	}
	let projectCoreService: {
		findOne: jest.Mock
	}
	let teamDefinitionService: {
		findOne: jest.Mock
	}
	const projectId = createProjectId('project-1')
	const sprintId = createSprintId('sprint-1')

	beforeEach(() => {
		taskRepository = {
			create: jest.fn((value) => value),
			save: jest.fn(async (value) => ({ id: 'task-1', ...value })),
			update: jest.fn(),
			find: jest.fn().mockResolvedValue([]),
			findBy: jest.fn().mockResolvedValue([]),
			findAndCount: jest.fn().mockResolvedValue([[], 0])
		}
		sprintRepository = {
			findOneBy: jest.fn().mockResolvedValue({ id: 'sprint-1', projectId: 'project-1' })
		}
		swimlaneRepository = {
			findOneBy: jest.fn().mockResolvedValue({
				id: 'lane-1',
				projectId: 'project-1',
				sprintId: 'sprint-1',
				kind: ProjectSwimlaneKindEnum.Execution
			})
		}
		teamBindingRepository = {
			findOne: jest.fn().mockResolvedValue(null)
		}
		taskExecutionRepository = {
			find: jest.fn().mockResolvedValue([])
		}
		projectCoreService = {
			findOne: jest.fn().mockResolvedValue({
				id: projectId,
				mainAssistantId: createXpertId('assistant-main')
			})
		}
		teamDefinitionService = {
			findOne: jest.fn().mockResolvedValue({
				id: createTeamId('team-1'),
				leadAssistantId: createXpertId('assistant-delivery')
			})
		}

		service = new ProjectTaskService(
			taskRepository as unknown as Repository<ProjectTask>,
			sprintRepository as unknown as Repository<ProjectSprint>,
			swimlaneRepository as unknown as Repository<ProjectSwimlane>,
			teamBindingRepository as unknown as Repository<ProjectTeamBinding>,
			taskExecutionRepository as unknown as Repository<ProjectTaskExecution>,
			projectCoreService as unknown as ProjectCoreService,
			teamDefinitionService as unknown as TeamDefinitionService
		)
	})

	it('rejects tasks whose swimlane does not belong to the same sprint and project', async () => {
		swimlaneRepository.findOneBy.mockResolvedValue({
			id: 'lane-1',
			projectId: 'project-2',
			sprintId: 'sprint-2'
		})

		await expect(
			service.create({
				projectId,
				sprintId,
				swimlaneId: 'lane-1',
				title: 'Implement feature',
				status: ProjectTaskStatusEnum.Todo,
				dependencies: []
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})

	it('rejects cross-sprint dependencies', async () => {
		taskRepository.findBy.mockResolvedValue([
			{
				id: 'task-dep-1',
				sprintId: 'another-sprint'
			}
		])

		await expect(
			service.create({
				projectId,
				sprintId,
				swimlaneId: 'lane-1',
				title: 'Implement feature',
				status: ProjectTaskStatusEnum.Todo,
				dependencies: ['task-dep-1']
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})

	it('rejects backlog tasks with dependencies or non-todo status', async () => {
		swimlaneRepository.findOneBy.mockResolvedValue({
			id: 'lane-backlog',
			projectId: 'project-1',
			sprintId: 'sprint-1',
			kind: ProjectSwimlaneKindEnum.Backlog
		})

		await expect(
			service.create({
				projectId,
				sprintId,
				swimlaneId: 'lane-backlog',
				title: 'Backlog item',
				status: ProjectTaskStatusEnum.Doing,
				dependencies: ['task-dep-1']
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})

	it('assigns the next sort order when creating a task', async () => {
		taskRepository.find.mockResolvedValueOnce([
			{
				id: 'task-0',
				sortOrder: 2
			}
		])

		await service.create({
			projectId,
			sprintId,
			swimlaneId: 'lane-1',
			title: 'Implement feature',
			status: ProjectTaskStatusEnum.Todo,
			dependencies: []
		})

		expect(taskRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				sortOrder: 3
			})
		)
	})

	it('rejects team ids that are not bound to the project', async () => {
		await expect(
			service.create({
				projectId,
				sprintId,
				swimlaneId: 'lane-1',
				title: 'Implement feature',
				status: ProjectTaskStatusEnum.Todo,
				dependencies: [],
				teamId: createTeamId('team-1')
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})

	it('accepts team ids that are already bound to the project', async () => {
		teamBindingRepository.findOne.mockResolvedValueOnce({
			id: 'binding-1',
			projectId: 'project-1',
			teamId: createTeamId('team-1')
		})

		await service.create({
			projectId,
			sprintId,
			swimlaneId: 'lane-1',
			title: 'Implement feature',
			status: ProjectTaskStatusEnum.Todo,
			dependencies: [],
			teamId: createTeamId('team-1')
		})

		expect(taskRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				teamId: createTeamId('team-1')
			})
		)
	})

	it('rejects bound team ids backed by the project main assistant', async () => {
		teamBindingRepository.findOne.mockResolvedValueOnce({
			id: 'binding-1',
			projectId: 'project-1',
			teamId: createTeamId('team-main')
		})
		teamDefinitionService.findOne.mockResolvedValueOnce({
			id: createTeamId('team-main'),
			leadAssistantId: createXpertId('assistant-main')
		})

		await expect(
			service.create({
				projectId,
				sprintId,
				swimlaneId: 'lane-1',
				title: 'Implement feature',
				status: ProjectTaskStatusEnum.Todo,
				dependencies: [],
				teamId: createTeamId('team-main')
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})

	it('reorders tasks within a lane', async () => {
		taskRepository.find
			.mockResolvedValueOnce([
				{ id: 'task-1', swimlaneId: 'lane-1', sortOrder: 0 },
				{ id: 'task-2', swimlaneId: 'lane-1', sortOrder: 1 }
			])
			.mockResolvedValueOnce([
				{ id: 'task-2', swimlaneId: 'lane-1', sortOrder: 0 },
				{ id: 'task-1', swimlaneId: 'lane-1', sortOrder: 1 }
			])

		const result = await service.reorderInLane('lane-1', ['task-2', 'task-1'])

		expect(taskRepository.save).toHaveBeenCalledTimes(2)
		expect(result.map((task) => task.id)).toEqual(['task-2', 'task-1'])
	})

	it('allows backlog-to-backlog carry over across sprints but rejects execution carry over', async () => {
		taskRepository.findBy
			.mockResolvedValueOnce([
				{
					id: 'task-1',
					projectId: 'project-1',
					sprintId: 'sprint-1',
					swimlaneId: 'lane-backlog-1',
					status: ProjectTaskStatusEnum.Todo,
					dependencies: []
				}
			])
			.mockResolvedValueOnce([
				{
					id: 'task-1',
					projectId: 'project-1',
					sprintId: 'sprint-2',
					swimlaneId: 'lane-backlog-2',
					status: ProjectTaskStatusEnum.Todo,
					dependencies: []
				}
			])
			.mockResolvedValueOnce([
				{
					id: 'task-2',
					projectId: 'project-1',
					sprintId: 'sprint-1',
					swimlaneId: 'lane-1',
					status: ProjectTaskStatusEnum.Todo,
					dependencies: []
				}
			])

		taskRepository.find.mockResolvedValue([
			{
				id: 'existing-target-task',
				sortOrder: 0
			}
		])

		swimlaneRepository.findOneBy.mockImplementation(async ({ id }: { id: string }) => {
			if (id === 'lane-backlog-1') {
				return {
					id,
					projectId: 'project-1',
					sprintId: 'sprint-1',
					kind: ProjectSwimlaneKindEnum.Backlog
				}
			}
			if (id === 'lane-backlog-2') {
				return {
					id,
					projectId: 'project-1',
					sprintId: 'sprint-2',
					kind: ProjectSwimlaneKindEnum.Backlog
				}
			}
			return {
				id,
				projectId: 'project-1',
				sprintId: 'sprint-2',
				kind: ProjectSwimlaneKindEnum.Execution
			}
		})

		await expect(service.moveTasks(['task-1'], 'lane-backlog-2')).resolves.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'task-1'
				})
			])
		)

		await expect(service.moveTasks(['task-2'], 'lane-execution-2')).rejects.toBeInstanceOf(
			BadRequestException
		)
	})

	it('resets moved tasks when sending them into a backlog swimlane', async () => {
		taskRepository.findBy
			.mockResolvedValueOnce([
				{
					id: 'task-1',
					projectId: 'project-1',
					sprintId: 'sprint-1',
					swimlaneId: 'lane-1',
					status: ProjectTaskStatusEnum.Doing,
					dependencies: ['task-dep-1']
				}
			])
			.mockResolvedValueOnce([
				{
					id: 'task-1',
					projectId: 'project-1',
					sprintId: 'sprint-1',
					swimlaneId: 'lane-backlog-1',
					status: ProjectTaskStatusEnum.Todo,
					dependencies: []
				}
			])

		taskRepository.find.mockResolvedValue([{ id: 'existing-target-task', sortOrder: 0 }])

		swimlaneRepository.findOneBy.mockImplementation(async ({ id }: { id: string }) => {
			if (id === 'lane-1') {
				return {
					id,
					projectId: 'project-1',
					sprintId: 'sprint-1',
					kind: ProjectSwimlaneKindEnum.Execution
				}
			}

			return {
				id,
				projectId: 'project-1',
				sprintId: 'sprint-1',
				kind: ProjectSwimlaneKindEnum.Backlog
			}
		})

		const [result] = await service.moveTasks(['task-1'], 'lane-backlog-1')

		expect(taskRepository.save).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'task-1',
				swimlaneId: 'lane-backlog-1',
				status: ProjectTaskStatusEnum.Todo,
				dependencies: []
			})
		)
		expect(result).toEqual(
			expect.objectContaining({
				id: 'task-1',
				swimlaneId: 'lane-backlog-1',
				status: ProjectTaskStatusEnum.Todo,
				dependencies: []
			})
		)
	})

	it('attaches the latest task execution when listing tasks', async () => {
		const task = {
			id: 'task-1',
			projectId,
			sprintId,
			swimlaneId: 'lane-1',
			status: ProjectTaskStatusEnum.Failed,
			dependencies: []
		} as ProjectTask
		const latestExecution = {
			id: 'execution-new',
			taskId: 'task-1',
			status: 'failed',
			error: 'missing_task_outcome'
		} as ProjectTaskExecution
		const olderExecution = {
			id: 'execution-old',
			taskId: 'task-1',
			status: 'failed',
			error: 'older error'
		} as ProjectTaskExecution
		taskRepository.findAndCount.mockResolvedValueOnce([[task], 1])
		taskExecutionRepository.find.mockResolvedValueOnce([latestExecution, olderExecution])

		const result = await service.findAll({
			where: {
				projectId
			}
		})

		expect(taskExecutionRepository.find).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					taskId: expect.any(Object)
				}
			})
		)
		expect(result.items[0].latestExecution).toBe(latestExecution)
	})
})
