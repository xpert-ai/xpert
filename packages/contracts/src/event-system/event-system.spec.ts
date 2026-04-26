import {
	isXpertEventRecord,
	mapChatMessageToXpertEvent,
	matchesXpertEventFilter,
	XPERT_EVENT_TYPES,
	XpertEvent
} from './index'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '../ai/chat-message-event-type.model'

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
