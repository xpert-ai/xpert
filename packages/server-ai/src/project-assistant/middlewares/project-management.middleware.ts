import { tool } from '@langchain/core/tools'
import { Command, getCurrentTaskInput } from '@langchain/langgraph'
import {
	createProjectId,
	createSprintId,
	createTeamId,
	getToolCallIdFromConfig,
	IProjectSprint,
	IProjectSwimlane,
	IProjectTask,
	I18nObject,
	ProjectAgentRole,
	ProjectId,
	ProjectExecutionEnvironmentType,
	ProjectSprintStatusEnum,
	ProjectSprintStrategyEnum,
	SprintId,
	ProjectSwimlaneKindEnum,
	ProjectTaskStatusEnum,
	TAgentMiddlewareMeta,
	XPERT_EVENT_TYPES,
	XpertEventScope,
	XpertProjectBoardChangedEventPayload,
	XpertProjectBoardChangedOperation,
	XpertProjectSprintPatch,
	XpertProjectSwimlanePatch,
	XpertProjectTaskPatch
} from '@xpert-ai/contracts'
import { Injectable, Optional } from '@nestjs/common'
import {
	AgentMiddleware,
	AgentMiddlewareStrategy,
	IAgentMiddlewareContext,
	IAgentMiddlewareStrategy,
	PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { normalizeOptionalBrandedId, normalizeRequiredBrandedId } from '../../shared/utils'
import { XpertEventPublisher } from '../../event-system'
import { ProjectAssistantService } from '../services/project-assistant.service'

const PROJECT_MANAGEMENT_MIDDLEWARE_PROVIDER = 'project_management'

const configurableSchema = z.object({
	defaultSprintId: z.string().optional()
})

const stateSchema = z.object({
	sprintId: z.string().nullable().optional(),
	backlogLaneId: z.string().nullable().optional(),
	strategyType: z.nativeEnum(ProjectSprintStrategyEnum).nullable().optional(),
	executionSnapshotSummary: z
		.object({
			blockedTaskCount: z.number(),
			runnableTaskCount: z.number(),
			laneCount: z.number()
		})
		.nullable()
		.optional()
})

type ProjectManagementState = z.infer<typeof stateSchema>
type ProjectManagementResolvedScope = {
	projectId: ProjectId
	sprintId: SprintId | null
}
type ProjectToolDisplayMetadata = Record<string, unknown> & {
	displayTitle: I18nObject
	displayMessage: I18nObject
}

const PROJECT_TOOL_DISPLAYS = {
	getProjectContext: projectToolDisplay(
		{ en_US: 'Inspect project context', zh_Hans: '查看项目上下文' },
		{ en_US: 'Inspecting project context', zh_Hans: '正在查看项目上下文' }
	),
	listProjectTasks: projectToolDisplay(
		{ en_US: 'List project tasks', zh_Hans: '列出项目任务' },
		{ en_US: 'Listing project tasks', zh_Hans: '正在列出项目任务' }
	),
	createProjectTasks: projectToolDisplay(
		{ en_US: 'Create project tasks', zh_Hans: '创建项目任务' },
		{ en_US: 'Creating project tasks', zh_Hans: '正在创建项目任务' }
	),
	updateProjectTasks: projectToolDisplay(
		{ en_US: 'Update project tasks', zh_Hans: '更新项目任务' },
		{ en_US: 'Updating project tasks', zh_Hans: '正在更新项目任务' }
	),
	reorderProjectTasks: projectToolDisplay(
		{ en_US: 'Reorder project tasks', zh_Hans: '调整任务顺序' },
		{ en_US: 'Reordering project tasks', zh_Hans: '正在调整任务顺序' }
	),
	moveProjectTasks: projectToolDisplay(
		{ en_US: 'Move project tasks', zh_Hans: '移动项目任务' },
		{ en_US: 'Moving project tasks', zh_Hans: '正在移动项目任务' }
	),
	createProjectSprint: projectToolDisplay(
		{ en_US: 'Create project sprint', zh_Hans: '创建项目 Sprint' },
		{ en_US: 'Creating project sprint', zh_Hans: '正在创建项目 Sprint' }
	),
	updateProjectSprint: projectToolDisplay(
		{ en_US: 'Update project sprint', zh_Hans: '更新项目 Sprint' },
		{ en_US: 'Updating project sprint', zh_Hans: '正在更新项目 Sprint' }
	),
	listProjectTeams: projectToolDisplay(
		{ en_US: 'List project teams', zh_Hans: '列出项目团队' },
		{ en_US: 'Listing project teams', zh_Hans: '正在列出项目团队' }
	),
	bindProjectTeams: projectToolDisplay(
		{ en_US: 'Bind project teams', zh_Hans: '绑定项目团队' },
		{ en_US: 'Binding project teams', zh_Hans: '正在绑定项目团队' }
	),
	updateProjectTeamBindings: projectToolDisplay(
		{ en_US: 'Update team bindings', zh_Hans: '更新团队绑定' },
		{ en_US: 'Updating team bindings', zh_Hans: '正在更新团队绑定' }
	),
	removeProjectTeamBinding: projectToolDisplay(
		{ en_US: 'Remove team binding', zh_Hans: '移除团队绑定' },
		{ en_US: 'Removing team binding', zh_Hans: '正在移除团队绑定' }
	),
	updateProjectSwimlanes: projectToolDisplay(
		{ en_US: 'Update project swimlanes', zh_Hans: '更新项目泳道' },
		{ en_US: 'Updating project swimlanes', zh_Hans: '正在更新项目泳道' }
	),
	getProjectExecutionSnapshot: projectToolDisplay(
		{ en_US: 'Inspect execution snapshot', zh_Hans: '查看执行快照' },
		{ en_US: 'Inspecting execution snapshot', zh_Hans: '正在查看执行快照' }
	),
	dispatchRunnableTasks: projectToolDisplay(
		{ en_US: 'Dispatch runnable tasks', zh_Hans: '投递可执行任务' },
		{ en_US: 'Dispatching runnable tasks', zh_Hans: '正在投递可执行任务' }
	)
} satisfies Record<string, ProjectToolDisplayMetadata>

function projectToolDisplay(
	displayTitle: I18nObject,
	displayMessage: I18nObject = displayTitle
): ProjectToolDisplayMetadata {
	return {
		displayTitle,
		displayMessage
	}
}

@Injectable()
@AgentMiddlewareStrategy(PROJECT_MANAGEMENT_MIDDLEWARE_PROVIDER)
export class ProjectManagementMiddleware implements IAgentMiddlewareStrategy {
	readonly meta: TAgentMiddlewareMeta = {
		name: PROJECT_MANAGEMENT_MIDDLEWARE_PROVIDER,
		label: {
			en_US: 'Project Management',
			zh_Hans: '项目管理'
		},
		description: {
			en_US: 'Manage project backlog, sprint planning, and execution lanes.',
			zh_Hans: '管理项目 backlog、Sprint 规划和执行泳道。'
		},
		icon: {
			type: 'emoji',
			value: '🗂️'
		},
		configSchema: {
			type: 'object',
			properties: {
				defaultSprintId: {
					type: 'string'
				}
			}
		}
	}

	constructor(
		private readonly projectAssistantService: ProjectAssistantService,
		@Optional() private readonly eventPublisher?: XpertEventPublisher
	) {}

	createMiddleware(options: unknown, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
		const parsedOptions = configurableSchema.parse(options ?? {})
		return {
			name: PROJECT_MANAGEMENT_MIDDLEWARE_PROVIDER,
			stateSchema,
			tools: this.createTools(context, parsedOptions)
		}
	}

	private createTools(context: IAgentMiddlewareContext, options: z.infer<typeof configurableSchema>) {
		return [
			tool(
				async (input, config) => {
					const resolved = this.resolveProjectScope(
						input.sprintId,
						options,
						context,
						this.readState()
					)
					const result = await this.projectAssistantService.getProjectContext(resolved.projectId, resolved.sprintId)
					return this.withStateUpdate(
						{
							sprintId: result.sprint?.id ?? null,
							backlogLaneId: result.backlogLane?.id ?? null,
							strategyType: result.sprint?.strategyType ?? null,
							executionSnapshotSummary:
								this.projectAssistantService.buildExecutionSnapshotSummary(result.executionSnapshot)
						},
						result,
						config
					)
				},
				{
					name: 'getProjectContext',
					description: 'Get the current project, sprint, backlog lane, execution lanes, bound teams, board task counts, and execution snapshot.',
					metadata: PROJECT_TOOL_DISPLAYS.getProjectContext,
					schema: z.object({
						sprintId: z.string().optional()
					})
				}
			),
			tool(
				async (input) => {
					const resolved = this.resolveProjectScope(
						input.sprintId,
						options,
						context,
						this.readState()
					)
					return this.projectAssistantService.listProjectTasks({
						projectId: resolved.projectId,
						sprintId: resolved.sprintId,
						laneId: input.laneId,
						laneKind: input.laneKind,
						status: input.status,
						query: input.query,
						teamId: this.normalizeOptionalTeamId(input.teamId, 'undefined')
					})
				},
				{
					name: 'listProjectTasks',
					description: 'List project tasks filtered by sprint, lane, lane kind, status, or search query.',
					metadata: PROJECT_TOOL_DISPLAYS.listProjectTasks,
					schema: z.object({
						sprintId: z.string().optional(),
						laneId: z.string().optional(),
						laneKind: z.nativeEnum(ProjectSwimlaneKindEnum).optional(),
						status: z.nativeEnum(ProjectTaskStatusEnum).optional(),
						query: z.string().optional(),
						teamId: z.string().optional()
					})
				}
			),
			tool(
				async (input) => {
					const resolved = this.resolveProjectScope(
						input.sprintId,
						options,
						context,
						this.readState()
					)
					const tasks = await this.projectAssistantService.createProjectTasks({
						projectId: resolved.projectId,
						sprintId: resolved.sprintId,
						laneId: input.laneId,
						tasks: input.tasks.map((task) => this.normalizeCreateTaskInput(task))
					})
					this.publishBoardChanged(context, 'createProjectTasks', 'task.created', {
						projectId: resolved.projectId,
						sprintId: this.resolveCommonTaskSprintId(tasks) ?? resolved.sprintId,
						tasks: this.toTaskPatches(tasks)
					})
					return tasks
				},
				{
					name: 'createProjectTasks',
					description: 'Create one or more project tasks. Tasks default to the backlog lane unless a target lane is provided.',
					metadata: PROJECT_TOOL_DISPLAYS.createProjectTasks,
					schema: z.object({
						sprintId: z.string().optional(),
						laneId: z.string().optional(),
						tasks: z.array(
							z.object({
								title: z.string(),
								description: z.string().optional(),
								assignedAgentId: z.string().optional(),
								status: z.nativeEnum(ProjectTaskStatusEnum).optional(),
								dependencies: z.array(z.string()).optional(),
								teamId: z.string().nullable().optional()
							})
						)
					})
				}
			),
			tool(
				async (input) => {
					const resolved = this.resolveProjectScope(
						undefined,
						options,
						context,
						this.readState()
					)
					const tasks = await this.projectAssistantService.updateProjectTasks({
						projectId: resolved.projectId,
						tasks: input.tasks.map((task) => this.normalizeUpdateTaskInput(task))
					})
					this.publishBoardChanged(context, 'updateProjectTasks', 'task.updated', {
						projectId: resolved.projectId,
						sprintId: this.resolveCommonTaskSprintId(tasks),
						tasks: this.toTaskPatches(tasks)
					})
					return tasks
				},
				{
					name: 'updateProjectTasks',
					description:
						'Update task title, description, assigned agent, status, dependencies, or teamId. Use only explicit bound teamId values returned by getProjectContext or listProjectTeams.',
					metadata: PROJECT_TOOL_DISPLAYS.updateProjectTasks,
					schema: z.object({
						tasks: z.array(
							z.object({
								id: z.string(),
								title: z.string().optional(),
								description: z.string().optional(),
								assignedAgentId: z.string().optional(),
								status: z.nativeEnum(ProjectTaskStatusEnum).optional(),
								dependencies: z.array(z.string()).optional(),
								teamId: z.string().nullable().optional()
							})
						)
					})
				}
			),
			tool(
				async (input) => {
					const resolved = this.resolveProjectScope(
						undefined,
						options,
						context,
						this.readState()
					)
					const tasks = await this.projectAssistantService.reorderProjectTasks(
						resolved.projectId,
						input.laneId,
						input.orderedTaskIds
					)
					this.publishBoardChanged(context, 'reorderProjectTasks', 'task.reordered', {
						projectId: resolved.projectId,
						sprintId: this.resolveCommonTaskSprintId(tasks),
						tasks: this.toTaskPatches(tasks)
					})
					return tasks
				},
				{
					name: 'reorderProjectTasks',
					description: 'Reorder tasks within a single swimlane.',
					metadata: PROJECT_TOOL_DISPLAYS.reorderProjectTasks,
					schema: z.object({
						laneId: z.string(),
						orderedTaskIds: z.array(z.string())
					})
				}
			),
			tool(
				async (input) => {
					const resolved = this.resolveProjectScope(
						undefined,
						options,
						context,
						this.readState()
					)
					const tasks = await this.projectAssistantService.moveProjectTasks(
						resolved.projectId,
						input.taskIds,
						input.targetLaneId
					)
					this.publishBoardChanged(context, 'moveProjectTasks', 'task.moved', {
						projectId: resolved.projectId,
						sprintId: this.resolveCommonTaskSprintId(tasks),
						tasks: this.toTaskPatches(tasks)
					})
					return tasks
				},
				{
					name: 'moveProjectTasks',
					description: 'Move tasks between backlog and execution lanes. Cross-sprint carry-over is limited to backlog-to-backlog moves.',
					metadata: PROJECT_TOOL_DISPLAYS.moveProjectTasks,
					schema: z.object({
						taskIds: z.array(z.string()),
						targetLaneId: z.string()
					})
				}
			),
			tool(
				async (input, config) => {
					const resolved = this.resolveProjectScope(
						undefined,
						options,
						context,
						this.readState()
					)
					const sprint = await this.projectAssistantService.createProjectSprint({
						projectId: resolved.projectId,
						goal: input.goal,
						strategyType: input.strategyType,
						status: input.status,
						startAt: input.startAt ? new Date(input.startAt) : undefined,
						endAt: input.endAt ? new Date(input.endAt) : undefined,
						carryOverSprintId: this.normalizeOptionalSprintId(input.carryOverSprintId) ?? undefined
					})
					this.publishBoardChanged(context, 'createProjectSprint', 'sprint.created', {
						projectId: resolved.projectId,
						sprintId: sprint.id ?? null,
						sprint: this.toSprintPatch(sprint),
						requiresRefresh: true
					})
					const nextContext = await this.projectAssistantService.resolveContext(resolved.projectId, sprint.id)
					return this.withStateUpdate(
						{
							sprintId: sprint.id,
							backlogLaneId: nextContext.backlogLane?.id ?? null,
							strategyType: sprint.strategyType,
							executionSnapshotSummary:
								this.projectAssistantService.buildExecutionSnapshotSummary(nextContext.executionSnapshot)
						},
						sprint,
						config
					)
				},
				{
					name: 'createProjectSprint',
					description: 'Create a sprint for the current project and optionally carry over backlog tasks from an earlier sprint.',
					metadata: PROJECT_TOOL_DISPLAYS.createProjectSprint,
					schema: z.object({
						goal: z.string(),
						strategyType: z.nativeEnum(ProjectSprintStrategyEnum),
						status: z.nativeEnum(ProjectSprintStatusEnum).optional(),
						startAt: z.string().optional(),
						endAt: z.string().optional(),
						carryOverSprintId: z.string().optional()
					})
				}
			),
			tool(
				async (input) => {
					const resolved = this.resolveProjectScope(
						undefined,
						options,
						context,
						this.readState()
					)
					const sprint = await this.projectAssistantService.updateProjectSprint({
						projectId: resolved.projectId,
						sprintId: normalizeRequiredBrandedId(input.sprintId, 'sprintId', createSprintId),
						goal: input.goal,
						status: input.status,
						retrospective: input.retrospective,
						startAt: input.startAt ? new Date(input.startAt) : undefined,
						endAt: input.endAt ? new Date(input.endAt) : undefined
					})
					this.publishBoardChanged(context, 'updateProjectSprint', 'sprint.updated', {
						projectId: resolved.projectId,
						sprintId: sprint.id ?? null,
						sprint: this.toSprintPatch(sprint)
					})
					return sprint
				},
				{
					name: 'updateProjectSprint',
					description: 'Update sprint goal, status, retrospective, or timebox.',
					metadata: PROJECT_TOOL_DISPLAYS.updateProjectSprint,
					schema: z.object({
						sprintId: z.string(),
						goal: z.string().optional(),
						status: z.nativeEnum(ProjectSprintStatusEnum).optional(),
						retrospective: z.string().optional(),
						startAt: z.string().optional(),
						endAt: z.string().optional()
					})
				}
			),
			tool(
				async (input) => {
					const resolved = this.resolveProjectScope(
						undefined,
						options,
						context,
						this.readState()
					)
					return this.projectAssistantService.listProjectTeams(resolved.projectId)
				},
				{
					name: 'listProjectTeams',
					description: 'List the teams currently bound to the selected project.',
					metadata: PROJECT_TOOL_DISPLAYS.listProjectTeams,
					schema: z.object({})
				}
			),
			tool(
				async (input) => {
					const resolved = this.resolveProjectScope(
						undefined,
						options,
						context,
						this.readState()
					)
					return this.projectAssistantService.bindProjectTeams({
						projectId: resolved.projectId,
						teams: input.teams.map((team) => ({
							teamId: normalizeRequiredBrandedId(team.teamId, 'teamId', createTeamId),
							role: team.role
						}))
					})
				},
				{
					name: 'bindProjectTeams',
					description: 'Bind one or more teams to the selected project.',
					metadata: PROJECT_TOOL_DISPLAYS.bindProjectTeams,
					schema: z.object({
						teams: z.array(
							z.object({
								teamId: z.string(),
								role: z.string().optional()
							})
						)
					})
				}
			),
			tool(
				async (input) => {
					const resolved = this.resolveProjectScope(
						undefined,
						options,
						context,
						this.readState()
					)
					return this.projectAssistantService.updateProjectTeamBindings({
						projectId: resolved.projectId,
						bindings: input.bindings
					})
				},
				{
					name: 'updateProjectTeamBindings',
					description: 'Update role or sort order for existing project team bindings.',
					metadata: PROJECT_TOOL_DISPLAYS.updateProjectTeamBindings,
					schema: z.object({
						bindings: z.array(
							z.object({
								id: z.string(),
								role: z.string().optional(),
								sortOrder: z.number().optional()
							})
						)
					})
				}
			),
			tool(
				async (input) => {
					const resolved = this.resolveProjectScope(
						undefined,
						options,
						context,
						this.readState()
					)
					return this.projectAssistantService.removeProjectTeamBinding(resolved.projectId, input.bindingId)
				},
				{
					name: 'removeProjectTeamBinding',
					description: 'Remove a team binding from the selected project.',
					metadata: PROJECT_TOOL_DISPLAYS.removeProjectTeamBinding,
					schema: z.object({
						bindingId: z.string()
					})
				}
			),
			tool(
				async (input) => {
					const resolved = this.resolveProjectScope(
						undefined,
						options,
						context,
						this.readState()
					)
					const swimlanes = await this.projectAssistantService.updateProjectSwimlanes({
						projectId: resolved.projectId,
						swimlanes: input.swimlanes
					})
					this.publishBoardChanged(context, 'updateProjectSwimlanes', 'swimlanes.updated', {
						projectId: resolved.projectId,
						sprintId: this.resolveCommonSwimlaneSprintId(swimlanes),
						swimlanes: this.toSwimlanePatches(swimlanes)
					})
					return swimlanes
				},
				{
					name: 'updateProjectSwimlanes',
					description: 'Update execution swimlane priority, weight, concurrency, WIP, agent role, or environment.',
					metadata: PROJECT_TOOL_DISPLAYS.updateProjectSwimlanes,
					schema: z.object({
						swimlanes: z.array(
							z.object({
								id: z.string(),
								priority: z.number().optional(),
								weight: z.number().optional(),
								concurrencyLimit: z.number().optional(),
								wipLimit: z.number().optional(),
								agentRole: z.nativeEnum(ProjectAgentRole).optional(),
								environmentType: z.nativeEnum(ProjectExecutionEnvironmentType).optional()
							})
						)
					})
				}
			),
			tool(
				async (input) => {
					const resolved = this.resolveProjectScope(
						input.sprintId,
						options,
						context,
						this.readState()
					)
					return this.projectAssistantService.getProjectExecutionSnapshot(
						resolved.projectId,
						resolved.sprintId
					)
				},
				{
					name: 'getProjectExecutionSnapshot',
					description: 'Get the orchestrator execution snapshot for the current sprint.',
					metadata: PROJECT_TOOL_DISPLAYS.getProjectExecutionSnapshot,
					schema: z.object({
						sprintId: z.string().optional()
					})
				}
			),
			tool(
				async (input) => {
					const resolved = this.resolveProjectScope(
						input.sprintId,
						options,
						context,
						this.readState()
					)
					return this.projectAssistantService.dispatchRunnableTasks(
						resolved.projectId,
						resolved.sprintId
					)
				},
				{
					name: 'dispatchRunnableTasks',
					description:
						'Dispatch runnable project tasks to their assigned teams only after the user explicitly authorizes execution.',
					metadata: PROJECT_TOOL_DISPLAYS.dispatchRunnableTasks,
					schema: z.object({
						sprintId: z.string().optional()
					})
				}
			)
		]
	}

	private publishBoardChanged(
		context: IAgentMiddlewareContext,
		toolName: string,
		operation: XpertProjectBoardChangedOperation,
		payload: Omit<XpertProjectBoardChangedEventPayload, 'operation'>
	) {
		const projectId = this.asString(payload.projectId)
		if (!projectId) {
			return
		}

		const sprintId = this.asString(payload.sprintId) ?? this.resolveBoardChangedSprintId(payload)
		const eventPayload: XpertProjectBoardChangedEventPayload = {
			...payload,
			operation,
			projectId,
			sprintId: payload.sprintId === null ? null : sprintId ?? null
		}

		this.eventPublisher
			?.publish<XpertProjectBoardChangedEventPayload>({
				type: XPERT_EVENT_TYPES.ProjectBoardChanged,
				scope: this.buildBoardChangedScope(projectId, eventPayload),
				source: {
					type: 'tool',
					id: `${PROJECT_MANAGEMENT_MIDDLEWARE_PROVIDER}.${toolName}`,
					name: toolName
				},
				payload: eventPayload,
				meta: {
					tenantId: this.asString(context.tenantId) ?? undefined,
					userId: this.asString(context.userId) ?? null
				}
			})
			.catch(() => null)
	}

	private buildBoardChangedScope(projectId: string, payload: XpertProjectBoardChangedEventPayload): XpertEventScope {
		const scope: XpertEventScope = { projectId }
		const sprintId = this.asString(payload.sprintId) ?? this.resolveBoardChangedSprintId(payload)
		const taskId = this.resolveSingleTaskId(payload.tasks)
		if (sprintId) {
			scope.sprintId = sprintId
		}
		if (taskId) {
			scope.taskId = taskId
		}
		return scope
	}

	private resolveBoardChangedSprintId(payload: Omit<XpertProjectBoardChangedEventPayload, 'operation'>) {
		return (
			this.resolveCommonTaskSprintId(payload.tasks ?? []) ??
			this.asString(payload.sprint?.id) ??
			this.resolveCommonSwimlaneSprintId(payload.swimlanes ?? [])
		)
	}

	private resolveSingleTaskId(tasks: XpertProjectTaskPatch[] | undefined) {
		return tasks?.length === 1 ? this.asString(tasks[0]?.id) : null
	}

	private resolveCommonTaskSprintId(tasks: Array<Partial<IProjectTask>>) {
		return this.onlyCommonString(tasks.map((task) => task.sprintId))
	}

	private resolveCommonSwimlaneSprintId(swimlanes: Array<Partial<IProjectSwimlane>>) {
		return this.onlyCommonString(swimlanes.map((swimlane) => swimlane.sprintId))
	}

	private onlyCommonString(values: unknown[]) {
		const normalized = [
			...new Set(values.map((value) => this.asString(value)).filter((value): value is string => !!value))
		]
		return normalized.length === 1 ? normalized[0] : null
	}

	private toTaskPatches(tasks: Array<Partial<IProjectTask>>): XpertProjectTaskPatch[] {
		return tasks.flatMap((task) => {
			const { id: taskId, ...taskPatch } = task
			const id = this.asString(taskId)
			return id
				? [
						{
							...taskPatch,
							id
						}
					]
				: []
		})
	}

	private toSprintPatch(sprint: Partial<IProjectSprint>): XpertProjectSprintPatch | undefined {
		const { id: sprintId, ...sprintPatch } = sprint
		const id = this.asString(sprintId)
		return id
			? {
					...sprintPatch,
					id
				}
			: undefined
	}

	private toSwimlanePatches(swimlanes: Array<Partial<IProjectSwimlane>>): XpertProjectSwimlanePatch[] {
		return swimlanes.flatMap((swimlane) => {
			const { id: swimlaneId, ...swimlanePatch } = swimlane
			const id = this.asString(swimlaneId)
			return id
				? [
						{
							...swimlanePatch,
							id
						}
					]
				: []
		})
	}

	private resolveProjectScope(
		sprintId: string | undefined,
		options: z.infer<typeof configurableSchema>,
		context: IAgentMiddlewareContext,
		runtimeState: ProjectManagementState | null
	): ProjectManagementResolvedScope {
		const rawProjectId = this.asString(context.projectId) ?? null
		const rawSprintId =
			sprintId ??
			runtimeState?.sprintId ??
			options.defaultSprintId ??
			null

		if (!rawProjectId) {
			throw new Error('project_management middleware requires a projectId from middleware context')
		}

		return {
			projectId: normalizeRequiredBrandedId(rawProjectId, 'projectId', createProjectId),
			sprintId: this.normalizeOptionalSprintId(rawSprintId) ?? null
		}
	}

	private normalizeOptionalSprintId(value: unknown) {
		return normalizeOptionalBrandedId(value, 'sprintId', createSprintId, {
			blankAs: 'null'
		})
	}

	private normalizeOptionalTeamId(value: unknown, blankAs: 'null' | 'undefined') {
		return normalizeOptionalBrandedId(value, 'teamId', createTeamId, {
			blankAs
		})
	}

	private normalizeCreateTaskInput(task: {
		title?: string
		description?: string
		assignedAgentId?: string
		status?: ProjectTaskStatusEnum
		dependencies?: string[]
		teamId?: string | null
	}) {
		if (!task.title) {
			throw new Error('Task title is required')
		}

		return {
			title: task.title,
			description: task.description,
			assignedAgentId: task.assignedAgentId,
			status: task.status,
			dependencies: task.dependencies,
			teamId: this.normalizeOptionalTeamId(task.teamId, 'null')
		}
	}

	private normalizeUpdateTaskInput(task: {
		id?: string
		title?: string
		description?: string
		assignedAgentId?: string
		status?: ProjectTaskStatusEnum
		dependencies?: string[]
		teamId?: string | null
	}) {
		if (!task.id) {
			throw new Error('Task id is required')
		}

		return {
			...task,
			teamId: this.normalizeOptionalTeamId(task.teamId, 'null')
		}
	}

	private readState(): ProjectManagementState | null {
		try {
			const raw = getCurrentTaskInput<Record<string, unknown>>()
			if (!raw || typeof raw !== 'object') {
				return {}
			}

			const parsed = stateSchema.safeParse({
				sprintId: this.asNullableString(raw['sprintId']),
				backlogLaneId: this.asNullableString(raw['backlogLaneId']),
				strategyType: this.asProjectStrategy(raw['strategyType']),
				executionSnapshotSummary: this.asExecutionSummary(raw['executionSnapshotSummary'])
			})

			return parsed.success ? parsed.data : {}
		} catch {
			return null
		}
	}

	private asProjectStrategy(value: unknown) {
		return Object.values(ProjectSprintStrategyEnum).includes(value as ProjectSprintStrategyEnum)
			? (value as ProjectSprintStrategyEnum)
			: value === null
				? null
				: undefined
	}

	private asExecutionSummary(value: unknown) {
		if (value === null) {
			return null
		}
		if (!value || typeof value !== 'object') {
			return undefined
		}

		const blockedTaskCount = value['blockedTaskCount']
		const runnableTaskCount = value['runnableTaskCount']
		const laneCount = value['laneCount']
		if (
			typeof blockedTaskCount !== 'number' ||
			typeof runnableTaskCount !== 'number' ||
			typeof laneCount !== 'number'
		) {
			return undefined
		}

		return {
			blockedTaskCount,
			runnableTaskCount,
			laneCount
		}
	}

	private asString(value: unknown) {
		return typeof value === 'string' && value.trim() ? value.trim() : null
	}

	private asNullableString(value: unknown) {
		return value === null ? null : this.asString(value)
	}

	private withStateUpdate(update: ProjectManagementState, payload: unknown, config: unknown) {
		return new Command({
			update: {
				...update,
				messages: [
					{
						role: 'tool',
						content: JSON.stringify(payload),
						tool_call_id: getToolCallIdFromConfig(config ?? {}) ?? ''
					}
				]
			}
		})
	}
}
