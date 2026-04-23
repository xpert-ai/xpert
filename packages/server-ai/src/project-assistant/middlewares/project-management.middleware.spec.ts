import { Command } from '@langchain/langgraph'
import { ProjectSprintStrategyEnum, ProjectSwimlaneKindEnum } from '@xpert-ai/contracts'
jest.mock('../services/project-assistant.service', () => ({
	ProjectAssistantService: class ProjectAssistantService {}
}))
jest.mock('../../project-core/project-core.service', () => ({
	ProjectCoreService: class ProjectCoreService {}
}))
import { ProjectManagementMiddleware } from './project-management.middleware'

describe('ProjectManagementMiddleware', () => {
	let middleware: ProjectManagementMiddleware
	let projectAssistantService: {
		getProjectContext: jest.Mock
		buildExecutionSnapshotSummary: jest.Mock
		listProjectTasks: jest.Mock
		createProjectTasks: jest.Mock
		updateProjectTasks: jest.Mock
		reorderProjectTasks: jest.Mock
		moveProjectTasks: jest.Mock
		createProjectSprint: jest.Mock
		resolveContext: jest.Mock
		updateProjectSprint: jest.Mock
		listProjectTeams: jest.Mock
		bindProjectTeams: jest.Mock
		updateProjectTeamBindings: jest.Mock
		removeProjectTeamBinding: jest.Mock
		updateProjectSwimlanes: jest.Mock
		getProjectExecutionSnapshot: jest.Mock
	}

	beforeEach(() => {
		projectAssistantService = {
			getProjectContext: jest.fn().mockResolvedValue({
				project: { id: 'project-1' },
				sprint: { id: 'sprint-1', strategyType: ProjectSprintStrategyEnum.SoftwareDelivery },
				backlogLane: { id: 'lane-backlog' },
				executionLanes: [],
				boundTeams: [],
				executionSnapshot: null
			}),
			buildExecutionSnapshotSummary: jest.fn().mockReturnValue({
				blockedTaskCount: 0,
				runnableTaskCount: 0,
				laneCount: 0
			}),
			listProjectTasks: jest.fn(),
			createProjectTasks: jest.fn(),
			updateProjectTasks: jest.fn(),
			reorderProjectTasks: jest.fn(),
			moveProjectTasks: jest.fn(),
			createProjectSprint: jest.fn().mockResolvedValue({
				id: 'sprint-2',
				strategyType: ProjectSprintStrategyEnum.SoftwareDelivery
			}),
			resolveContext: jest.fn().mockResolvedValue({
				backlogLane: { id: 'lane-backlog-2' },
				executionSnapshot: null
			}),
			updateProjectSprint: jest.fn(),
			listProjectTeams: jest.fn(),
			bindProjectTeams: jest.fn(),
			updateProjectTeamBindings: jest.fn(),
			removeProjectTeamBinding: jest.fn(),
			updateProjectSwimlanes: jest.fn(),
			getProjectExecutionSnapshot: jest.fn()
		}

		middleware = new ProjectManagementMiddleware(projectAssistantService as never)
	})

	it('exposes the project management tools', async () => {
		const created = await middleware.createMiddleware({}, {
			tenantId: 'tenant-1',
			userId: 'user-1',
			projectId: 'project-1',
			node: {} as never,
			tools: new Map()
		})

		expect(created.tools?.map((item) => item.name)).toEqual(
			expect.arrayContaining([
				'getProjectContext',
				'listProjectTasks',
				'createProjectTasks',
				'updateProjectTasks',
				'reorderProjectTasks',
				'moveProjectTasks',
				'createProjectSprint',
				'updateProjectSprint',
				'listProjectTeams',
				'bindProjectTeams',
				'updateProjectTeamBindings',
				'removeProjectTeamBinding',
				'updateProjectSwimlanes',
				'getProjectExecutionSnapshot'
			])
		)
	})

	it('returns a state-updating command for getProjectContext', async () => {
		const created = await middleware.createMiddleware({}, {
			tenantId: 'tenant-1',
			userId: 'user-1',
			projectId: 'project-1',
			node: {} as never,
			tools: new Map()
		})
		const tool = created.tools?.find((item) => item.name === 'getProjectContext')
		expect(tool).toBeDefined()

		const result = await tool!.invoke(
			{},
			{
				metadata: {
					tool_call_id: 'tool-1'
				}
			} as never
		)

		expect(result).toBeInstanceOf(Command)
		expect(projectAssistantService.getProjectContext).toHaveBeenCalledWith('project-1', null)
	})

	it('requires projectId from runtime context or middleware options', async () => {
		const created = await middleware.createMiddleware({}, {
			tenantId: 'tenant-1',
			userId: 'user-1',
			node: {} as never,
			tools: new Map()
		})
		const tool = created.tools?.find((item) => item.name === 'listProjectTasks')

		await expect(
			tool!.invoke({
				laneKind: ProjectSwimlaneKindEnum.Backlog
			})
		).rejects.toThrow('project_management middleware requires a projectId')
	})
})
