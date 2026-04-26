import { BadRequestException, ConflictException } from '@nestjs/common'
import {
	createProjectId,
	createTeamId,
	createXpertId,
	ProjectAgentRole,
	ProjectExecutionEnvironmentType
} from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
jest.mock('../project-core/project-core.service', () => ({
	ProjectCoreService: class ProjectCoreService {}
}))
jest.mock('../team-definition/team-definition.service', () => ({
	TeamDefinitionService: class TeamDefinitionService {}
}))
import { ProjectCoreService } from '../project-core/project-core.service'
import { ProjectTask } from '../project-task/project-task.entity'
import { TeamDefinitionService } from '../team-definition/team-definition.service'
import { ProjectTeamBinding } from './project-team-binding.entity'
import { TeamBindingService } from './team-binding.service'

describe('TeamBindingService', () => {
	let service: TeamBindingService
	let repository: {
		create: jest.Mock
		save: jest.Mock
		update: jest.Mock
		delete: jest.Mock
		findOne: jest.Mock
		find: jest.Mock
	}
	let projectTaskRepository: {
		countBy: jest.Mock
	}
	let projectCoreService: {
		findOne: jest.Mock
	}
	let teamDefinitionService: {
		findOne: jest.Mock
	}

	beforeEach(() => {
		repository = {
			create: jest.fn((value) => value),
			save: jest.fn(async (value) => ({ id: 'binding-1', ...value })),
			update: jest.fn(async () => ({ affected: 1 })),
			delete: jest.fn(async () => ({ affected: 1 })),
			findOne: jest.fn().mockResolvedValue(null),
			find: jest.fn().mockResolvedValue([])
		}
		projectTaskRepository = {
			countBy: jest.fn().mockResolvedValue(0)
		}
		projectCoreService = {
			findOne: jest.fn().mockResolvedValue({ id: 'project-1', mainAssistantId: createXpertId('assistant-main') })
		}
		teamDefinitionService = {
			findOne: jest.fn().mockResolvedValue({
				id: createTeamId('team-1'),
				name: 'Delivery Team',
				leadAssistantId: createXpertId('assistant-delivery')
			})
		}

		service = new TeamBindingService(
			repository as unknown as Repository<ProjectTeamBinding>,
			projectTaskRepository as unknown as Repository<ProjectTask>,
			projectCoreService as unknown as ProjectCoreService,
			teamDefinitionService as unknown as TeamDefinitionService
		)
	})

	it('creates a project team binding with an appended sort order', async () => {
		const binding = await service.create({
			projectId: createProjectId('project-1'),
			teamId: createTeamId('team-1'),
			role: 'Delivery',
			agentRoles: [ProjectAgentRole.Coder],
			environmentTypes: [ProjectExecutionEnvironmentType.Container],
			swimlaneKeys: ['coding'],
			assignmentPriority: 2,
			maxConcurrentTasks: 3
		})

		expect(binding).toEqual(
			expect.objectContaining({
				projectId: createProjectId('project-1'),
				teamId: createTeamId('team-1'),
				role: 'Delivery',
				sortOrder: 0,
				agentRoles: [ProjectAgentRole.Coder],
				environmentTypes: [ProjectExecutionEnvironmentType.Container],
				swimlaneKeys: ['coding'],
				assignmentPriority: 2,
				maxConcurrentTasks: 3
			})
		)
	})

	it('rejects duplicate team bindings on the same project', async () => {
		repository.findOne.mockResolvedValueOnce({
			id: 'binding-existing',
			projectId: 'project-1',
			teamId: createTeamId('team-1')
		})

		await expect(
			service.create({
				projectId: createProjectId('project-1'),
				teamId: createTeamId('team-1')
			})
		).rejects.toBeInstanceOf(ConflictException)
	})

	it('rejects binding a team backed by the project main assistant', async () => {
		teamDefinitionService.findOne.mockResolvedValueOnce({
			id: createTeamId('team-main'),
			name: 'Main Assistant Team',
			leadAssistantId: createXpertId('assistant-main')
		})

		await expect(
			service.create({
				projectId: createProjectId('project-1'),
				teamId: createTeamId('team-main')
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})

	it('blocks deleting a binding while project tasks still reference the team', async () => {
		jest.spyOn(service, 'findOne').mockResolvedValueOnce({
			id: 'binding-1',
			projectId: 'project-1',
			teamId: createTeamId('team-1'),
			sortOrder: 0
		} as ProjectTeamBinding)
		projectTaskRepository.countBy.mockResolvedValueOnce(2)

		await expect(service.delete('binding-1')).rejects.toBeInstanceOf(ConflictException)
	})
})
