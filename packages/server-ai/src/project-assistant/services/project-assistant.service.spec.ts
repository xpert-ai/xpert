import { BadRequestException } from '@nestjs/common'
import {
	createProjectId,
	createSprintId,
	createTeamId,
	createXpertId,
	IProjectTeamBinding,
	ITeamDefinition,
	ProjectSprintStrategyEnum,
	ProjectSwimlaneKindEnum
} from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
jest.mock('../../project-core/project-core.service', () => ({
	ProjectCoreService: class ProjectCoreService {}
}))
jest.mock('../../team-definition/team-definition.service', () => ({
	TeamDefinitionService: class TeamDefinitionService {}
}))
jest.mock('../../team-binding/team-binding.service', () => ({
	TeamBindingService: class TeamBindingService {}
}))
import { ProjectCoreService } from '../../project-core/project-core.service'
import { ProjectOrchestratorService } from '../../project-orchestrator/project-orchestrator.service'
import { ProjectSprint } from '../../project-sprint/project-sprint.entity'
import { ProjectSprintService } from '../../project-sprint/project-sprint.service'
import { ProjectSwimlane } from '../../project-swimlane/project-swimlane.entity'
import { ProjectSwimlaneService } from '../../project-swimlane/project-swimlane.service'
import { ProjectTask } from '../../project-task/project-task.entity'
import { ProjectTaskService } from '../../project-task/project-task.service'
import { ProjectAssistantService } from './project-assistant.service'

