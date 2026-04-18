import { BadRequestException } from '@nestjs/common'
import {
	ProjectSprintStrategyEnum,
	ProjectSwimlaneKindEnum
} from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
jest.mock('../../project-core/project-core.service', () => ({
	ProjectCoreService: class ProjectCoreService {}
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
	let service: ProjectAssistantService
	let projectCoreService: { findOne: jest.Mock }
	let projectSprintService: { findOne: jest.Mock; create: jest.Mock; update: jest.Mock }
	let projectSwimlaneService: { ensureReservedBacklogLane: jest.Mock; findOne: jest.Mock; update: jest.Mock }
	let projectTaskService: { moveTasks: jest.Mock; listByProjectContext: jest.Mock; findOne: jest.Mock; create: jest.Mock; update: jest.Mock; reorderInLane: jest.Mock }
	let projectOrchestratorService: { getSprintExecutionSnapshot: jest.Mock }
	let sprintRepository: { find: jest.Mock }
	let swimlaneRepository: { find: jest.Mock; findBy: jest.Mock }
	let taskRepository: { find: jest.Mock }

	beforeEach(() => {
		projectCoreService = {
			findOne: jest.fn().mockResolvedValue({ id: 'project-1', mainAssistantId: 'assistant-1' })
		}
		projectSprintService = {
			findOne: jest.fn().mockResolvedValue({
				id: 'sprint-1',
				projectId: 'project-1',
				strategyType: ProjectSprintStrategyEnum.SoftwareDelivery
			}),
			create: jest.fn().mockResolvedValue({
				id: 'sprint-1',
				projectId: 'project-1',
				strategyType: ProjectSprintStrategyEnum.SoftwareDelivery
			}),
			update: jest.fn()
		}
		projectSwimlaneService = {
			ensureReservedBacklogLane: jest.fn().mockResolvedValue({
				id: 'lane-backlog',
				projectId: 'project-1',
				sprintId: 'sprint-1',
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
		sprintRepository = {
			find: jest.fn().mockResolvedValue([])
		}
		swimlaneRepository = {
			find: jest.fn().mockResolvedValue([
				{
					id: 'lane-backlog',
					projectId: 'project-1',
					sprintId: 'sprint-1',
					sortOrder: 0,
					kind: ProjectSwimlaneKindEnum.Backlog
				},
				{
					id: 'lane-execution',
					projectId: 'project-1',
					sprintId: 'sprint-1',
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
			sprintRepository as unknown as Repository<ProjectSprint>,
			swimlaneRepository as unknown as Repository<ProjectSwimlane>,
			taskRepository as unknown as Repository<ProjectTask>
		)
	})

	it('resolves context with a reserved backlog lane and execution lanes split by kind', async () => {
		const context = await service.resolveContext('project-1', 'sprint-1')

		expect(projectSwimlaneService.ensureReservedBacklogLane).toHaveBeenCalledWith('sprint-1')
		expect(context.backlogLane?.id).toBe('lane-backlog')
		expect(context.executionLanes.map((lane) => lane.id)).toEqual(['lane-execution'])
	})

	it('rejects execution swimlane updates against the reserved backlog lane', async () => {
		projectSwimlaneService.findOne.mockResolvedValue({
			id: 'lane-backlog',
			projectId: 'project-1',
			kind: ProjectSwimlaneKindEnum.Backlog
		})

		await expect(
			service.updateProjectSwimlanes({
				projectId: 'project-1',
				swimlanes: [
					{
						id: 'lane-backlog',
						priority: 1
					}
				]
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})
})
