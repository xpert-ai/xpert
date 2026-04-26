import {
	ChatMessageEventTypeEnum,
	ChatMessageTypeEnum,
	createProjectId,
	createSprintId,
	createTeamId,
	createXpertId,
	ProjectTaskExecutionOutcomeEnum,
	ProjectTaskExecutionStatusEnum,
	ProjectTaskStatusEnum,
	XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { CommandBus } from '@nestjs/cqrs'
import { HandoffMessage, ProcessContext } from '@xpert-ai/plugin-sdk'
import { of } from 'rxjs'
import { Repository } from 'typeorm'
import { ProjectCoreService } from '../project-core/project-core.service'
import { ProjectTaskExecution } from '../project-task/project-task-execution.entity'
import { ProjectTask } from '../project-task/project-task.entity'
import { TeamDefinitionService } from '../team-definition/team-definition.service'
import { XpertChatCommand } from '../xpert/commands/chat.command'
import { PROJECT_TASK_DISPATCH_MESSAGE_TYPE } from './project-task-dispatch.constants'
import { ProjectTaskDispatchPayload, ProjectTaskDispatchProcessor } from './project-task-dispatch.processor'

jest.mock('../team-definition/team-definition.service', () => ({
	TeamDefinitionService: class TeamDefinitionService {}
}))
jest.mock('../project-core/project-core.service', () => ({
	ProjectCoreService: class ProjectCoreService {}
}))

describe('ProjectTaskDispatchProcessor', () => {
	let processor: ProjectTaskDispatchProcessor
	let commandBus: { execute: jest.Mock }
	let taskExecutionRepository: {
		findOneBy: jest.Mock
		update: jest.Mock
	}
	let taskRepository: {
		findOneBy: jest.Mock
		update: jest.Mock
	}
	let teamDefinitionService: {
		findOne: jest.Mock
	}
	let projectCoreService: {
		findOne: jest.Mock
	}
	const projectId = createProjectId('project-1')
	const sprintId = createSprintId('sprint-1')
	const teamId = createTeamId('team-1')
	const xpertId = createXpertId('xpert-1')
	const taskExecution = {
		id: 'execution-1',
		projectId,
		sprintId,
		taskId: 'task-1',
		teamId,
		xpertId,
		dispatchId: 'dispatch-1',
		status: ProjectTaskExecutionStatusEnum.Pending
	} as ProjectTaskExecution
	const task = {
		id: 'task-1',
		projectId,
		sprintId,
		title: 'Implement feature',
		status: ProjectTaskStatusEnum.Doing
	} as ProjectTask

	beforeEach(() => {
		commandBus = {
			execute: jest.fn()
		}
		taskExecutionRepository = {
			findOneBy: jest.fn().mockResolvedValue(taskExecution),
			update: jest.fn().mockResolvedValue({ affected: 1 })
		}
		taskRepository = {
			findOneBy: jest.fn().mockResolvedValue(task),
			update: jest.fn().mockResolvedValue({ affected: 1 })
		}
		teamDefinitionService = {
			findOne: jest.fn().mockResolvedValue({
				id: teamId,
				leadAssistantId: xpertId
			})
		}
		projectCoreService = {
			findOne: jest.fn().mockResolvedValue({
				id: projectId,
				mainAssistantId: createXpertId('assistant-main')
			})
		}

		processor = new ProjectTaskDispatchProcessor(
			commandBus as unknown as CommandBus,
			taskExecutionRepository as unknown as Repository<ProjectTaskExecution>,
			taskRepository as unknown as Repository<ProjectTask>,
			teamDefinitionService as unknown as TeamDefinitionService,
			projectCoreService as unknown as ProjectCoreService
		)
	})

	it('records successful outcomes and marks the task done', async () => {
		commandBus.execute.mockImplementationOnce(async (command: XpertChatCommand) => {
			const tool = command.options.tools?.[0]
			if (!tool || typeof tool.invoke !== 'function') {
				throw new Error('Missing task outcome tool')
			}
			await tool.invoke({
				outcome: ProjectTaskExecutionOutcomeEnum.Success,
				summary: 'Implemented feature'
			})
			return of(
				createChatEvent(ChatMessageEventTypeEnum.ON_CONVERSATION_START, { id: 'conversation-1' }),
				createChatEvent(ChatMessageEventTypeEnum.ON_MESSAGE_START, { executionId: 'agent-execution-1' })
			)
		})

		await processor.process(createMessage(), createContext())

		expect(commandBus.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				options: expect.objectContaining({
					xpertId,
					projectId,
					from: 'job'
				})
			})
		)
		expect(commandBus.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				options: expect.not.objectContaining({
					taskId: 'task-1'
				})
			})
		)
		expect(taskExecutionRepository.update).toHaveBeenCalledWith(
			'execution-1',
			expect.objectContaining({
				status: ProjectTaskExecutionStatusEnum.Success,
				outcome: ProjectTaskExecutionOutcomeEnum.Success,
				summary: 'Implemented feature'
			})
		)
		expect(taskRepository.update).toHaveBeenCalledWith('task-1', {
			status: ProjectTaskStatusEnum.Done
		})
		expect(taskExecutionRepository.update).toHaveBeenCalledWith('execution-1', {
			conversationId: 'conversation-1'
		})
		expect(taskExecutionRepository.update).toHaveBeenCalledWith('execution-1', {
			agentExecutionId: 'agent-execution-1'
		})
	})

	it('fails the task when the worker does not report an outcome', async () => {
		commandBus.execute.mockResolvedValueOnce(of())

		await processor.process(createMessage(), createContext())

		expect(taskExecutionRepository.update).toHaveBeenCalledWith(
			'execution-1',
			expect.objectContaining({
				status: ProjectTaskExecutionStatusEnum.Failed,
				outcome: ProjectTaskExecutionOutcomeEnum.Failed,
				error: 'missing_task_outcome'
			})
		)
		expect(taskRepository.update).toHaveBeenCalledWith('task-1', {
			status: ProjectTaskStatusEnum.Failed
		})
	})

	it('uses the final worker message as a successful fallback when no outcome tool is called', async () => {
		commandBus.execute.mockResolvedValueOnce(
			of(
				createChatEvent(ChatMessageEventTypeEnum.ON_CONVERSATION_START, { id: 'conversation-1' }),
				createChatEvent(ChatMessageEventTypeEnum.ON_MESSAGE_START, { executionId: 'agent-execution-1' }),
				createChatMessage('Implemented the feature.'),
				createChatEvent(ChatMessageEventTypeEnum.ON_MESSAGE_END, {
					status: XpertAgentExecutionStatusEnum.SUCCESS,
					content: 'Implemented the feature.'
				}),
				createChatEvent(ChatMessageEventTypeEnum.ON_CONVERSATION_END, {
					status: 'idle'
				})
			)
		)

		await processor.process(createMessage(), createContext())

		expect(taskExecutionRepository.update).toHaveBeenCalledWith(
			'execution-1',
			expect.objectContaining({
				status: ProjectTaskExecutionStatusEnum.Success,
				outcome: ProjectTaskExecutionOutcomeEnum.Success,
				summary: 'Implemented the feature.'
			})
		)
		expect(taskRepository.update).toHaveBeenCalledWith('task-1', {
			status: ProjectTaskStatusEnum.Done
		})
	})

	it('keeps a stream error as a failed task when no outcome tool is called', async () => {
		commandBus.execute.mockResolvedValueOnce(
			of(
				createChatEvent(ChatMessageEventTypeEnum.ON_MESSAGE_END, {
					status: XpertAgentExecutionStatusEnum.ERROR,
					error: 'Worker failed'
				})
			)
		)

		await processor.process(createMessage(), createContext())

		expect(taskExecutionRepository.update).toHaveBeenCalledWith(
			'execution-1',
			expect.objectContaining({
				status: ProjectTaskExecutionStatusEnum.Failed,
				outcome: ProjectTaskExecutionOutcomeEnum.Failed,
				error: 'Worker failed'
			})
		)
		expect(taskRepository.update).toHaveBeenCalledWith('task-1', {
			status: ProjectTaskStatusEnum.Failed
		})
	})

	it('fails the task when the published team Xpert no longer resolves', async () => {
		teamDefinitionService.findOne.mockRejectedValueOnce(new Error('not found'))

		await processor.process(createMessage(), createContext())

		expect(commandBus.execute).not.toHaveBeenCalled()
		expect(taskExecutionRepository.update).toHaveBeenCalledWith(
			'execution-1',
			expect.objectContaining({
				status: ProjectTaskExecutionStatusEnum.Failed,
				outcome: ProjectTaskExecutionOutcomeEnum.Failed,
				error: 'Published team Xpert was not found for dispatch.'
			})
		)
		expect(taskRepository.update).toHaveBeenCalledWith('task-1', {
			status: ProjectTaskStatusEnum.Failed
		})
	})

	it('fails the task when the team is backed by the project main assistant', async () => {
		teamDefinitionService.findOne.mockResolvedValueOnce({
			id: teamId,
			leadAssistantId: createXpertId('assistant-main')
		})

		await processor.process(createMessage(), createContext())

		expect(commandBus.execute).not.toHaveBeenCalled()
		expect(taskExecutionRepository.update).toHaveBeenCalledWith(
			'execution-1',
			expect.objectContaining({
				status: ProjectTaskExecutionStatusEnum.Failed,
				outcome: ProjectTaskExecutionOutcomeEnum.Failed,
				error: 'Project task dispatch cannot target the project main assistant.'
			})
		)
		expect(taskRepository.update).toHaveBeenCalledWith('task-1', {
			status: ProjectTaskStatusEnum.Failed
		})
	})

	function createMessage(): HandoffMessage<ProjectTaskDispatchPayload> {
		return {
			id: 'dispatch-1',
			type: PROJECT_TASK_DISPATCH_MESSAGE_TYPE,
			version: 1,
			tenantId: 'tenant-1',
			sessionKey: 'execution-1',
			businessKey: 'execution-1',
			attempt: 1,
			maxAttempts: 1,
			enqueuedAt: Date.now(),
			traceId: 'execution-1',
			payload: {
				taskExecutionId: 'execution-1'
			}
		}
	}

	function createContext(): ProcessContext {
		return {
			runId: 'dispatch-1',
			traceId: 'execution-1',
			abortSignal: new AbortController().signal,
			emit: jest.fn()
		}
	}

	function createChatEvent(event: ChatMessageEventTypeEnum, data: unknown): MessageEvent {
		return {
			data: {
				type: ChatMessageTypeEnum.EVENT,
				event,
				data
			}
		} as MessageEvent
	}

	function createChatMessage(data: unknown): MessageEvent {
		return {
			data: {
				type: ChatMessageTypeEnum.MESSAGE,
				data
			}
		} as MessageEvent
	}
})