describe('ProjectAssistantService', () => {
	const projectId = createProjectId('project-1')
	const sprintId = createSprintId('sprint-1')
	let service: ProjectAssistantService
	let projectCoreService: { findOne: jest.Mock }
	let projectSprintService: { findOne: jest.Mock; create: jest.Mock; update: jest.Mock }
	let projectSwimlaneService: { ensureReservedBacklogLane: jest.Mock; findOne: jest.Mock; update: jest.Mock }
	let projectTaskService: { moveTasks: jest.Mock; listByProjectContext: jest.Mock; findOne: jest.Mock; create: jest.Mock; update: jest.Mock; reorderInLane: jest.Mock }
	let projectOrchestratorService: { getSprintExecutionSnapshot: jest.Mock }
	let teamDefinitionService: { findOne: jest.Mock }
	let teamBindingService: { listByProject: jest.Mock; findOne: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock }
	let sprintRepository: { find: jest.Mock }
	let swimlaneRepository: { find: jest.Mock; findBy: jest.Mock }
	let taskRepository: { find: jest.Mock }

	beforeEach(() => {
		projectCoreService = {
			findOne: jest.fn().mockResolvedValue({ id: projectId, mainAssistantId: createXpertId('assistant-1') })
		}
		projectSprintService = {
			findOne: jest.fn().mockResolvedValue({
				id: sprintId,
				projectId,
				strategyType: ProjectSprintStrategyEnum.SoftwareDelivery
			}),
			create: jest.fn().mockResolvedValue({
				id: sprintId,
				projectId,
				strategyType: ProjectSprintStrategyEnum.SoftwareDelivery
			}),
			update: jest.fn()
		}
		projectSwimlaneService = {
			ensureReservedBacklogLane: jest.fn().mockResolvedValue({
				id: 'lane-backlog',
				projectId,
				sprintId,
				kind: ProjectSwimlaneKindEnum.Backlog
			}),
			findOne: jest.fn(),
			update: jest.fn()
		}
		projectTaskService = {
			moveTasks: jest.fn(),
			listByProjectContext: jest.fn().mockResolvedValue([]),
			findOne: jest.fn(),
			create: jest.fn(),
			update: jest.fn(),
			reorderInLane: jest.fn()
		}
		projectOrchestratorService = {
			getSprintExecutionSnapshot: jest.fn().mockResolvedValue({
				blockedTaskIds: [],
				runnableTasks: [],
				lanes: []
			})
		}
		teamDefinitionService = {
			findOne: jest.fn(async (id: string) => ({
				id,
				name: `Team ${id}`
			}))
		}
		teamBindingService = {
			listByProject: jest.fn().mockResolvedValue({
				items: []
			}),
			findOne: jest.fn(),
			create: jest.fn(),
			update: jest.fn(),
			delete: jest.fn()
		}
		sprintRepository = {
			find: jest.fn().mockResolvedValue([])
		}
		swimlaneRepository = {
			find: jest.fn().mockResolvedValue([
				{
					id: 'lane-backlog',
					projectId,
					sprintId,
					sortOrder: 0,
					kind: ProjectSwimlaneKindEnum.Backlog
				},
				{
					id: 'lane-execution',
					projectId,
					sprintId,
					sortOrder: 1,
					kind: ProjectSwimlaneKindEnum.Execution
				}
			]),
			findBy: jest.fn()
		}
		taskRepository = {
			find: jest.fn().mockResolvedValue([])
		}

		service = new ProjectAssistantService(
			projectCoreService as unknown as ProjectCoreService,
			projectSprintService as unknown as ProjectSprintService,
			projectSwimlaneService as unknown as ProjectSwimlaneService,
			projectTaskService as unknown as ProjectTaskService,
			projectOrchestratorService as unknown as ProjectOrchestratorService,
			teamDefinitionService as never,
			teamBindingService as never,
			sprintRepository as unknown as Repository<ProjectSprint>,
			swimlaneRepository as unknown as Repository<ProjectSwimlane>,
			taskRepository as unknown as Repository<ProjectTask>
		)
	})

	it('resolves context with a reserved backlog lane and execution lanes split by kind', async () => {
		const context = await service.resolveContext(projectId, sprintId)

		expect(projectSwimlaneService.ensureReservedBacklogLane).toHaveBeenCalledWith(sprintId)
		expect(context.backlogLane?.id).toBe('lane-backlog')
		expect(context.executionLanes.map((lane) => lane.id)).toEqual(['lane-execution'])
	})

	it('returns bound teams in the resolved project context', async () => {
		teamBindingService.listByProject.mockResolvedValueOnce({
			items: [
				{
					id: 'binding-1',
					projectId,
					teamId: createTeamId('team-1'),
					role: 'Delivery'
				} as Partial<IProjectTeamBinding>
			]
		})
		teamDefinitionService.findOne.mockResolvedValueOnce({
			id: createTeamId('team-1'),
			name: 'Delivery Team'
		} as Partial<ITeamDefinition>)

		const context = await service.resolveContext(projectId, sprintId)

		expect(context.boundTeams).toEqual([
			expect.objectContaining({
				binding: expect.objectContaining({
					id: 'binding-1',
					role: 'Delivery'
				}),
				team: expect.objectContaining({
					id: createTeamId('team-1'),
					name: 'Delivery Team'
				})
			})
		])
	})

	it('filters bound teams backed by the project main assistant from project context', async () => {
		teamBindingService.listByProject.mockResolvedValueOnce({
			items: [
				{
					id: 'binding-main',
					projectId,
					teamId: createTeamId('team-main'),
					role: 'Main Assistant'
				} as Partial<IProjectTeamBinding>,
				{
					id: 'binding-delivery',
					projectId,
					teamId: createTeamId('team-delivery'),
					role: 'Delivery'
				} as Partial<IProjectTeamBinding>
			]
		})
		teamDefinitionService.findOne.mockImplementation(async (id: string) => {
			if (id === createTeamId('team-main')) {
				return {
					id,
					name: 'Main Assistant Team',
					leadAssistantId: createXpertId('assistant-1')
				} as Partial<ITeamDefinition>
			}

			return {
				id,
				name: 'Delivery Team',
				leadAssistantId: createXpertId('assistant-delivery')
			} as Partial<ITeamDefinition>
		})

		const context = await service.resolveContext(projectId, sprintId)

		expect(context.boundTeams).toEqual([
			expect.objectContaining({
				binding: expect.objectContaining({
					id: 'binding-delivery'
				}),
				team: expect.objectContaining({
					id: createTeamId('team-delivery')
				})
			})
		])
	})

	it('rejects execution swimlane updates against the reserved backlog lane', async () => {
		projectSwimlaneService.findOne.mockResolvedValue({
			id: 'lane-backlog',
			projectId,
			kind: ProjectSwimlaneKindEnum.Backlog
		})

		await expect(
			service.updateProjectSwimlanes({
				projectId,
				swimlanes: [
					{
						id: 'lane-backlog',
						priority: 1
					}
				]
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})

	it('binds and updates project teams through the team binding service', async () => {
		teamBindingService.listByProject.mockResolvedValueOnce({ items: [] })
		teamBindingService.create.mockResolvedValueOnce({
			id: 'binding-1',
			projectId,
			teamId: createTeamId('team-1'),
			role: 'Delivery'
		})
		teamBindingService.listByProject.mockResolvedValueOnce({
			items: [
				{
					id: 'binding-1',
					projectId,
					teamId: createTeamId('team-1'),
					role: 'Delivery'
				}
			]
		})
		teamDefinitionService.findOne.mockResolvedValueOnce({
			id: createTeamId('team-1'),
			name: 'Delivery Team'
		})

		const result = await service.bindProjectTeams({
			projectId,
			teams: [{ teamId: createTeamId('team-1'), role: 'Delivery' }]
		})

		expect(teamBindingService.create).toHaveBeenCalledWith({
			projectId,
			teamId: createTeamId('team-1'),
			role: 'Delivery'
		})
		expect(result).toHaveLength(1)
	})
})
