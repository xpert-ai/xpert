jest.mock('@xpert-ai/chatkit-types', () => ({
	STATE_VARIABLE_HUMAN: 'human',
	ChatMessageTypeEnum: {
		MESSAGE: 'message',
		EVENT: 'event'
	},
	ChatMessageEventTypeEnum: {
		ON_CONVERSATION_START: 'on_conversation_start',
		ON_MESSAGE_START: 'on_message_start',
		ON_MESSAGE_END: 'on_message_end',
		ON_AGENT_START: 'on_agent_start',
		ON_AGENT_END: 'on_agent_end',
		ON_INTERRUPT: 'on_interrupt',
		ON_TOOL_MESSAGE: 'on_tool_message',
		ON_TOOL_ERROR: 'on_tool_error',
		ON_CHAT_EVENT: 'on_chat_event'
	},
	ChatMessageStepCategory: {}
}))

import {
	isXpertEventRecord,
	mapChatMessageToXpertEvent,
	matchesXpertEventFilter,
	XPERT_EVENT_TYPES,
	XpertEvent
} from './index'
import type { XpertProjectBoardChangedEventPayload } from './index'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '../ai'
import { ProjectTaskStatusEnum } from '../project/project-task.model'

describe('event-system contracts', () => {
	it('maps chat message deltas to dot-case events', () => {
		const event = mapChatMessageToXpertEvent(
			{
				data: {
					type: ChatMessageTypeEnum.MESSAGE,
					data: 'hello'
				}
			},
			{
				conversationId: 'conversation-1',
				projectId: 'project-1'
			}
		)

		expect(event).toEqual({
			type: XPERT_EVENT_TYPES.ChatMessageDelta,
			scope: {
				conversationId: 'conversation-1',
				projectId: 'project-1'
			},
			source: {
				type: 'chat',
				id: 'conversation-1'
			},
			payload: 'hello',
			meta: undefined
		})
	})

	it('maps agent lifecycle events and extracts execution scope', () => {
		const event = mapChatMessageToXpertEvent({
			data: {
				type: ChatMessageTypeEnum.EVENT,
				event: ChatMessageEventTypeEnum.ON_AGENT_END,
				data: {
					id: 'execution-1',
					agentKey: 'agent-1'
				}
			}
		})

		expect(event?.type).toBe(XPERT_EVENT_TYPES.AgentExecutionEnded)
		expect(event?.scope.agentExecutionId).toBe('execution-1')
	})

	it('matches event filters by type and scope', () => {
		const event: XpertEvent = {
			id: 'event-1',
			type: XPERT_EVENT_TYPES.ProjectTaskExecutionSucceeded,
			version: 1,
			scope: {
				projectId: 'project-1',
				taskId: 'task-1'
			},
			source: {
				type: 'project',
				id: 'execution-1'
			},
			payload: {},
			timestamp: 1
		}

		expect(matchesXpertEventFilter(event, { projectId: 'project-1' })).toBe(true)
		expect(matchesXpertEventFilter(event, { projectId: 'project-2' })).toBe(false)
		expect(matchesXpertEventFilter(event, { type: XPERT_EVENT_TYPES.ProjectTaskExecutionSucceeded })).toBe(true)
	})

	it('defines project board changed events for project UI state patches', () => {
		const payload: XpertProjectBoardChangedEventPayload = {
			operation: 'task.updated',
			projectId: 'project-1',
			sprintId: 'sprint-1',
			tasks: [
				{
					id: 'task-1',
					status: ProjectTaskStatusEnum.Done
				}
			]
		}
		const event: XpertEvent<XpertProjectBoardChangedEventPayload> = {
			id: 'event-1',
			type: XPERT_EVENT_TYPES.ProjectBoardChanged,
			version: 1,
			scope: {
				projectId: 'project-1'
			},
			source: {
				type: 'tool',
				id: 'project_management.updateProjectTasks'
			},
			payload,
			timestamp: 1
		}

		expect(event.type).toBe('project.board_changed')
		expect(matchesXpertEventFilter(event, {
			type: XPERT_EVENT_TYPES.ProjectBoardChanged,
			projectId: 'project-1'
		})).toBe(true)
	})

	it('guards event records', () => {
		expect(
			isXpertEventRecord({
				id: 'event-1',
				streamId: '1-0',
				type: XPERT_EVENT_TYPES.ChatEvent,
				version: 1,
				scope: {},
				source: {
					type: 'chat',
					id: 'chat'
				},
				payload: {},
				timestamp: 1
			})
		).toBe(true)
	})
})
