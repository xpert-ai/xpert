import { BadRequestException } from '@nestjs/common'
import { ProjectSwimlaneKindEnum, ProjectTaskStatusEnum } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { ProjectSprint } from '../project-sprint/project-sprint.entity'
import { ProjectSwimlane } from '../project-swimlane/project-swimlane.entity'
import { ProjectTask } from './project-task.entity'
import { ProjectTaskService } from './project-task.service'

describe('ProjectTaskService', () => {
	let service: ProjectTaskService
	let taskRepository: {
		create: jest.Mock
		save: jest.Mock
		update: jest.Mock
		find: jest.Mock
		findBy: jest.Mock
	}
	let sprintRepository: {
		findOneBy: jest.Mock
	}
	let swimlaneRepository: {
		findOneBy: jest.Mock
	}

	beforeEach(() => {
		taskRepository = {
			create: jest.fn((value) => value),
			save: jest.fn(async (value) => ({ id: 'task-1', ...value })),
			update: jest.fn(),
			find: jest.fn().mockResolvedValue([]),
			findBy: jest.fn().mockResolvedValue([])
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

		service = new ProjectTaskService(
			taskRepository as unknown as Repository<ProjectTask>,
			sprintRepository as unknown as Repository<ProjectSprint>,
			swimlaneRepository as unknown as Repository<ProjectSwimlane>
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
				projectId: 'project-1',
				sprintId: 'sprint-1',
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
				projectId: 'project-1',
				sprintId: 'sprint-1',
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
				projectId: 'project-1',
				sprintId: 'sprint-1',
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
			projectId: 'project-1',
			sprintId: 'sprint-1',
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
})
