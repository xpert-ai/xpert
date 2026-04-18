import { tool } from '@langchain/core/tools'
import { Command, getCurrentTaskInput } from '@langchain/langgraph'
import {
	getToolCallIdFromConfig,
	ProjectAgentRole,
	ProjectExecutionEnvironmentType,
	ProjectSprintStatusEnum,
	ProjectSprintStrategyEnum,
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
import { ProjectAssistantService } from '../services/project-assistant.service'

const PROJECT_MANAGEMENT_MIDDLEWARE_PROVIDER = 'project_management'

const configurableSchema = z.object({
	projectId: z.string().optional(),
	defaultSprintId: z.string().optional()
})

const stateSchema = z.object({
	projectId: z.string().nullable().optional(),
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
				projectId: {
					type: 'string'
				},
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
					const resolved = this.resolveProjectRuntime(input.projectId, options, context, this.readState())
					const result = await this.projectAssistantService.getProjectContext(resolved.projectId, input.sprintId ?? resolved.sprintId)
					return this.withStateUpdate(
						{
							projectId: result.project.id,
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
					description: 'Get the current project, sprint, backlog lane, execution lanes, board task counts, and execution snapshot.',
					schema: z.object({
						projectId: z.string().optional(),
						sprintId: z.string().optional()
					})
				}
			),
			tool(
				async (input) => {
					const resolved = this.resolveProjectRuntime(input.projectId, options, context, this.readState())
					return this.projectAssistantService.listProjectTasks({
						projectId: resolved.projectId,
						sprintId: input.sprintId ?? resolved.sprintId,
						laneId: input.laneId,
						laneKind: input.laneKind,
						status: input.status,
						query: input.query
					})
				},
				{
					name: 'listProjectTasks',
					description: 'List project tasks filtered by sprint, lane, lane kind, status, or search query.',
					schema: z.object({
						projectId: z.string().optional(),
						sprintId: z.string().optional(),
						laneId: z.string().optional(),
						laneKind: z.nativeEnum(ProjectSwimlaneKindEnum).optional(),
						status: z.nativeEnum(ProjectTaskStatusEnum).optional(),
						query: z.string().optional()
					})
				}
			),
			tool(
				async (input) => {
					const resolved = this.resolveProjectRuntime(input.projectId, options, context, this.readState())
					return this.projectAssistantService.createProjectTasks({
						projectId: resolved.projectId,
						sprintId: input.sprintId ?? resolved.sprintId,
						laneId: input.laneId,
						tasks: input.tasks.map((task) => {
							if (!task.title) {
								throw new Error('Task title is required')
							}

							return {
								title: task.title,
								description: task.description,
								assignedAgentId: task.assignedAgentId,
								status: task.status,
								dependencies: task.dependencies
							}
						})
					})
				},
				{
					name: 'createProjectTasks',
					description: 'Create one or more project tasks. Tasks default to the backlog lane unless a target lane is provided.',
					schema: z.object({
						projectId: z.string().optional(),
						sprintId: z.string().optional(),
						laneId: z.string().optional(),
						tasks: z.array(
							z.object({
								title: z.string(),
								description: z.string().optional(),
								assignedAgentId: z.string().optional(),
								status: z.nativeEnum(ProjectTaskStatusEnum).optional(),
								dependencies: z.array(z.string()).optional()
							})
						)
					})
				}
			),
			tool(
				async (input) => {
					const resolved = this.resolveProjectRuntime(input.projectId, options, context, this.readState())
					return this.projectAssistantService.updateProjectTasks({
						projectId: resolved.projectId,
						tasks: input.tasks
					})
				},
				{
					name: 'updateProjectTasks',
					description: 'Update task title, description, assigned agent, status, or dependencies.',
					schema: z.object({
						projectId: z.string().optional(),
						tasks: z.array(
							z.object({
								id: z.string(),
								title: z.string().optional(),
								description: z.string().optional(),
								assignedAgentId: z.string().optional(),
								status: z.nativeEnum(ProjectTaskStatusEnum).optional(),
								dependencies: z.array(z.string()).optional()
							})
						)
					})
				}
			),
			tool(
				async (input) => {
					const resolved = this.resolveProjectRuntime(input.projectId, options, context, this.readState())
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
						projectId: z.string().optional(),
						laneId: z.string(),
						orderedTaskIds: z.array(z.string())
					})
				}
			),
			tool(
				async (input) => {
					const resolved = this.resolveProjectRuntime(input.projectId, options, context, this.readState())
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
						projectId: z.string().optional(),
						taskIds: z.array(z.string()),
						targetLaneId: z.string()
					})
				}
			),
			tool(
				async (input, config) => {
					const resolved = this.resolveProjectRuntime(input.projectId, options, context, this.readState())
					const sprint = await this.projectAssistantService.createProjectSprint({
						projectId: resolved.projectId,
						goal: input.goal,
						strategyType: input.strategyType,
						status: input.status,
						startAt: input.startAt ? new Date(input.startAt) : undefined,
						endAt: input.endAt ? new Date(input.endAt) : undefined,
						carryOverSprintId: input.carryOverSprintId
					})
					const nextContext = await this.projectAssistantService.resolveContext(resolved.projectId, sprint.id)
					return this.withStateUpdate(
						{
							projectId: resolved.projectId,
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
						projectId: z.string().optional(),
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
					const resolved = this.resolveProjectRuntime(input.projectId, options, context, this.readState())
					return this.projectAssistantService.updateProjectSprint({
						projectId: resolved.projectId,
						sprintId: input.sprintId,
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
						projectId: z.string().optional(),
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
					const resolved = this.resolveProjectRuntime(input.projectId, options, context, this.readState())
					return this.projectAssistantService.updateProjectSwimlanes({
						projectId: resolved.projectId,
						swimlanes: input.swimlanes
					})
				},
				{
					name: 'updateProjectSwimlanes',
					description: 'Update execution swimlane priority, weight, concurrency, WIP, agent role, or environment.',
					schema: z.object({
						projectId: z.string().optional(),
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
					const resolved = this.resolveProjectRuntime(input.projectId, options, context, this.readState())
					return this.projectAssistantService.getProjectExecutionSnapshot(
						resolved.projectId,
						input.sprintId ?? resolved.sprintId
					)
				},
				{
					name: 'getProjectExecutionSnapshot',
					description: 'Get the orchestrator execution snapshot for the current sprint.',
					schema: z.object({
						projectId: z.string().optional(),
						sprintId: z.string().optional()
					})
				}
			)
		]
	}

	private resolveProjectRuntime(
		projectId: string | undefined,
		options: z.infer<typeof configurableSchema>,
		context: IAgentMiddlewareContext,
		runtimeState: ProjectManagementState | null
	) {
		const resolvedProjectId =
			projectId ??
			this.asString(context.projectId) ??
			options.projectId ??
			runtimeState?.projectId ??
			null
		const resolvedSprintId =
			options.defaultSprintId ??
			runtimeState?.sprintId ??
			null

		if (!resolvedProjectId) {
			throw new Error('project_management middleware requires a projectId from runtime context or middleware options')
		}

		return {
			projectId: resolvedProjectId,
			sprintId: resolvedSprintId
		}
	}

	private readState(): ProjectManagementState | null {
		try {
			const raw = getCurrentTaskInput<Record<string, unknown>>()
			if (!raw || typeof raw !== 'object') {
				return {}
			}

			const parsed = stateSchema.safeParse({
				projectId: this.asNullableString(raw['projectId']),
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
