import { DynamicStructuredTool } from '@langchain/core/tools'
import type { Observable } from 'rxjs'
import {
	ChatMessageEventTypeEnum,
	ChatMessageTypeEnum,
	ProjectTaskExecutionOutcomeEnum,
	ProjectTaskExecutionStatusEnum,
	ProjectTaskStatusEnum,
	TChatRequest,
	XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { runWithRequestContext as runWithServerRequestContext } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import {
	defineAgentMessageType,
	HandoffMessage,
	HandoffProcessorStrategy,
	IHandoffProcessor,
	ProcessContext,
	ProcessResult,
	runWithRequestContext
} from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { z } from 'zod/v3'
import { ProjectCoreService } from '../project-core/project-core.service'
import { ProjectTaskExecution } from '../project-task/project-task-execution.entity'
import { ProjectTask } from '../project-task/project-task.entity'
import { TeamDefinitionService } from '../team-definition/team-definition.service'
import { XpertChatCommand } from '../xpert/commands/chat.command'

export const PROJECT_TASK_DISPATCH_MESSAGE_TYPE = defineAgentMessageType('project_task_dispatch', 1)

export interface ProjectTaskDispatchPayload extends Record<string, unknown> {
	taskExecutionId: string
}

const PROJECT_TASK_OUTCOME_TOOL_NAME = 'reportProjectTaskOutcome'

const taskOutcomeArtifactSchema = z.object({
	type: z.string().min(1),
	name: z.string().min(1),
	url: z.string().optional(),
	metadata: z.unknown().optional()
})

const taskOutcomeSchema = z.object({
	outcome: z.nativeEnum(ProjectTaskExecutionOutcomeEnum),
	summary: z.string().min(1),
	artifacts: z.array(taskOutcomeArtifactSchema).optional(),
	error: z.string().optional()
})

type ProjectTaskOutcomeInput = z.infer<typeof taskOutcomeSchema>

interface ProjectTaskOutcomeState {
	reported: boolean
}

interface ProjectTaskStreamResult {
	summary?: string
	messageStatus?: string
	messageError?: string
	conversationStatus?: string
	conversationError?: string
	interrupted?: boolean
}

@Injectable()
@HandoffProcessorStrategy(PROJECT_TASK_DISPATCH_MESSAGE_TYPE, {
	types: [PROJECT_TASK_DISPATCH_MESSAGE_TYPE],
	policy: {
		lane: 'main'
	}
})
export class ProjectTaskDispatchProcessor implements IHandoffProcessor<ProjectTaskDispatchPayload> {
	constructor(
		private readonly commandBus: CommandBus,
		@InjectRepository(ProjectTaskExecution)
		private readonly taskExecutionRepository: Repository<ProjectTaskExecution>,
		@InjectRepository(ProjectTask)
		private readonly taskRepository: Repository<ProjectTask>,
		private readonly teamDefinitionService: TeamDefinitionService,
		private readonly projectCoreService: ProjectCoreService
	) {}

	async process(message: HandoffMessage<ProjectTaskDispatchPayload>, ctx: ProcessContext): Promise<ProcessResult> {
		return this.runTaskWithRequestContext(message, () => this.processWithContext(message, ctx))
	}

	private async processWithContext(
		message: HandoffMessage<ProjectTaskDispatchPayload>,
		ctx: ProcessContext
	): Promise<ProcessResult> {
		const taskExecutionId = this.toNonEmptyString(message.payload?.taskExecutionId)
		if (!taskExecutionId) {
			return {
				status: 'dead',
				reason: 'Missing taskExecutionId in project task dispatch payload'
			}
		}

		const taskExecution = await this.taskExecutionRepository.findOneBy({ id: taskExecutionId })
		if (!taskExecution) {
			return {
				status: 'dead',
				reason: `Project task execution ${taskExecutionId} was not found`
			}
		}
		if (
			taskExecution.status === ProjectTaskExecutionStatusEnum.Success ||
			taskExecution.status === ProjectTaskExecutionStatusEnum.Failed
		) {
			return { status: 'ok' }
		}

		const task = await this.taskRepository.findOneBy({ id: taskExecution.taskId })
		if (!task) {
			await this.failTaskExecution(taskExecution, 'Project task was not found for dispatch.')
			return { status: 'ok' }
		}

		const team = await this.teamDefinitionService.findOne(taskExecution.teamId).catch(() => null)
		if (!team) {
			await this.failTaskExecution(taskExecution, 'Published team Xpert was not found for dispatch.')
			return { status: 'ok' }
		}
		const project = await this.projectCoreService.findOne(task.projectId).catch(() => null)
		if (!project) {
			await this.failTaskExecution(taskExecution, 'Project was not found for dispatch.')
			return { status: 'ok' }
		}
		if (project.mainAssistantId && team.leadAssistantId === project.mainAssistantId) {
			await this.failTaskExecution(
				taskExecution,
				'Project task dispatch cannot target the project main assistant.'
			)
			return { status: 'ok' }
		}

		await this.taskExecutionRepository.update(taskExecution.id, {
			status: ProjectTaskExecutionStatusEnum.Running,
			startedAt: taskExecution.startedAt ?? new Date(),
			dispatchId: message.id,
			xpertId: team.leadAssistantId
		})

		const outcomeState: ProjectTaskOutcomeState = { reported: false }
		const outcomeTool = this.createOutcomeTool(taskExecution, task, outcomeState)
		const request: TChatRequest = {
			action: 'send',
			projectId: task.projectId,
			message: {
				input: {
					input: buildProjectTaskWorkerPrompt(task)
				}
			}
		}

		try {
			const observable = await this.commandBus.execute<XpertChatCommand, Observable<MessageEvent>>(
				new XpertChatCommand(request, {
					xpertId: team.leadAssistantId,
					projectId: task.projectId,
					from: 'job',
					tools: [outcomeTool]
				})
			)
			const streamResult = await this.consumeChatStream(observable, taskExecution.id, ctx)

			if (!outcomeState.reported) {
				const fallbackError = this.getStreamCompletionError(streamResult)
				if (fallbackError) {
					await this.failTaskExecution(taskExecution, fallbackError)
				} else if (streamResult.summary) {
					await this.applyTaskOutcome(taskExecution, task, {
						outcome: ProjectTaskExecutionOutcomeEnum.Success,
						summary: streamResult.summary
					})
				} else {
					await this.failTaskExecution(taskExecution, 'missing_task_outcome')
				}
			}
		} catch (error) {
			await this.failTaskExecution(taskExecution, this.getErrorMessage(error))
		}

		return { status: 'ok' }
	}

	private createOutcomeTool(
		taskExecution: ProjectTaskExecution,
		task: ProjectTask,
		outcomeState: ProjectTaskOutcomeState
	) {
		return new DynamicStructuredTool({
			name: PROJECT_TASK_OUTCOME_TOOL_NAME,
			description:
				'Report the final project task outcome. Call this exactly once after the task is complete or failed.',
			schema: taskOutcomeSchema,
			func: async (input: ProjectTaskOutcomeInput) => {
				await this.applyTaskOutcome(taskExecution, task, input)
				outcomeState.reported = true
				return `Project task outcome recorded as ${input.outcome}.`
			}
		})
	}

	private async applyTaskOutcome(
		taskExecution: ProjectTaskExecution,
		task: ProjectTask,
		input: ProjectTaskOutcomeInput
	) {
		const completedAt = new Date()
		const executionStatus =
			input.outcome === ProjectTaskExecutionOutcomeEnum.Success
				? ProjectTaskExecutionStatusEnum.Success
				: ProjectTaskExecutionStatusEnum.Failed
		const taskStatus =
			input.outcome === ProjectTaskExecutionOutcomeEnum.Success
				? ProjectTaskStatusEnum.Done
				: ProjectTaskStatusEnum.Failed

		await Promise.all([
			this.taskExecutionRepository.update(taskExecution.id, {
				status: executionStatus,
				outcome: input.outcome,
				summary: input.summary,
				artifacts: input.artifacts ?? null,
				error: input.error ?? null,
				completedAt
			}),
			this.taskRepository.update(task.id, {
				status: taskStatus
			})
		])
	}

	private async failTaskExecution(taskExecution: ProjectTaskExecution, error: string) {
		await Promise.all([
			this.taskExecutionRepository.update(taskExecution.id, {
				status: ProjectTaskExecutionStatusEnum.Failed,
				outcome: ProjectTaskExecutionOutcomeEnum.Failed,
				error,
				completedAt: new Date()
			}),
			this.taskRepository.update(taskExecution.taskId, {
				status: ProjectTaskStatusEnum.Failed
			})
		])
	}

	private consumeChatStream(
		observable: Observable<MessageEvent>,
		taskExecutionId: string,
		ctx: ProcessContext
	): Promise<ProjectTaskStreamResult> {
		let chain = Promise.resolve()
		let subscription: { unsubscribe: () => void } | undefined
		const streamResult: ProjectTaskStreamResult = {}

		return new Promise((resolve, reject) => {
			const abort = () => {
				subscription?.unsubscribe()
				reject(new Error('Project task dispatch aborted'))
			}
			ctx.abortSignal.addEventListener('abort', abort, { once: true })

			subscription = observable.subscribe({
				next: (event) => {
					this.collectStreamResult(event, streamResult)
					chain = chain.then(() => this.recordChatEvent(taskExecutionId, event))
					chain.catch((error) => {
						subscription?.unsubscribe()
						reject(error)
					})
				},
				error: (error) => {
					chain
						.then(() => reject(error))
						.catch((chainError) => reject(chainError))
						.finally(() => ctx.abortSignal.removeEventListener('abort', abort))
				},
				complete: () => {
					chain
						.then(() => resolve(streamResult))
						.catch((error) => reject(error))
						.finally(() => ctx.abortSignal.removeEventListener('abort', abort))
				}
			})
		})
	}

	private async recordChatEvent(taskExecutionId: string, event: MessageEvent) {
		const payload = event.data
		if (readStringProperty(payload, 'type') !== ChatMessageTypeEnum.EVENT) {
			return
		}

		const eventName = readStringProperty(payload, 'event')
		const data = readObjectProperty(payload, 'data')
		if (eventName === ChatMessageEventTypeEnum.ON_CONVERSATION_START) {
			const conversationId = readStringProperty(data, 'id')
			if (conversationId) {
				await this.taskExecutionRepository.update(taskExecutionId, {
					conversationId
				})
			}
			return
		}

		if (eventName === ChatMessageEventTypeEnum.ON_MESSAGE_START) {
			const agentExecutionId = readStringProperty(data, 'executionId')
			if (agentExecutionId) {
				await this.taskExecutionRepository.update(taskExecutionId, {
					agentExecutionId
				})
			}
		}
	}

	private collectStreamResult(event: MessageEvent, result: ProjectTaskStreamResult) {
		const payload = event.data
		const type = readStringProperty(payload, 'type')
		if (type === ChatMessageTypeEnum.MESSAGE) {
			const text = this.toStreamText(readObjectProperty(payload, 'data'))
			if (text) {
				result.summary = normalizeTaskSummary(`${result.summary ?? ''}${text}`)
			}
			return
		}

		if (type !== ChatMessageTypeEnum.EVENT) {
			return
		}

		const eventName = readStringProperty(payload, 'event')
		const data = readObjectProperty(payload, 'data')
		if (eventName === ChatMessageEventTypeEnum.ON_MESSAGE_END) {
			result.messageStatus = readStringProperty(data, 'status') ?? result.messageStatus
			result.messageError = readStringProperty(data, 'error') ?? result.messageError
			const text = this.toStreamText(readObjectProperty(data, 'content'))
			if (text) {
				result.summary = normalizeTaskSummary(text)
			}
			return
		}

		if (eventName === ChatMessageEventTypeEnum.ON_CONVERSATION_END) {
			result.conversationStatus = readStringProperty(data, 'status') ?? result.conversationStatus
			result.conversationError = readStringProperty(data, 'error') ?? result.conversationError
			return
		}

		if (eventName === ChatMessageEventTypeEnum.ON_INTERRUPT) {
			result.interrupted = true
		}
	}

	private getStreamCompletionError(result: ProjectTaskStreamResult) {
		if (result.interrupted) {
			return 'project_task_interrupted'
		}
		if (result.messageError) {
			return result.messageError
		}
		if (result.conversationError) {
			return result.conversationError
		}
		if (result.messageStatus === XpertAgentExecutionStatusEnum.ERROR) {
			return 'Project task worker message ended with an error.'
		}
		if (result.messageStatus === XpertAgentExecutionStatusEnum.INTERRUPTED) {
			return 'project_task_interrupted'
		}
		if (result.conversationStatus === 'error') {
			return 'Project task conversation ended with an error.'
		}
		if (result.conversationStatus === 'interrupted') {
			return 'project_task_interrupted'
		}
		return null
	}

	private toStreamText(value: unknown) {
		if (typeof value === 'string') {
			return normalizeTaskSummary(value)
		}
		if (Array.isArray(value)) {
			const text = value
				.map((item) => this.toStreamText(item))
				.filter((item): item is string => Boolean(item))
				.join(' ')
			return text ? normalizeTaskSummary(text) : null
		}
		const type = readStringProperty(value, 'type')
		if (type === 'text' || type === 'reasoning') {
			const text = readStringProperty(value, 'text')
			return text ? normalizeTaskSummary(text) : null
		}
		return null
	}

	private async runTaskWithRequestContext(
		message: HandoffMessage<ProjectTaskDispatchPayload>,
		task: () => Promise<ProcessResult>
	): Promise<ProcessResult> {
		const userId = this.toNonEmptyString(message.headers?.userId)
		const organizationId = this.toNonEmptyString(message.headers?.organizationId)
		const language = this.toNonEmptyString(message.headers?.language)
		if (!userId && !organizationId && !language) {
			return task()
		}

		const headers: Record<string, string> = {
			['tenant-id']: message.tenantId,
			...(organizationId ? { ['organization-id']: organizationId } : {}),
			...(language ? { language } : {})
		}
		const user = userId
			? {
					id: userId,
					tenantId: message.tenantId
				}
			: undefined

		return new Promise<ProcessResult>((resolve, reject) => {
			runWithRequestContext(
				{
					user,
					headers
				},
				{},
				() => {
					runWithServerRequestContext(
						{
							user,
							headers
						},
						() => {
							task().then(resolve).catch(reject)
						}
					)
				}
			)
		})
	}

	private toNonEmptyString(value: unknown): string | undefined {
		return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
	}

	private getErrorMessage(error: unknown) {
		if (error instanceof Error) {
			return error.message
		}
		if (typeof error === 'string') {
			return error
		}
		return 'Unknown project task execution error'
	}
}

function buildProjectTaskWorkerPrompt(task: ProjectTask) {
	const lines = [
		'You are executing a Project OS task assigned to your bound Team.',
		`Task ID: ${task.id}`,
		`Project ID: ${task.projectId}`,
		`Sprint ID: ${task.sprintId}`,
		`Title: ${task.title}`,
		'Use your available tools to complete the work.',
		`The task is not complete until you call ${PROJECT_TASK_OUTCOME_TOOL_NAME}.`,
		`When finished, call ${PROJECT_TASK_OUTCOME_TOOL_NAME} exactly once with outcome, summary, and any artifacts.`,
		`If you cannot complete the work, call ${PROJECT_TASK_OUTCOME_TOOL_NAME} with outcome "failed" and an error.`
	]

	if (task.description?.trim()) {
		lines.splice(5, 0, `Description: ${task.description.trim()}`)
	}

	return lines.join('\n')
}

function readObjectProperty(value: unknown, property: string): unknown {
	if (!value || typeof value !== 'object') {
		return undefined
	}
	return Reflect.get(value, property)
}

function readStringProperty(value: unknown, property: string): string | undefined {
	const propertyValue = readObjectProperty(value, property)
	return typeof propertyValue === 'string' ? propertyValue : undefined
}

function normalizeTaskSummary(value: string) {
	const normalized = value.replace(/\s+/g, ' ').trim()
	return normalized.length > 2000 ? `${normalized.slice(0, 1997)}...` : normalized
}
