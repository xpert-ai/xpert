import {
	IProjectAssistantActionAccepted,
	IProjectAssistantActionRequest,
	ProjectAssistantActionTypeEnum
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { ConflictException, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
	AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
	AgentChatDispatchPayload,
	HandoffMessage
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'crypto'
import { ChatConversationUpsertCommand } from '../../chat-conversation/commands/upsert.command'
import { ChatConversationService } from '../../chat-conversation/conversation.service'
import { HandoffQueueService } from '../../handoff/message-queue.service'
import { AGENT_CHAT_CALLBACK_NOOP_MESSAGE_TYPE } from '../../handoff/plugins/agent-chat/agent-chat-callback-noop.processor'
import { ProjectAssistantService } from './project-assistant.service'
import { buildManageBacklogPrompt } from '../prompts/manage-backlog.prompt'

@Injectable()
export class ProjectAssistantActionService {
	constructor(
		private readonly projectAssistantService: ProjectAssistantService,
		private readonly conversationService: ChatConversationService,
		private readonly handoffQueueService: HandoffQueueService,
		private readonly commandBus: CommandBus
	) {}

	async execute(projectId: string, request: IProjectAssistantActionRequest): Promise<IProjectAssistantActionAccepted> {
		if (request.actionType !== ProjectAssistantActionTypeEnum.ManageBacklog) {
			throw new ConflictException(`Unsupported project assistant action: ${request.actionType}`)
		}

		const project = await this.projectAssistantService.resolveProject(projectId)
		if (!project.mainAssistantId) {
			throw new ConflictException('Project main assistant is not configured')
		}

		let sprint = await this.projectAssistantService.resolveSprint(projectId, request.sprintId)
		if (!sprint && request.bootstrapSprint) {
			sprint = await this.projectAssistantService.createProjectSprint({
				projectId,
				goal: request.bootstrapSprint.goal,
				strategyType: request.bootstrapSprint.strategyType
			})
		}

		if (!sprint) {
			throw new ConflictException('Project does not have a sprint to manage yet')
		}

		const boundTeams = await this.projectAssistantService.listProjectTeams(projectId)

		const latestConversation = await this.conversationService.findLatestByProject(projectId, project.mainAssistantId)
		if (latestConversation?.status === 'busy') {
			throw new ConflictException('Project assistant is already processing another backlog management pass')
		}

		const conversation =
			latestConversation ??
			(await this.commandBus.execute(
				new ChatConversationUpsertCommand({
					status: 'idle',
					xpertId: project.mainAssistantId,
					projectId,
					from: 'job'
				})
			))

		const dispatchMessage: HandoffMessage<AgentChatDispatchPayload> = {
			id: `project-assistant-${randomUUID()}`,
			type: AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
			version: 1,
			tenantId: RequestContext.currentTenantId(),
			sessionKey: conversation.id,
			businessKey: conversation.id,
			attempt: 1,
			maxAttempts: 1,
			enqueuedAt: Date.now(),
			traceId: conversation.id,
			payload: {
				request: {
					action: 'send',
					conversationId: conversation.id,
					projectId,
						message: {
							input: {
								input: buildManageBacklogPrompt({
									instruction: request.instruction,
									boundTeams: boundTeams.map(({ binding, team }) => ({
										name: team.name,
										role: binding.role ?? null
									}))
								})
							}
						}
					},
				options: {
					xpertId: project.mainAssistantId,
					from: 'job'
				},
				callback: {
					messageType: AGENT_CHAT_CALLBACK_NOOP_MESSAGE_TYPE
				}
			},
			headers: {
				...(RequestContext.getOrganizationId() ? { organizationId: RequestContext.getOrganizationId() } : {}),
				...(RequestContext.currentUserId() ? { userId: RequestContext.currentUserId() } : {})
			}
		}

		const dispatch = await this.handoffQueueService.enqueue(dispatchMessage)
		return {
			accepted: true,
			conversationId: conversation.id,
			dispatchId: dispatch.id
		}
	}
}
