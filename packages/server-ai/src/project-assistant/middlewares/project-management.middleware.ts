import { tool } from '@langchain/core/tools'
import { Command, getCurrentTaskInput } from '@langchain/langgraph'
import {
	createProjectId,
	createSprintId,
	createTeamId,
	getToolCallIdFromConfig,
	ProjectAgentRole,
	ProjectId,
	ProjectExecutionEnvironmentType,
	ProjectSprintStatusEnum,
	ProjectSprintStrategyEnum,
	SprintId,
	ProjectSwimlaneKindEnum,
	ProjectTaskStatusEnum,
	TAgentMiddlewareMeta
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
	AgentMiddleware,
	AgentMiddlewareStrategy,
	IAgentMiddlewareContext,
	IAgentMiddlewareStrategy,
	PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { normalizeOptionalBrandedId, normalizeRequiredBrandedId } from '../../shared/utils'
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

	constructor(private readonly projectAssistantService: ProjectAssistantService) {}

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
					return this.projectAssistantService.createProjectTasks({
						projectId: resolved.projectId,
						sprintId: resolved.sprintId,
						laneId: input.laneId,
						tasks: input.tasks.map((task) => this.normalizeCreateTaskInput(task))
					})
				},
				{
					name: 'createProjectTasks',
					description: 'Create one or more project tasks. Tasks default to the backlog lane unless a target lane is provided.',
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
					return this.projectAssistantService.updateProjectTasks({
						projectId: resolved.projectId,
						tasks: input.tasks.map((task) => this.normalizeUpdateTaskInput(task))
					})
				},
				{
					name: 'updateProjectTasks',
					description: 'Update task title, description, assigned agent, status, or dependencies.',
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
					return this.projectAssistantService.reorderProjectTasks(
						resolved.projectId,
						input.laneId,
						input.orderedTaskIds
					)
				},
				{
					name: 'reorderProjectTasks',
					description: 'Reorder tasks within a single swimlane.',
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
					return this.projectAssistantService.moveProjectTasks(
						resolved.projectId,
						input.taskIds,
						input.targetLaneId
					)
				},
				{
					name: 'moveProjectTasks',
					description: 'Move tasks between backlog and execution lanes. Cross-sprint carry-over is limited to backlog-to-backlog moves.',
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
					return this.projectAssistantService.updateProjectSprint({
						projectId: resolved.projectId,
						sprintId: normalizeRequiredBrandedId(input.sprintId, 'sprintId', createSprintId),
						goal: input.goal,
						status: input.status,
						retrospective: input.retrospective,
						startAt: input.startAt ? new Date(input.startAt) : undefined,
						endAt: input.endAt ? new Date(input.endAt) : undefined
					})
				},
				{
					name: 'updateProjectSprint',
					description: 'Update sprint goal, status, retrospective, or timebox.',
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
					return this.projectAssistantService.updateProjectSwimlanes({
						projectId: resolved.projectId,
						swimlanes: input.swimlanes
					})
				},
				{
					name: 'updateProjectSwimlanes',
					description: 'Update execution swimlane priority, weight, concurrency, WIP, agent role, or environment.',
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
					schema: z.object({
						sprintId: z.string().optional()
					})
				}
			)
		]
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
						tool_call_id: getToolCallIdFromConfig(config) ?? ''
					}
				]
			}
		})
	}
}
