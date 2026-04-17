import { BadRequestException } from '@nestjs/common'
import { ProjectTaskStatusEnum } from '@xpert-ai/contracts'
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
			findBy: jest.fn().mockResolvedValue([])
		}
		sprintRepository = {
			findOneBy: jest.fn().mockResolvedValue({ id: 'sprint-1', projectId: 'project-1' })
		}
		swimlaneRepository = {
			findOneBy: jest.fn().mockResolvedValue({
				id: 'lane-1',
				projectId: 'project-1',
				sprintId: 'sprint-1'
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
})
