import { ConflictException } from '@nestjs/common'
import { ProjectAssistantActionTypeEnum, ProjectSprintStrategyEnum } from '@xpert-ai/contracts'
import { ChatConversationService } from '../../chat-conversation/conversation.service'
import { HandoffQueueService } from '../../handoff/message-queue.service'
import { ProjectAssistantActionService } from './project-assistant-action.service'
import { ProjectAssistantService } from './project-assistant.service'

describe('ProjectAssistantActionService', () => {
	let service: ProjectAssistantActionService
	let projectAssistantService: {
		resolveProject: jest.Mock
		resolveSprint: jest.Mock
		createProjectSprint: jest.Mock
	}
	let conversationService: {
		findLatestByProject: jest.Mock
	}
	let handoffQueueService: {
		enqueue: jest.Mock
	}
	let commandBus: {
		execute: jest.Mock
	}

	beforeEach(() => {
		projectAssistantService = {
			resolveProject: jest.fn().mockResolvedValue({
				id: 'project-1',
				mainAssistantId: 'assistant-1'
			}),
			resolveSprint: jest.fn().mockResolvedValue({
				id: 'sprint-1',
				projectId: 'project-1'
			}),
			createProjectSprint: jest.fn().mockResolvedValue({
				id: 'sprint-bootstrapped',
				projectId: 'project-1'
			})
		}
		conversationService = {
			findLatestByProject: jest.fn().mockResolvedValue(null)
		}
		handoffQueueService = {
			enqueue: jest.fn().mockResolvedValue({ id: 'dispatch-1' })
		}
		commandBus = {
			execute: jest.fn().mockResolvedValue({ id: 'conversation-1', status: 'idle' })
		}

		service = new ProjectAssistantActionService(
			projectAssistantService as unknown as ProjectAssistantService,
			conversationService as unknown as ChatConversationService,
			handoffQueueService as unknown as HandoffQueueService,
			commandBus as never
		)
	})

	it('rejects actions when the latest project conversation is busy', async () => {
		conversationService.findLatestByProject.mockResolvedValueOnce({
			id: 'conversation-busy',
			status: 'busy'
		})

		await expect(
			service.execute('project-1', {
				actionType: ProjectAssistantActionTypeEnum.ManageBacklog
			})
		).rejects.toBeInstanceOf(ConflictException)
	})

	it('bootstraps a sprint when needed and enqueues a project-scoped dispatch', async () => {
		projectAssistantService.resolveSprint.mockResolvedValueOnce(null)

		const result = await service.execute('project-1', {
			actionType: ProjectAssistantActionTypeEnum.ManageBacklog,
			instruction: 'Prepare the next sprint',
			bootstrapSprint: {
				goal: 'Ship the next milestone',
				strategyType: ProjectSprintStrategyEnum.SoftwareDelivery
			}
		})

		expect(projectAssistantService.createProjectSprint).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'project-1',
				goal: 'Ship the next milestone',
				strategyType: ProjectSprintStrategyEnum.SoftwareDelivery
			})
		)
		expect(handoffQueueService.enqueue).toHaveBeenCalledWith(
			expect.objectContaining({
				payload: expect.objectContaining({
					request: expect.objectContaining({
						projectId: 'project-1'
					})
				})
			})
		)
		expect(result).toEqual({
			accepted: true,
			conversationId: 'conversation-1',
			dispatchId: 'dispatch-1'
		})
	})

	it('rejects missing sprint context when bootstrap data is absent', async () => {
		projectAssistantService.resolveSprint.mockResolvedValueOnce(null)

		await expect(
			service.execute('project-1', {
				actionType: ProjectAssistantActionTypeEnum.ManageBacklog
			})
		).rejects.toBeInstanceOf(ConflictException)
	})
})
