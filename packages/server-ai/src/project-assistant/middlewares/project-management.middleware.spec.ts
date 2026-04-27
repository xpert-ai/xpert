import { Command } from '@langchain/langgraph'
import {
	ProjectAgentRole,
	ProjectExecutionEnvironmentType,
	ProjectSprintStatusEnum,
	ProjectSprintStrategyEnum,
	ProjectSwimlaneKindEnum,
	ProjectTaskStatusEnum,
	XPERT_EVENT_TYPES
} from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
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
	let eventPublisher: {
		publish: jest.Mock
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
		eventPublisher = {
			publish: jest.fn().mockResolvedValue(null)
		}

		middleware = new ProjectManagementMiddleware(projectAssistantService as never, eventPublisher as never)
	})

	function hasProjectIdInShape(value: unknown) {
		if (!value || typeof value !== 'object') {
			return false
		}

		const shape = Reflect.get(value, 'shape')
		return !!shape && typeof shape === 'object' && Reflect.has(shape, 'projectId')
	}

	function createContext(overrides: Partial<IAgentMiddlewareContext> = {}): IAgentMiddlewareContext {
		return {
			tenantId: 'tenant-1',
			userId: 'user-1',
			projectId: 'project-1',
			node: {} as never,
			tools: new Map(),
			runtime: {
				createModelClient: async <T>() => {
					throw new Error('createModelClient is not used in this spec')
				},
				wrapWorkflowNodeExecution: async <T>() => {
					throw new Error('wrapWorkflowNodeExecution is not used in this spec')
				}
			},
			...overrides
		}
	}

	function createTask(overrides: Record<string, unknown> = {}) {
		return {
			id: 'task-1',
			projectId: 'project-1',
			sprintId: 'sprint-1',
			swimlaneId: 'lane-coding',
			title: 'Task',
			sortOrder: 0,
			status: ProjectTaskStatusEnum.Todo,
			dependencies: [],
			...overrides
		}
	}

	function createSprint(overrides: Record<string, unknown> = {}) {
		return {
			id: 'sprint-1',
			projectId: 'project-1',
			goal: 'Sprint goal',
			status: ProjectSprintStatusEnum.Running,
			strategyType: ProjectSprintStrategyEnum.SoftwareDelivery,
			...overrides
		}
	}

	function createSwimlane(overrides: Record<string, unknown> = {}) {
		return {
			id: 'lane-coding',
			projectId: 'project-1',
			sprintId: 'sprint-1',
			key: 'coding',
			name: 'Coding',
			kind: ProjectSwimlaneKindEnum.Execution,
			priority: 1,
			weight: 1,
			concurrencyLimit: 2,
			wipLimit: 2,
			agentRole: ProjectAgentRole.Coder,
			environmentType: ProjectExecutionEnvironmentType.Container,
			sortOrder: 1,
			sourceStrategyType: ProjectSprintStrategyEnum.SoftwareDelivery,
			...overrides
		}
	}

	function getTool(middlewareValue: Awaited<ReturnType<ProjectManagementMiddleware['createMiddleware']>>, name: string) {
		const selectedTool = middlewareValue.tools?.find((tool) => tool.name === name)
		expect(selectedTool).toBeDefined()
		return selectedTool!
	}

	it('exposes the project management tools', async () => {
		const created = await middleware.createMiddleware({}, createContext())

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
				'getProjectExecutionSnapshot',
				'dispatchRunnableTasks'
			])
		)
	})

	it('exposes localized display metadata for project tools', async () => {
		const created = await middleware.createMiddleware({}, createContext())
		const moveTasks = created.tools?.find((item) => item.name === 'moveProjectTasks')
		const dispatchTasks = created.tools?.find((item) => item.name === 'dispatchRunnableTasks')

		expect(moveTasks?.metadata?.displayTitle).toEqual({
			en_US: 'Move project tasks',
			zh_Hans: '移动项目任务'
		})
		expect(moveTasks?.metadata?.displayMessage).toEqual({
			en_US: 'Moving project tasks',
			zh_Hans: '正在移动项目任务'
		})
		expect(dispatchTasks?.metadata?.displayTitle).toEqual({
			en_US: 'Dispatch runnable tasks',
			zh_Hans: '投递可执行任务'
		})
	})

	it('does not expose projectId in middleware or tool schemas', async () => {
		const created = await middleware.createMiddleware({}, createContext())

		const properties = Reflect.get(middleware.meta.configSchema, 'properties')
		expect(!!properties && typeof properties === 'object' && Reflect.has(properties, 'projectId')).toBe(false)

		for (const tool of created.tools ?? []) {
			expect(hasProjectIdInShape(Reflect.get(tool, 'schema'))).toBe(false)
		}
	})

	it('returns a state-updating command for getProjectContext', async () => {
		const created = await middleware.createMiddleware({}, createContext())
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

	it('publishes project board changed events for mutating project tools', async () => {
		const created = await middleware.createMiddleware({ defaultSprintId: 'sprint-1' }, createContext())
		const cases = [
			{
				toolName: 'createProjectTasks',
				operation: 'task.created',
				input: {
					tasks: [{ title: 'Task' }]
				},
				setup: () => projectAssistantService.createProjectTasks.mockResolvedValueOnce([createTask()])
			},
			{
				toolName: 'updateProjectTasks',
				operation: 'task.updated',
				input: {
					tasks: [{ id: 'task-1', status: ProjectTaskStatusEnum.Done }]
				},
				setup: () =>
					projectAssistantService.updateProjectTasks.mockResolvedValueOnce([
						createTask({ status: ProjectTaskStatusEnum.Done })
					])
			},
			{
				toolName: 'reorderProjectTasks',
				operation: 'task.reordered',
				input: {
					laneId: 'lane-coding',
					orderedTaskIds: ['task-2', 'task-1']
				},
				setup: () =>
					projectAssistantService.reorderProjectTasks.mockResolvedValueOnce([
						createTask({ id: 'task-2', sortOrder: 0 }),
						createTask({ id: 'task-1', sortOrder: 1 })
					])
			},
			{
				toolName: 'moveProjectTasks',
				operation: 'task.moved',
				input: {
					taskIds: ['task-1'],
					targetLaneId: 'lane-backlog'
				},
				setup: () =>
					projectAssistantService.moveProjectTasks.mockResolvedValueOnce([
						createTask({ swimlaneId: 'lane-backlog' })
					])
			},
			{
				toolName: 'createProjectSprint',
				operation: 'sprint.created',
				input: {
					goal: 'Sprint goal',
					strategyType: ProjectSprintStrategyEnum.SoftwareDelivery
				},
				setup: () => projectAssistantService.createProjectSprint.mockResolvedValueOnce(createSprint())
			},
			{
				toolName: 'updateProjectSprint',
				operation: 'sprint.updated',
				input: {
					sprintId: 'sprint-1',
					goal: 'Next goal'
				},
				setup: () =>
					projectAssistantService.updateProjectSprint.mockResolvedValueOnce(
						createSprint({ goal: 'Next goal' })
					)
			},
			{
				toolName: 'updateProjectSwimlanes',
				operation: 'swimlanes.updated',
				input: {
					swimlanes: [{ id: 'lane-coding', wipLimit: 3 }]
				},
				setup: () =>
					projectAssistantService.updateProjectSwimlanes.mockResolvedValueOnce([
						createSwimlane({ wipLimit: 3 })
					])
			}
		]

		for (const item of cases) {
			eventPublisher.publish.mockClear()
			item.setup()

			await getTool(created, item.toolName).invoke(item.input)

			expect(eventPublisher.publish).toHaveBeenCalledWith(
				expect.objectContaining({
					type: XPERT_EVENT_TYPES.ProjectBoardChanged,
					scope: expect.objectContaining({
						projectId: 'project-1',
						sprintId: 'sprint-1'
					}),
					source: {
						type: 'tool',
						id: `project_management.${item.toolName}`,
						name: item.toolName
					},
					payload: expect.objectContaining({
						operation: item.operation,
						projectId: 'project-1',
						sprintId: 'sprint-1'
					}),
					meta: expect.objectContaining({
						tenantId: 'tenant-1',
						userId: 'user-1'
					})
				})
			)
		}
	})

	it('does not publish board changed events when a mutating tool fails', async () => {
		const created = await middleware.createMiddleware({}, createContext())
		projectAssistantService.updateProjectTasks.mockRejectedValueOnce(new Error('nope'))

		await expect(
			getTool(created, 'updateProjectTasks').invoke({
				tasks: [{ id: 'task-1' }]
			})
		).rejects.toThrow('nope')

		expect(eventPublisher.publish).not.toHaveBeenCalled()
	})

	it('does not fail mutating tools when board changed publishing fails', async () => {
		const created = await middleware.createMiddleware({}, createContext())
		const task = createTask({ status: ProjectTaskStatusEnum.Done })
		projectAssistantService.updateProjectTasks.mockResolvedValueOnce([task])
		eventPublisher.publish.mockRejectedValueOnce(new Error('redis down'))

		await expect(
			getTool(created, 'updateProjectTasks').invoke({
				tasks: [{ id: 'task-1', status: ProjectTaskStatusEnum.Done }]
			})
		).resolves.toEqual([task])
	})

	it('requires projectId from middleware context', async () => {
		const created = await middleware.createMiddleware({}, createContext({ projectId: undefined }))
		const tool = created.tools?.find((item) => item.name === 'listProjectTasks')

		await expect(
			tool!.invoke({
				laneKind: ProjectSwimlaneKindEnum.Backlog
			})
		).rejects.toThrow('project_management middleware requires a projectId')
	})
})
